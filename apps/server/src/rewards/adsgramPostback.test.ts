import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import type { Db } from 'mongodb';
import type { Redis as RedisClient } from 'ioredis';
import type { PlayerProfile } from '@flagora/shared';
import { initRedis, closeRedis } from '../db/redis.js';
import {
  requestBonusCoinsIntent,
  redeemBonusCoins,
  requestStreakSaveIntent,
  redeemStreakSave,
  getLatestPendingRewardToken,
  verifyRewardToken,
  RewardTokenAlreadyRedeemedError,
  StreakNotAtRiskError,
} from './index.js';

describe('Phase 11 Prompt 01: AdsGram Postback Secondary Confirmation', () => {
  let db: Db;
  let redis: RedisClient;
  let server: http.Server;
  let baseUrl: string;
  const profilesMap = new Map<number, PlayerProfile>();
  const rewardSecret = 'test-secret-adsgram-postback-key';

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
      updateOne: async (
        filter: { telegramUserId: number },
        update: { $set?: Record<string, unknown> },
      ) => {
        const existing = profilesMap.get(filter.telegramUserId);
        if (!existing) {
          return { matchedCount: 0, modifiedCount: 0 };
        }
        const updated = { ...existing };
        if (update.$set) {
          Object.assign(updated, update.$set);
        }
        profilesMap.set(filter.telegramUserId, updated);
        return { matchedCount: 1, modifiedCount: 1 };
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
    process.env.REWARD_TOKEN_SECRET = rewardSecret;
    redis = await initRedis('memory');
    db = createMockDb();

    const app = express();
    app.use(express.json());

    app.get('/api/rewards/adsgram-postback', async (req, res) => {
      try {
        const rawUserId = req.query.userid ?? req.query.user_id;
        if (!rawUserId) {
          res.status(400).json({ ok: false, error: 'Missing userid parameter' });
          return;
        }

        const telegramUserId = Number(rawUserId);
        if (!Number.isFinite(telegramUserId) || telegramUserId <= 0) {
          res.status(400).json({ ok: false, error: 'Invalid userid parameter' });
          return;
        }

        const token = await getLatestPendingRewardToken(telegramUserId, { redis, secret: rewardSecret });
        if (!token) {
          res.status(200).json({
            ok: true,
            status: 'no_pending_token',
            message: 'No pending reward token found for user',
          });
          return;
        }

        let payload;
        try {
          payload = verifyRewardToken(token, { secret: rewardSecret });
        } catch {
          res.status(200).json({
            ok: true,
            status: 'invalid_or_expired_token',
            message: 'Pending token is invalid or expired',
          });
          return;
        }

        try {
          if (payload.rewardType === 'bonus-coins') {
            const result = await redeemBonusCoins(token, telegramUserId, db, { redis, secret: rewardSecret });
            res.status(200).json({
              ok: true,
              status: 'redeemed',
              rewardType: 'bonus-coins',
              coinsEarned: result.coinsEarned,
              coins: result.coins,
            });
            return;
          }

          if (payload.rewardType === 'streak-save') {
            const result = await redeemStreakSave(token, telegramUserId, db, { redis, secret: rewardSecret });
            res.status(200).json({
              ok: true,
              status: 'redeemed',
              rewardType: 'streak-save',
              saved: result.saved,
              currentStreak: result.currentStreak,
            });
            return;
          }

          res.status(200).json({
            ok: true,
            status: 'unsupported_reward_type',
          });
        } catch (error) {
          if (error instanceof RewardTokenAlreadyRedeemedError) {
            res.status(200).json({
              ok: true,
              status: 'already_redeemed',
              message: 'Reward token was already redeemed',
            });
            return;
          }

          if (error instanceof StreakNotAtRiskError) {
            res.status(200).json({
              ok: true,
              status: 'streak_not_at_risk',
              message: error.message,
            });
            return;
          }

          const message = error instanceof Error ? error.message : 'Redemption failed';
          res.status(500).json({ ok: false, error: 'Internal server error', message });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Postback processing failed';
        res.status(500).json({ ok: false, error: 'Internal server error', message });
      }
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          baseUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await closeRedis();
  });

  beforeEach(async () => {
    profilesMap.clear();
    const keys = await redis.keys('reward:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    profilesMap.set(2001, {
      telegramUserId: 2001,
      firstName: 'Alice',
      coins: 100,
      xp: 0,
      level: 1,
      currentStreak: 5,
      longestStreak: 5,
      gamesPlayed: 10,
      bestScore: 500,
      lastPlayedDate: '2026-09-10',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('rejects postback when userid query parameter is missing or invalid', async () => {
    const resMissing = await fetch(`${baseUrl}/api/rewards/adsgram-postback`);
    assert.equal(resMissing.status, 400);
    const dataMissing = await resMissing.json();
    assert.equal(dataMissing.ok, false);

    const resInvalid = await fetch(`${baseUrl}/api/rewards/adsgram-postback?userid=abc`);
    assert.equal(resInvalid.status, 400);
    const dataInvalid = await resInvalid.json();
    assert.equal(dataInvalid.ok, false);
  });

  it('returns no_pending_token gracefully when user has no active reward intent', async () => {
    const res = await fetch(`${baseUrl}/api/rewards/adsgram-postback?userid=2001`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.status, 'no_pending_token');
  });

  it('Order A: client redeems first, postback arrives second -> postback no-ops cleanly without double credit', async () => {
    const userId = 2001;
    const intent = await requestBonusCoinsIntent(userId, { redis, secret: rewardSecret });
    assert.ok(intent.token);

    const clientRedeemResult = await redeemBonusCoins(intent.token, userId, db, {
      redis,
      secret: rewardSecret,
    });
    assert.equal(clientRedeemResult.ok, true);
    assert.equal(clientRedeemResult.coins, 150);

    const postbackRes = await fetch(`${baseUrl}/api/rewards/adsgram-postback?userid=${userId}`);
    assert.equal(postbackRes.status, 200);
    const postbackData = await postbackRes.json();
    assert.equal(postbackData.ok, true);
    assert.ok(
      postbackData.status === 'already_redeemed' || postbackData.status === 'no_pending_token',
    );

    const profile = profilesMap.get(userId);
    assert.equal(profile?.coins, 150);
  });

  it('Order B: postback arrives first, client redeems second -> postback succeeds, client redeem throws without double credit', async () => {
    const userId = 2001;
    const intent = await requestBonusCoinsIntent(userId, { redis, secret: rewardSecret });
    assert.ok(intent.token);

    const postbackRes = await fetch(`${baseUrl}/api/rewards/adsgram-postback?userid=${userId}`);
    assert.equal(postbackRes.status, 200);
    const postbackData = await postbackRes.json();
    assert.equal(postbackData.ok, true);
    assert.equal(postbackData.status, 'redeemed');
    assert.equal(postbackData.rewardType, 'bonus-coins');
    assert.equal(postbackData.coins, 150);

    const profileAfterPostback = profilesMap.get(userId);
    assert.equal(profileAfterPostback?.coins, 150);

    await assert.rejects(
      async () => {
        await redeemBonusCoins(intent.token, userId, db, { redis, secret: rewardSecret });
      },
      (err) => err instanceof RewardTokenAlreadyRedeemedError,
    );

    const profileFinal = profilesMap.get(userId);
    assert.equal(profileFinal?.coins, 150);
  });

  it('redeems streak-save reward token via postback when streak is at risk', async () => {
    const userId = 2001;
    const testNow = new Date('2026-09-15T12:00:00Z');
    const intent = await requestStreakSaveIntent(userId, db, {
      redis,
      secret: rewardSecret,
      now: testNow,
    });
    assert.ok(intent.token);

    const postbackRes = await fetch(`${baseUrl}/api/rewards/adsgram-postback?userid=${userId}`);
    assert.equal(postbackRes.status, 200);
    const postbackData = await postbackRes.json();
    assert.equal(postbackData.ok, true);
    assert.equal(postbackData.status, 'redeemed');
    assert.equal(postbackData.rewardType, 'streak-save');

    const profile = profilesMap.get(userId);
    assert.ok(profile?.lastPlayedDate);
  });
});

