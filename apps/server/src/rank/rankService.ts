import type { Db } from 'mongodb';
import type { Redis as RedisClient } from 'ioredis';
import {
  type PlayerProfile,
  type RankedTier,
  type SeasonResult,
  type RankStatusResponse,
  type RankedLeaderboardResponse,
  getRankedTier,
  RATING_DELTAS,
  getUtcSeasonString,
  getRankedLeaderboardKey,
} from '@flagora/shared';
import {
  getTopLeaderboard,
  getPlayerLeaderboardRank,
} from '../leaderboard/leaderboardService.js';
import { getRedis } from '../db/redis.js';
import { evaluateBadges } from '../badge/badgeService.js';

function getSafeRedis(redis?: RedisClient | null): RedisClient | null {
  if (redis) {
    return redis;
  }
  try {
    return getRedis();
  } catch {
    return null;
  }
}

export function calculateRatingDelta(outcome: 'win' | 'loss' | 'tie'): number {
  if (outcome === 'win') {
    return RATING_DELTAS.WIN;
  }
  if (outcome === 'loss') {
    return RATING_DELTAS.LOSS;
  }
  return RATING_DELTAS.TIE;
}

export async function ensureCurrentSeason(
  profile: PlayerProfile,
  db: Db,
  redis?: RedisClient | null,
  now: Date = new Date(),
): Promise<PlayerProfile> {
  const currentSeason = getUtcSeasonString(now);
  const lastSeason = profile.currentSeason;

  if (lastSeason === currentSeason) {
    return profile;
  }

  const effectiveRedis = getSafeRedis(redis);

  if (lastSeason) {
    const finalRating = profile.battleRating ?? 0;
    const finalTier = getRankedTier(finalRating);
    let finalRank: number | null = null;

    if (effectiveRedis) {
      try {
        const rankIdx = await effectiveRedis.zrevrank(
          getRankedLeaderboardKey(lastSeason),
          String(profile.telegramUserId),
        );
        if (rankIdx !== null) {
          finalRank = rankIdx + 1;
        }
      } catch {
        finalRank = null;
      }
    }

    if (finalRank === null) {
      try {
        const higherCount = await db
          .collection<PlayerProfile>('profiles')
          .countDocuments({
            currentSeason: lastSeason,
            battleRating: { $gt: finalRating },
          });
        finalRank = higherCount + 1;
      } catch {
        finalRank = null;
      }
    }

    const seasonResult: SeasonResult = {
      telegramUserId: profile.telegramUserId,
      season: lastSeason,
      finalRating,
      finalTier,
      finalRank,
      archivedAt: now,
    };

    await db.collection<SeasonResult>('season_results').updateOne(
      { telegramUserId: profile.telegramUserId, season: lastSeason },
      { $set: seasonResult },
      { upsert: true },
    );

    if (finalRank !== null && finalRank > 0 && finalRank <= 100) {
      await evaluateBadges(
        profile.telegramUserId,
        {
          type: 'season_archived',
          season: lastSeason,
          finalRank,
        },
        db,
        now,
      );
    }

    await db.collection<PlayerProfile>('profiles').updateOne(
      { telegramUserId: profile.telegramUserId },
      {
        $set: {
          battleRating: 0,
          currentSeason,
          updatedAt: now,
        },
      },
    );

    return {
      ...profile,
      battleRating: 0,
      currentSeason,
      updatedAt: now,
    };
  }

  await db.collection<PlayerProfile>('profiles').updateOne(
    { telegramUserId: profile.telegramUserId },
    {
      $set: {
        currentSeason,
        updatedAt: now,
      },
    },
  );

  return {
    ...profile,
    currentSeason,
    updatedAt: now,
  };
}

export async function processBattleRatingUpdate(
  telegramUserId: number,
  outcome: 'win' | 'loss' | 'tie',
  db: Db,
  redis?: RedisClient | null,
  now: Date = new Date(),
): Promise<{
  oldRating: number;
  newRating: number;
  ratingDelta: number;
  tier: RankedTier;
  season: string;
  archivedPreviousSeason?: SeasonResult | null;
}> {
  const rawProfile = await db
    .collection<PlayerProfile>('profiles')
    .findOne({ telegramUserId });

  if (!rawProfile) {
    const defaultSeason = getUtcSeasonString(now);
    const delta = calculateRatingDelta(outcome);
    const newRating = Math.max(0, delta);
    return {
      oldRating: 0,
      newRating,
      ratingDelta: newRating,
      tier: getRankedTier(newRating),
      season: defaultSeason,
    };
  }

  const profile = await ensureCurrentSeason(rawProfile, db, redis, now);

  const oldRating = profile.battleRating ?? 0;
  const delta = calculateRatingDelta(outcome);
  const newRating = Math.max(0, oldRating + delta);
  const tier = getRankedTier(newRating);
  const season = profile.currentSeason || getUtcSeasonString(now);

  await db.collection<PlayerProfile>('profiles').updateOne(
    { telegramUserId },
    {
      $set: {
        battleRating: newRating,
        currentSeason: season,
        updatedAt: now,
      },
    },
  );

  const effectiveRedis = getSafeRedis(redis);
  if (effectiveRedis) {
    try {
      await effectiveRedis.zadd(
        getRankedLeaderboardKey(season),
        newRating,
        String(telegramUserId),
      );
    } catch {
      void 0;
    }
  }

  return {
    oldRating,
    newRating,
    ratingDelta: newRating - oldRating,
    tier,
    season,
  };
}

export async function getRankStatus(
  telegramUserId: number,
  db: Db,
  redis?: RedisClient | null,
  now: Date = new Date(),
): Promise<RankStatusResponse> {
  const currentSeason = getUtcSeasonString(now);
  const rawProfile = await db
    .collection<PlayerProfile>('profiles')
    .findOne({ telegramUserId });

  if (!rawProfile) {
    return {
      season: currentSeason,
      battleRating: 0,
      tier: 'Bronze',
      rank: null,
    };
  }

  const profile = await ensureCurrentSeason(rawProfile, db, redis, now);

  const season = profile.currentSeason || currentSeason;
  const rating = profile.battleRating ?? 0;
  const tier = getRankedTier(rating);

  const rankInfo = await getPlayerLeaderboardRank(
    telegramUserId,
    getSafeRedis(redis),
    getRankedLeaderboardKey(season),
    db,
  );

  return {
    season,
    battleRating: rating,
    tier,
    rank: rankInfo.ranked ? rankInfo.rank : null,
  };
}

export async function getRankedLeaderboard(
  telegramUserId: number,
  db: Db,
  redis?: RedisClient | null,
  limit = 50,
  now: Date = new Date(),
): Promise<RankedLeaderboardResponse> {
  const season = getUtcSeasonString(now);
  const rawProfile = await db
    .collection<PlayerProfile>('profiles')
    .findOne({ telegramUserId });

  if (rawProfile) {
    await ensureCurrentSeason(rawProfile, db, redis, now);
  }

  const key = getRankedLeaderboardKey(season);
  const safeRedis = getSafeRedis(redis);
  const top = await getTopLeaderboard(limit, db, safeRedis, key);
  const me = await getPlayerLeaderboardRank(telegramUserId, safeRedis, key, db);

  return {
    season,
    top,
    me,
  };
}
