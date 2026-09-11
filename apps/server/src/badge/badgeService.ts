import type { Db } from 'mongodb';
import type { Redis as RedisClient } from 'ioredis';
import {
  type BadgeId,
  type PlayerBadge,
  type PlayerBadgeResponseItem,
  type FinishRunResponse,
  type PlayerProfile,
  getBadgeDefinition,
  getRankedLeaderboardKey,
} from '@flagora/shared';
import type { GameRun } from '../game/runTypes.js';

export type BadgeTriggerEvent =
  | {
      type: 'run_finished';
      run: GameRun;
      finalScore: FinishRunResponse;
    }
  | {
      type: 'streak_updated';
      currentStreak: number;
      longestStreak?: number;
    }
  | {
      type: 'season_archived';
      season: string;
      finalRank: number | null;
    };

export async function initBadgeCollection(db: Db): Promise<void> {
  const collection = db.collection<PlayerBadge>('player_badges');
  await collection.createIndex(
    { telegramUserId: 1, badgeId: 1, season: 1 },
    { unique: true },
  );
  await collection.createIndex({ telegramUserId: 1, earnedAt: -1 });
}

export async function awardBadge(
  telegramUserId: number,
  badgeId: BadgeId,
  season: string | null,
  db: Db,
  now: Date = new Date(),
): Promise<PlayerBadge | null> {
  const collection = db.collection<PlayerBadge>('player_badges');
  const existing = await collection.findOne({
    telegramUserId,
    badgeId,
    season: season ?? null,
  });

  if (existing) {
    return null;
  }

  const record: PlayerBadge = {
    telegramUserId,
    badgeId,
    earnedAt: now,
    season: season ?? null,
  };

  try {
    await collection.insertOne({ ...record });
    return record;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: number }).code === 11000
    ) {
      return null;
    }
    throw err;
  }
}

export async function evaluateBadges(
  telegramUserId: number,
  event: BadgeTriggerEvent,
  db: Db,
  now: Date = new Date(),
): Promise<PlayerBadge[]> {
  const awarded: PlayerBadge[] = [];

  if (event.type === 'run_finished') {
    const { run, finalScore } = event;

    if (finalScore.correctCount === 10) {
      const flawless = await awardBadge(telegramUserId, 'flawless_run', null, db, now);
      if (flawless) {
        awarded.push(flawless);
      }
    }

    const durationMs = run.runDurationMs ?? 60000;
    const leftoverTimeMs = durationMs - finalScore.timeUsedMs;
    if (finalScore.correctCount === 10 && leftoverTimeMs >= 20000) {
      const speed = await awardBadge(telegramUserId, 'speed_demon', null, db, now);
      if (speed) {
        awarded.push(speed);
      }
    }

    const tier4CountInRun = (run.flags || []).filter((f) => f.tier === 4 && f.correct).length;
    let totalTier4 = 0;

    if (tier4CountInRun > 0) {
      const updatedProfile = await db
        .collection<PlayerProfile>('profiles')
        .findOneAndUpdate(
          { telegramUserId },
          { $inc: { tier4CorrectCount: tier4CountInRun } },
          { returnDocument: 'after' },
        );
      totalTier4 = updatedProfile?.tier4CorrectCount ?? tier4CountInRun;
    } else {
      const profile = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId });
      totalTier4 = profile?.tier4CorrectCount ?? 0;
    }

    if (totalTier4 >= 50) {
      const specialist = await awardBadge(telegramUserId, 'tier_4_specialist', null, db, now);
      if (specialist) {
        awarded.push(specialist);
      }
    }
  }

  if (event.type === 'streak_updated') {
    const { currentStreak, longestStreak } = event;
    const effectiveStreak = Math.max(currentStreak, longestStreak ?? 0);

    if (effectiveStreak >= 7) {
      const week = await awardBadge(telegramUserId, 'week_warrior', null, db, now);
      if (week) {
        awarded.push(week);
      }
    }

    if (effectiveStreak >= 30) {
      const month = await awardBadge(telegramUserId, 'month_warrior', null, db, now);
      if (month) {
        awarded.push(month);
      }
    }
  }

  if (event.type === 'season_archived') {
    const { season, finalRank } = event;
    if (finalRank !== null && finalRank > 0 && finalRank <= 100) {
      const top100 = await awardBadge(telegramUserId, 'season_top_100', season, db, now);
      if (top100) {
        awarded.push(top100);
      }
    }
  }

  return awarded;
}

export async function getPlayerBadges(
  telegramUserId: number,
  db: Db,
): Promise<PlayerBadgeResponseItem[]> {
  const collection = db.collection<PlayerBadge>('player_badges');
  const records = await collection
    .find({ telegramUserId })
    .sort({ earnedAt: -1 })
    .toArray();

  return records.map((rec) => {
    const def = getBadgeDefinition(rec.badgeId);
    return {
      badgeId: rec.badgeId,
      name: def?.name ?? rec.badgeId,
      description: def?.description ?? '',
      earnedAt: rec.earnedAt,
      season: rec.season ?? null,
    };
  });
}

export async function awardSeasonTop100Badges(
  season: string,
  db: Db,
  redis?: RedisClient | null,
  now: Date = new Date(),
): Promise<number> {
  let count = 0;

  if (redis) {
    try {
      const key = getRankedLeaderboardKey(season);
      const topUserIds = await redis.zrevrange(key, 0, 99);
      for (let i = 0; i < topUserIds.length; i++) {
        const userId = parseInt(topUserIds[i], 10);
        if (Number.isFinite(userId) && userId > 0) {
          const awarded = await awardBadge(userId, 'season_top_100', season, db, now);
          if (awarded) {
            count++;
          }
        }
      }
      if (topUserIds.length > 0) {
        return count;
      }
    } catch {
      void 0;
    }
  }

  const seasonResults = await db
    .collection<{ telegramUserId: number; finalRank: number | null; season: string }>('season_results')
    .find({ season, finalRank: { $ne: null, $lte: 100, $gt: 0 } })
    .toArray();

  for (const res of seasonResults) {
    const awarded = await awardBadge(res.telegramUserId, 'season_top_100', season, db, now);
    if (awarded) {
      count++;
    }
  }

  return count;
}
