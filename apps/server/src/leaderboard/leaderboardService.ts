import type { Db } from 'mongodb';
import type { Redis as RedisClient } from 'ioredis';
import {
  getDisplayName,
  type LeaderboardEntry,
  type LeaderboardMeResponse,
  type PlayerProfile,
} from '@flagora/shared';

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

      return profiles.map((profile, index) => ({
        rank: index + 1,
        telegramUserId: profile.telegramUserId,
        displayName: getDisplayName(profile),
        photoUrl: profile.photoUrl ?? null,
        bestScore: profile.bestScore,
      }));
    }

    if (key.startsWith('leaderboard:daily:')) {
      const targetDate = key.replace('leaderboard:daily:', '');
      const runs = await db
        .collection<{ telegramUserId: number; totalScore: number }>('daily_runs')
        .find({ date: targetDate, finishedAt: { $ne: null } })
        .sort({ totalScore: -1 })
        .limit(clampedLimit)
        .toArray();

      if (runs.length > 0) {
        const userIds = runs.map((r) => r.telegramUserId);
        const profiles = await db
          .collection<PlayerProfile>('profiles')
          .find({ telegramUserId: { $in: userIds } })
          .toArray();
        const profileMap = new Map(profiles.map((p) => [p.telegramUserId, p]));

        return runs.map((run, index) => {
          const profile = profileMap.get(run.telegramUserId);
          return {
            rank: index + 1,
            telegramUserId: run.telegramUserId,
            displayName: profile ? getDisplayName(profile) : `Player ${run.telegramUserId}`,
            photoUrl: profile?.photoUrl ?? null,
            bestScore: run.totalScore,
          };
        });
      }
    }
  }

  if (parsed.length === 0) {
    return [];
  }

  const userIds = parsed.map((item) => item.telegramUserId);
  const profiles = await db
    .collection<PlayerProfile>('profiles')
    .find({ telegramUserId: { $in: userIds } })
    .toArray();

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
      .collection<{ totalScore: number }>('daily_runs')
      .findOne({
        telegramUserId,
        date: targetDate,
        finishedAt: { $ne: null },
      });

    if (userRun) {
      const higherCount = await db
        .collection('daily_runs')
        .countDocuments({
          date: targetDate,
          finishedAt: { $ne: null },
          totalScore: { $gt: userRun.totalScore },
        });

      return {
        ranked: true,
        rank: higherCount + 1,
        bestScore: userRun.totalScore,
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

  const profiles = await db
    .collection<PlayerProfile>('profiles')
    .find({ bestScore: { $gt: 0 } })
    .toArray();

  if (profiles.length === 0) {
    return { count: 0 };
  }

  const pipeline = redis.pipeline();
  for (const profile of profiles) {
    pipeline.zadd(LEADERBOARD_KEY, profile.bestScore, String(profile.telegramUserId));
  }
  await pipeline.exec();

  return { count: profiles.length };
}
