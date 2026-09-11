import type { Redis as RedisClient } from 'ioredis';

const memoryPresenceSockets = new Map<string, Map<number, Set<string>>>();
const memoryPresenceUsers = new Map<string, Set<number>>();
const memoryReadyUsers = new Map<string, Set<number>>();
const memoryCountdownLocks = new Set<string>();

export interface ReadyStateResult {
  readyCount: number;
  challengerReady: boolean;
  opponentReady: boolean;
  bothReady: boolean;
}

export async function addBattlePresence(
  redis: RedisClient | null | undefined,
  battleId: string,
  userId: number,
  socketId: string,
): Promise<void> {
  if (redis) {
    const socketKey = `battle:${battleId}:sockets:${userId}`;
    const presenceKey = `battle:${battleId}:presence`;
    await redis.sadd(socketKey, socketId);
    await redis.expire(socketKey, 3600);
    await redis.sadd(presenceKey, String(userId));
    await redis.expire(presenceKey, 3600);
    return;
  }

  let battleSockets = memoryPresenceSockets.get(battleId);
  if (!battleSockets) {
    battleSockets = new Map();
    memoryPresenceSockets.set(battleId, battleSockets);
  }
  let userSockets = battleSockets.get(userId);
  if (!userSockets) {
    userSockets = new Set();
    battleSockets.set(userId, userSockets);
  }
  userSockets.add(socketId);

  let userSet = memoryPresenceUsers.get(battleId);
  if (!userSet) {
    userSet = new Set();
    memoryPresenceUsers.set(battleId, userSet);
  }
  userSet.add(userId);
}

export async function removeBattlePresence(
  redis: RedisClient | null | undefined,
  battleId: string,
  userId: number,
  socketId: string,
): Promise<void> {
  if (redis) {
    const socketKey = `battle:${battleId}:sockets:${userId}`;
    const presenceKey = `battle:${battleId}:presence`;
    await redis.srem(socketKey, socketId);
    const remaining = await redis.scard(socketKey);
    if (remaining <= 0) {
      await redis.srem(presenceKey, String(userId));
    }
    return;
  }

  const battleSockets = memoryPresenceSockets.get(battleId);
  if (battleSockets) {
    const userSockets = battleSockets.get(userId);
    if (userSockets) {
      userSockets.delete(socketId);
      if (userSockets.size === 0) {
        battleSockets.delete(userId);
        const userSet = memoryPresenceUsers.get(battleId);
        if (userSet) {
          userSet.delete(userId);
        }
      }
    }
  }
}

export async function areBothPlayersPresent(
  redis: RedisClient | null | undefined,
  battleId: string,
  challengerId: number,
  opponentId: number | null,
): Promise<boolean> {
  if (opponentId === null) {
    return false;
  }

  if (redis) {
    const presenceKey = `battle:${battleId}:presence`;
    const [challengerPresent, opponentPresent] = await Promise.all([
      redis.sismember(presenceKey, String(challengerId)),
      redis.sismember(presenceKey, String(opponentId)),
    ]);
    return challengerPresent === 1 && opponentPresent === 1;
  }

  const userSet = memoryPresenceUsers.get(battleId);
  if (!userSet) {
    return false;
  }
  return userSet.has(challengerId) && userSet.has(opponentId);
}

export async function markPlayerReady(
  redis: RedisClient | null | undefined,
  battleId: string,
  userId: number,
  challengerId: number,
  opponentId: number | null,
): Promise<ReadyStateResult> {
  if (redis) {
    const readyKey = `battle:${battleId}:ready`;
    await redis.sadd(readyKey, String(userId));
    await redis.expire(readyKey, 3600);
    const members = await redis.smembers(readyKey);
    const readySet = new Set(members.map(Number));
    const challengerReady = readySet.has(challengerId);
    const opponentReady = opponentId !== null && readySet.has(opponentId);
    return {
      readyCount: readySet.size,
      challengerReady,
      opponentReady,
      bothReady: challengerReady && opponentReady,
    };
  }

  let readySet = memoryReadyUsers.get(battleId);
  if (!readySet) {
    readySet = new Set();
    memoryReadyUsers.set(battleId, readySet);
  }
  readySet.add(userId);
  const challengerReady = readySet.has(challengerId);
  const opponentReady = opponentId !== null && readySet.has(opponentId);
  return {
    readyCount: readySet.size,
    challengerReady,
    opponentReady,
    bothReady: challengerReady && opponentReady,
  };
}

export async function acquireCountdownLock(
  redis: RedisClient | null | undefined,
  battleId: string,
): Promise<boolean> {
  if (redis) {
    const lockKey = `battle:${battleId}:countdown_lock`;
    const result = await redis.set(lockKey, '1', 'EX', 300, 'NX');
    return result === 'OK';
  }

  if (memoryCountdownLocks.has(battleId)) {
    return false;
  }
  memoryCountdownLocks.add(battleId);
  return true;
}

export async function clearBattlePresence(
  redis: RedisClient | null | undefined,
  battleId: string,
): Promise<void> {
  if (redis) {
    await redis.del(
      `battle:${battleId}:presence`,
      `battle:${battleId}:ready`,
      `battle:${battleId}:countdown_lock`,
    );
    return;
  }

  memoryPresenceSockets.delete(battleId);
  memoryPresenceUsers.delete(battleId);
  memoryReadyUsers.delete(battleId);
  memoryCountdownLocks.delete(battleId);
}

export function clearMemoryBattlePresence(): void {
  memoryPresenceSockets.clear();
  memoryPresenceUsers.clear();
  memoryReadyUsers.clear();
  memoryCountdownLocks.clear();
}
