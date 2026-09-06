import type { Db } from 'mongodb';
import type { Redis as RedisClient } from 'ioredis';
import {
  getDisplayName,
  type LeaderboardEntry,
  type LeaderboardMeResponse,
  type PlayerProfile,
} from '@flagora/shared';

const LEADERBOARD_KEY = 'leaderboard:global';

export async function updateLeaderboardScore(
  telegramUserId: number,
  bestScore: number,
  redis: RedisClient,
): Promise<void> {
  await redis.zadd(LEADERBOARD_KEY, bestScore, String(telegramUserId));
}

export async function getTopLeaderboard(
  limit: number,
  db: Db,
  redis: RedisClient,
): Promise<LeaderboardEntry[]> {
  const clampedLimit = Math.min(Math.max(1, limit), 100);
  const rawResults = await redis.zrevrange(LEADERBOARD_KEY, 0, clampedLimit - 1, 'WITHSCORES');

  const parsed: { telegramUserId: number; score: number }[] = [];
  for (let i = 0; i < rawResults.length; i += 2) {
    parsed.push({
      telegramUserId: Number(rawResults[i]),
      score: Number(rawResults[i + 1]),
    });
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
  redis: RedisClient,
): Promise<LeaderboardMeResponse> {
  const member = String(telegramUserId);
  const rank = await redis.zrevrank(LEADERBOARD_KEY, member);
  const scoreStr = await redis.zscore(LEADERBOARD_KEY, member);

  if (rank === null || scoreStr === null) {
    return {
      ranked: false,
      rank: null,
      bestScore: 0,
    };
  }

  return {
    ranked: true,
    rank: rank + 1,
    bestScore: Number(scoreStr),
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
