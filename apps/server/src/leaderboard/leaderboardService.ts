import type { Db } from 'mongodb';
import type { Redis as RedisClient } from 'ioredis';
import {
  getDisplayName,
  type LeaderboardEntry,
  type LeaderboardMeResponse,
  type PlayerProfile,
} from '@flagora/shared';
import type { GameRun } from '../game/runTypes.js';

const LEADERBOARD_KEY = 'leaderboard:global';

export function getDailyLeaderboardKey(date: string): string {
  return `leaderboard:daily:${date}`;
}

export async function updateLeaderboardScore(
  telegramUserId: number,
  bestScore: number,
  redis: RedisClient,
  key = LEADERBOARD_KEY,
): Promise<void> {
  await redis.zadd(key, bestScore, String(telegramUserId));
}

async function getVerifiedUserSet(userIds: number[], db: Db): Promise<Set<number>> {
  if (userIds.length === 0) return new Set();
  try {
    const subs = await db.collection('subscriptions').find({
      telegramUserId: { $in: userIds },
      status: 'active',
      currentPeriodEnd: { $gt: new Date() },
    }).toArray();
    return new Set(subs.map((s: any) => s.telegramUserId));
  } catch {
    return new Set();
  }
}

export async function getTopLeaderboard(
  limit: number,
  db: Db,
  redis?: RedisClient | null,
  key = LEADERBOARD_KEY,
): Promise<LeaderboardEntry[]> {
  const clampedLimit = Math.min(Math.max(1, limit), 100);
  let parsed: { telegramUserId: number; score: number }[] = [];
  let redisFailed = false;

  if (redis) {
    try {
      const rawResults = await redis.zrevrange(key, 0, clampedLimit - 1, 'WITHSCORES');
      for (let i = 0; i < rawResults.length; i += 2) {
        parsed.push({
          telegramUserId: Number(rawResults[i]),
          score: Number(rawResults[i + 1]),
        });
      }
    } catch {
      redisFailed = true;
      parsed = [];
    }
  } else {
    redisFailed = true;
  }

  if (redisFailed) {
    if (key === LEADERBOARD_KEY) {
      const profiles = await db
        .collection<PlayerProfile>('profiles')
        .find({ bestScore: { $gt: 0 } })
        .sort({ bestScore: -1 })
        .limit(clampedLimit)
        .toArray();

      const userIds = profiles.map((p) => p.telegramUserId);
      const verifiedSet = await getVerifiedUserSet(userIds, db);

      return profiles.map((profile, index) => ({
        rank: index + 1,
        telegramUserId: profile.telegramUserId,
        displayName: getDisplayName(profile),
        photoUrl: profile.photoUrl ?? null,
        bestScore: profile.bestScore,
        isVerified: verifiedSet.has(profile.telegramUserId) || Boolean(profile.isVerified),
      }));
    }

    if (key.startsWith('leaderboard:daily:')) {
      const targetDate = key.replace('leaderboard:daily:', '');
      const runs = await db
        .collection<GameRun>('runs')
        .find({
          mode: 'daily',
          dailyDate: targetDate,
          'finalScore.totalScore': { $gt: 0 },
        })
        .sort({ 'finalScore.totalScore': -1 })
        .limit(clampedLimit)
        .toArray();

      if (runs.length > 0) {
        const userIds = runs.map((r) => r.telegramUserId);
        const [profiles, verifiedSet] = await Promise.all([
          db
            .collection<PlayerProfile>('profiles')
            .find(
              { telegramUserId: { $in: userIds } },
              {
                projection: {
                  telegramUserId: 1,
                  displayName: 1,
                  username: 1,
                  firstName: 1,
                  lastName: 1,
                  photoUrl: 1,
                  isVerified: 1,
                },
              },
            )
            .toArray(),
          getVerifiedUserSet(userIds, db),
        ]);
        const profileMap = new Map(profiles.map((p) => [p.telegramUserId, p]));

        return runs.map((run, index) => {
          const profile = profileMap.get(run.telegramUserId);
          const score = run.finalScore?.totalScore ?? run.runningTotal ?? 0;
          return {
            rank: index + 1,
            telegramUserId: run.telegramUserId,
            displayName: profile ? getDisplayName(profile) : `Player ${run.telegramUserId}`,
            photoUrl: profile?.photoUrl ?? null,
            bestScore: score,
            isVerified: verifiedSet.has(run.telegramUserId) || Boolean(profile?.isVerified),
          };
        });
      }
      return [];
    }

    if (key.startsWith('leaderboard:ranked:')) {
      const season = key.replace('leaderboard:ranked:', '');
      const profiles = await db
        .collection<PlayerProfile>('profiles')
        .find({ currentSeason: season, battleRating: { $gt: 0 } })
        .sort({ battleRating: -1 })
        .limit(clampedLimit)
        .toArray();

      const userIds = profiles.map((p) => p.telegramUserId);
      const verifiedSet = await getVerifiedUserSet(userIds, db);

      return profiles.map((profile, index) => ({
        rank: index + 1,
        telegramUserId: profile.telegramUserId,
        displayName: getDisplayName(profile),
        photoUrl: profile.photoUrl ?? null,
        bestScore: profile.battleRating ?? 0,
        isVerified: verifiedSet.has(profile.telegramUserId) || Boolean(profile.isVerified),
      }));
    }
  }

  if (parsed.length === 0) {
    return [];
  }

  const userIds = parsed.map((item) => item.telegramUserId);
  const [profiles, verifiedSet] = await Promise.all([
    db
      .collection<PlayerProfile>('profiles')
      .find(
        { telegramUserId: { $in: userIds } },
        {
          projection: {
            telegramUserId: 1,
            displayName: 1,
            username: 1,
            firstName: 1,
            lastName: 1,
            photoUrl: 1,
            isVerified: 1,
          },
        },
      )
      .toArray(),
    getVerifiedUserSet(userIds, db),
  ]);

  const profileMap = new Map<number, PlayerProfile>(
    profiles.map((profile) => [profile.telegramUserId, profile]),
  );

  return parsed.map((item, index) => {
    const profile = profileMap.get(item.telegramUserId);
    const displayName = profile ? getDisplayName(profile) : `Player ${item.telegramUserId}`;
    const photoUrl = profile?.photoUrl ?? null;

    return {
      rank: index + 1,
      telegramUserId: item.telegramUserId,
      displayName,
      photoUrl,
      bestScore: item.score,
      isVerified: verifiedSet.has(item.telegramUserId) || Boolean(profile?.isVerified),
    };
  });
}

