import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import type { Db } from 'mongodb';
import type { Redis as RedisClient } from 'ioredis';
import type { PlayerProfile } from '@flagora/shared';
import { initRedis, closeRedis } from '../db/redis.js';
import { createRequireSessionMiddleware, type AuthenticatedSessionRequest } from '../session/requireSession.js';
import { createSessionToken } from '../session/tokens.js';
import {
  requestBonusCoinsIntent,
  redeemBonusCoins,
} from './bonusCoinsService.js';
import {
  RewardCapReachedError,
  RewardTokenError,
  UnauthorizedTokenRedemptionError,
  ExpiredRewardTokenError,
  RewardTokenAlreadyRedeemedError,
  RewardTypeMismatchError,
  InvalidRewardTokenError,
} from './rewardErrors.js';
import { BONUS_COINS_REWARD_AMOUNT, BONUS_COINS_DAILY_CAP } from './rewardConfig.js';

describe('Phase 8 Prompt 02: Bonus Coins Reward', () => {
  let db: Db;
  let redis: RedisClient;
  let server: http.Server;
  let baseUrl: string;
  const profilesMap = new Map<number, PlayerProfile>();
  const sessionSecret = 'test-secret-bonus-coins-session-key';
  const rewardSecret = 'test-secret-bonus-coins-reward-key';

  function createMockDb(): Db {
    const mockCollection = {
      createIndex: async () => 'telegramUserId_1',
      deleteMany: async () => {
        profilesMap.clear();
        return { deletedCount: 0 };
      },
      insertOne: async (doc: PlayerProfile) => {
        profilesMap.set(doc.telegramUserId, { ...doc });
        return { insertedId: doc.telegramUserId };
      },
      findOne: async (query: { telegramUserId: number }) => {
        const found = profilesMap.get(query.telegramUserId);
        return found ? { ...found } : null;
      },
      findOneAndUpdate: async (
        filter: { telegramUserId: number },
        update: { $inc?: { coins?: number }; $set?: Record<string, unknown> },
      ) => {
        const existing = profilesMap.get(filter.telegramUserId);
        if (!existing) {
          return null;
        }
        const updated = { ...existing };
        if (update.$inc?.coins) {
          updated.coins = (updated.coins || 0) + update.$inc.coins;
        }
        if (update.$set) {
          Object.assign(updated, update.$set);
        }
        profilesMap.set(filter.telegramUserId, updated);
        return updated;
      },
    };

    return {
      collection: (name: string) => {
        if (name === 'profiles') {
          return mockCollection as unknown;
        }
        throw new Error(`Unexpected collection: ${name}`);
      },
    } as unknown as Db;
  }

  before(async () => {
    db = createMockDb();
    redis = await initRedis('memory');

    const app = express();
    app.use(express.json());
    const sessionMiddleware = createRequireSessionMiddleware(sessionSecret);

    app.post(
      '/api/rewards/bonus-coins/intent',
      sessionMiddleware,
      async (req: AuthenticatedSessionRequest, res) => {
        try {
          const telegramUserId = req.sessionUser?.telegramUserId;
          if (!telegramUserId) {
            res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
            return;
          }

          const result = await requestBonusCoinsIntent(telegramUserId, { redis, secret: rewardSecret });
          res.status(200).json(result);
        } catch (error) {
          if (error instanceof RewardCapReachedError) {
            res.status(429).json({
              ok: false,
              error: 'Daily cap reached',
              message: error.message,
              dailyCap: error.dailyCap,
              usedCount: error.usedCount,
              resetAtUtc: error.resetAtUtc,
            });
            return;
          }
          const message = error instanceof Error ? error.message : 'Failed to create reward intent';
          res.status(500).json({ error: 'Internal server error', message });
        }
      },
    );

    app.post(
      '/api/rewards/bonus-coins/redeem',
      sessionMiddleware,
      async (req: AuthenticatedSessionRequest, res) => {
        try {
          const telegramUserId = req.sessionUser?.telegramUserId;
          if (!telegramUserId) {
            res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
            return;
          }

          const { token } = req.body || {};
          if (!token || typeof token !== 'string' || token.trim() === '') {
            res.status(400).json({ error: 'Missing token', message: 'Reward token is required' });
            return;
          }

          const result = await redeemBonusCoins(token, telegramUserId, db, { redis, secret: rewardSecret });
          res.status(200).json(result);
        } catch (error) {
          if (error instanceof UnauthorizedTokenRedemptionError) {
            res.status(403).json({ error: 'Forbidden', message: error.message });
            return;
          }
          if (error instanceof ExpiredRewardTokenError) {
            res.status(400).json({ error: 'Token expired', message: error.message });
            return;
          }
          if (error instanceof RewardTokenAlreadyRedeemedError) {
            res.status(400).json({ error: 'Token already redeemed', message: error.message });
            return;
          }
          if (error instanceof RewardTypeMismatchError) {
            res.status(400).json({ error: 'Type mismatch', message: error.message });
            return;
          }
          if (error instanceof InvalidRewardTokenError) {
            res.status(400).json({ error: 'Invalid token', message: error.message });
            return;
          }
          if (error instanceof RewardTokenError) {
            res.status(400).json({ error: 'Invalid reward token', message: error.message });
            return;
          }
          const message = error instanceof Error ? error.message : 'Failed to redeem reward token';
          res.status(500).json({ error: 'Internal server error', message });
        }
      },
    );

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await closeRedis();
  });

  beforeEach(async () => {
    await redis.flushall();
    profilesMap.clear();
  });

  async function createTestPlayer(telegramUserId: number, initialCoins = 100): Promise<string> {
    const profile: PlayerProfile = {
      telegramUserId,
      firstName: `User_${telegramUserId}`,
      coins: initialCoins,
      xp: 0,
      level: 1,
      currentStreak: 0,
      longestStreak: 0,
      gamesPlayed: 0,
      bestScore: 0,
      lastPlayedDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    profilesMap.set(telegramUserId, profile);
    return createSessionToken(telegramUserId, sessionSecret);
  }

  it('successful intent-then-redeem sequence correctly credits exactly 50 coins', async () => {
    const userId = 1001;
    const sessionToken = await createTestPlayer(userId, 100);

    const intentRes = await fetch(`${baseUrl}/api/rewards/bonus-coins/intent`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    });

    assert.equal(intentRes.status, 200);
    const intentData = (await intentRes.json()) as {
      ok: boolean;
      token: string;
      dailyCap: number;
      coins: number;
    };
    assert.equal(intentData.ok, true);
    assert.ok(intentData.token);
    assert.equal(intentData.dailyCap, BONUS_COINS_DAILY_CAP);
    assert.equal(intentData.coins, BONUS_COINS_REWARD_AMOUNT);

    const redeemRes = await fetch(`${baseUrl}/api/rewards/bonus-coins/redeem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ token: intentData.token }),
    });

    assert.equal(redeemRes.status, 200);
    const redeemData = (await redeemRes.json()) as {
      ok: boolean;
      coinsEarned: number;
      coins: number;
      telegramUserId: number;
    };
    assert.equal(redeemData.ok, true);
    assert.equal(redeemData.coinsEarned, 50);
    assert.equal(redeemData.coins, 150);
    assert.equal(redeemData.telegramUserId, userId);

    const updatedProfile = profilesMap.get(userId);
    assert.equal(updatedProfile?.coins, 150);
  });

  it('attempting to redeem the same token twice credits coins only once and rejects second attempt', async () => {
    const userId = 1002;
    const sessionToken = await createTestPlayer(userId, 50);

    const intentRes = await fetch(`${baseUrl}/api/rewards/bonus-coins/intent`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const { token } = (await intentRes.json()) as { token: string };

    const firstRedeem = await fetch(`${baseUrl}/api/rewards/bonus-coins/redeem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ token }),
    });
    assert.equal(firstRedeem.status, 200);

    const secondRedeem = await fetch(`${baseUrl}/api/rewards/bonus-coins/redeem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ token }),
    });

    assert.equal(secondRedeem.status, 400);
    const secondData = (await secondRedeem.json()) as { error: string };
    assert.equal(secondData.error, 'Token already redeemed');

    const updatedProfile = profilesMap.get(userId);
    assert.equal(updatedProfile?.coins, 100);
  });

  it('attempting to redeem without ever calling intent is rejected and credits nothing', async () => {
    const userId = 1003;
    const sessionToken = await createTestPlayer(userId, 200);

    const fakeRedeem = await fetch(`${baseUrl}/api/rewards/bonus-coins/redeem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ token: 'completely.fabricated.jwt-token' }),
    });

    assert.equal(fakeRedeem.status, 400);
    const fakeData = (await fakeRedeem.json()) as { error: string };
    assert.equal(fakeData.error, 'Invalid token');

    const profile = profilesMap.get(userId);
    assert.equal(profile?.coins, 200);
  });

  it('rejects 6th intent in the same UTC day with cap-reached response', async () => {
    const userId = 1004;
    const sessionToken = await createTestPlayer(userId, 0);

    for (let i = 1; i <= 5; i++) {
      const intentRes = await fetch(`${baseUrl}/api/rewards/bonus-coins/intent`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      assert.equal(intentRes.status, 200);
      const { token } = (await intentRes.json()) as { token: string };

      const redeemRes = await fetch(`${baseUrl}/api/rewards/bonus-coins/redeem`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ token }),
      });
      assert.equal(redeemRes.status, 200);
    }

    const sixthIntentRes = await fetch(`${baseUrl}/api/rewards/bonus-coins/intent`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });

    assert.equal(sixthIntentRes.status, 429);
    const sixthData = (await sixthIntentRes.json()) as {
      ok: boolean;
      error: string;
      dailyCap: number;
      usedCount: number;
      resetAtUtc: string;
    };
    assert.equal(sixthData.ok, false);
    assert.equal(sixthData.error, 'Daily cap reached');
    assert.equal(sixthData.dailyCap, 5);
    assert.equal(sixthData.usedCount, 5);
    assert.ok(sixthData.resetAtUtc);

    const profile = profilesMap.get(userId);
    assert.equal(profile?.coins, 250);
  });

  it('rejects cross-user redemption attempt when user B uses user A token', async () => {
    const userA = 2001;
    const userB = 2002;
    const tokenA = await createTestPlayer(userA, 100);
    const tokenB = await createTestPlayer(userB, 100);

    const intentRes = await fetch(`${baseUrl}/api/rewards/bonus-coins/intent`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const { token: rewardTokenA } = (await intentRes.json()) as { token: string };

    const stealAttempt = await fetch(`${baseUrl}/api/rewards/bonus-coins/redeem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify({ token: rewardTokenA }),
    });

    assert.equal(stealAttempt.status, 403);
    const stealData = (await stealAttempt.json()) as { error: string };
    assert.equal(stealData.error, 'Forbidden');

    const profileA = profilesMap.get(userA);
    const profileB = profilesMap.get(userB);
    assert.equal(profileA?.coins, 100);
    assert.equal(profileB?.coins, 100);
  });

  it('rejects redeem request with missing or empty token', async () => {
    const userId = 3001;
    const sessionToken = await createTestPlayer(userId, 50);

    const emptyRes = await fetch(`${baseUrl}/api/rewards/bonus-coins/redeem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ token: '' }),
    });

    assert.equal(emptyRes.status, 400);
    const data = (await emptyRes.json()) as { error: string };
    assert.equal(data.error, 'Missing token');
  });

  it('rejects unauthenticated intent and redeem requests', async () => {
    const unauthIntent = await fetch(`${baseUrl}/api/rewards/bonus-coins/intent`, {
      method: 'POST',
    });
    assert.equal(unauthIntent.status, 401);

    const unauthRedeem = await fetch(`${baseUrl}/api/rewards/bonus-coins/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'test' }),
    });
    assert.equal(unauthRedeem.status, 401);
  });
});