export async function getPlayerLeaderboardRank(
  telegramUserId: number,
  redis?: RedisClient | null,
  key = LEADERBOARD_KEY,
  db?: Db,
): Promise<LeaderboardMeResponse> {
  let rank: number | null = null;
  let scoreStr: string | null = null;
  let redisFailed = false;

  if (redis) {
    try {
      const member = String(telegramUserId);
      rank = await redis.zrevrank(key, member);
      scoreStr = await redis.zscore(key, member);
    } catch {
      redisFailed = true;
      rank = null;
      scoreStr = null;
    }
  } else {
    redisFailed = true;
  }

  if (!redisFailed && rank !== null && scoreStr !== null) {
    return {
      ranked: true,
      rank: rank + 1,
      bestScore: Number(scoreStr),
    };
  }

  if (db && redisFailed && key === LEADERBOARD_KEY) {
    const profile = await db
      .collection<PlayerProfile>('profiles')
      .findOne({ telegramUserId });

    if (profile && profile.bestScore > 0) {
      const higherCount = await db
        .collection<PlayerProfile>('profiles')
        .countDocuments({ bestScore: { $gt: profile.bestScore } });

      return {
        ranked: true,
        rank: higherCount + 1,
        bestScore: profile.bestScore,
      };
    }
  }

  if (db && redisFailed && key.startsWith('leaderboard:daily:')) {
    const targetDate = key.replace('leaderboard:daily:', '');
    const userRun = await db
      .collection<GameRun>('runs')
      .findOne({
        telegramUserId,
        mode: 'daily',
        dailyDate: targetDate,
        'finalScore.totalScore': { $exists: true },
      });

    if (userRun?.finalScore) {
      const userScore = userRun.finalScore.totalScore;
      const higherCount = await db
        .collection<GameRun>('runs')
        .countDocuments({
          mode: 'daily',
          dailyDate: targetDate,
          'finalScore.totalScore': { $gt: userScore },
        });

      return {
        ranked: true,
        rank: higherCount + 1,
        bestScore: userScore,
      };
    }
  }

  if (db && redisFailed && key.startsWith('leaderboard:ranked:')) {
    const season = key.replace('leaderboard:ranked:', '');
    const profile = await db
      .collection<PlayerProfile>('profiles')
      .findOne({ telegramUserId, currentSeason: season });

    if (profile && (profile.battleRating ?? 0) > 0) {
      const higherCount = await db
        .collection<PlayerProfile>('profiles')
        .countDocuments({
          currentSeason: season,
          battleRating: { $gt: profile.battleRating },
        });

      return {
        ranked: true,
        rank: higherCount + 1,
        bestScore: profile.battleRating ?? 0,
      };
    }
  }

  return {
    ranked: false,
    rank: null,
    bestScore: 0,
  };
}

export async function reconcileLeaderboard(
  db: Db,
  redis: RedisClient,
): Promise<{ count: number }> {
  await redis.del(LEADERBOARD_KEY);

  const cursor = db
    .collection<PlayerProfile>('profiles')
    .find(
      { bestScore: { $gt: 0 } },
      { projection: { telegramUserId: 1, bestScore: 1 } },
    );

  const BATCH_SIZE = 500;
  let batch: { telegramUserId: number; bestScore: number }[] = [];
  let totalCount = 0;

  for await (const doc of cursor) {
    batch.push({ telegramUserId: doc.telegramUserId, bestScore: doc.bestScore });
    if (batch.length >= BATCH_SIZE) {
      const pipeline = redis.pipeline();
      for (const item of batch) {
        pipeline.zadd(LEADERBOARD_KEY, item.bestScore, String(item.telegramUserId));
      }
      await pipeline.exec();
      totalCount += batch.length;
      batch = [];
    }
  }

  if (batch.length > 0) {
    const pipeline = redis.pipeline();
    for (const item of batch) {
      pipeline.zadd(LEADERBOARD_KEY, item.bestScore, String(item.telegramUserId));
    }
    await pipeline.exec();
    totalCount += batch.length;
  }

  return { count: totalCount };
}
