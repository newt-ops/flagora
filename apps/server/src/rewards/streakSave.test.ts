import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import type { Db } from 'mongodb';
import type { Redis as RedisClient } from 'ioredis';
import {
  getUtcDateString,
  getYesterdayUtcDateString,
  type PlayerProfile,
  type CountryFlag,
} from '@flagora/shared';
import { initRedis, closeRedis } from '../db/redis.js';
import { createRequireSessionMiddleware, type AuthenticatedSessionRequest } from '../session/requireSession.js';
import { createSessionToken } from '../session/tokens.js';
import {
  getStreakStatus,
  requestStreakSaveIntent,
  redeemStreakSave,
} from './streakSaveService.js';
import {
  issueRewardToken,
} from './rewardTokenService.js';
import {
  StreakNotAtRiskError,
  RewardCapReachedError,
  RewardTokenError,
  UnauthorizedTokenRedemptionError,
  ExpiredRewardTokenError,
  RewardTokenAlreadyRedeemedError,
  RewardTypeMismatchError,
  InvalidRewardTokenError,
} from './rewardErrors.js';
import { finishRun, createRun } from '../game/runService.js';
import type { GameRun } from '../game/runTypes.js';
import { seedFlags } from '../game/seedFlags.js';

describe('Phase 8 Prompt 03: Streak-Save Reward Backend', () => {
  let db: Db;
  let redis: RedisClient;
  let server: http.Server;
  let baseUrl: string;
  const profilesMap = new Map<number, PlayerProfile>();
  const runsMap = new Map<string, GameRun>();
  const flagsMap = new Map<string, CountryFlag>();
  const sessionSecret = 'test-secret-streak-save-session-key';
  const rewardSecret = 'test-secret-streak-save-reward-key';

  function createMockDb(): Db {
    const mockProfiles = {
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
        update: {
          $set?: Record<string, unknown>;
          $inc?: Record<string, number>;
          $max?: Record<string, unknown>;
        },
      ) => {
        const existing = profilesMap.get(filter.telegramUserId);
        if (!existing) {
          return { matchedCount: 0, modifiedCount: 0 };
        }
        const updated = { ...existing };
        const updatedRecord = updated as unknown as Record<string, unknown>;
        if (update.$inc) {
          for (const [k, v] of Object.entries(update.$inc)) {
            const current = typeof updatedRecord[k] === 'number' ? (updatedRecord[k] as number) : 0;
            updatedRecord[k] = current + v;
          }
        }
        if (update.$set) {
          Object.assign(updated, update.$set);
        }
        if (update.$max) {
          for (const [k, v] of Object.entries(update.$max)) {
            const current = typeof updatedRecord[k] === 'number' ? (updatedRecord[k] as number) : 0;
            const maxVal = typeof v === 'number' ? v : 0;
            if (current < maxVal) {
              updatedRecord[k] = maxVal;
            }
          }
        }
        profilesMap.set(filter.telegramUserId, updated);
        return { matchedCount: 1, modifiedCount: 1 };
      },
      findOneAndUpdate: async (
        filter: { telegramUserId: number },
        update: {
          $set?: Record<string, unknown>;
          $inc?: Record<string, number>;
          $max?: Record<string, unknown>;
        },
      ) => {
        const existing = profilesMap.get(filter.telegramUserId);
        if (!existing) {
          return null;
        }
        const updated = { ...existing };
        const updatedRecord = updated as unknown as Record<string, unknown>;
        if (update.$inc) {
          for (const [k, v] of Object.entries(update.$inc)) {
            const current = typeof updatedRecord[k] === 'number' ? (updatedRecord[k] as number) : 0;
            updatedRecord[k] = current + v;
          }
        }
        if (update.$set) {
          Object.assign(updated, update.$set);
        }
        if (update.$max) {
          for (const [k, v] of Object.entries(update.$max)) {
            const current = typeof updatedRecord[k] === 'number' ? (updatedRecord[k] as number) : 0;
            const maxVal = typeof v === 'number' ? v : 0;
            if (current < maxVal) {
              updatedRecord[k] = maxVal;
            }
          }
        }
        profilesMap.set(filter.telegramUserId, updated);
        return updated;
      },
    };

    const mockRuns = {
      createIndex: async () => 'run_index',
      insertOne: async (doc: GameRun) => {
        runsMap.set(doc.runId, { ...doc });
        return { insertedId: doc.runId };
      },
      findOne: async (query: { runId: string }) => {
        const found = runsMap.get(query.runId);
        return found ? { ...found } : null;
      },
      updateOne: async (
        filter: { runId: string },
        update: { $set?: Partial<GameRun> },
      ) => {
        const existing = runsMap.get(filter.runId);
        if (!existing) return { matchedCount: 0, modifiedCount: 0 };
        const updated = { ...existing };
        if (update.$set) Object.assign(updated, update.$set);
        runsMap.set(filter.runId, updated);
        return { matchedCount: 1, modifiedCount: 1 };
      },
      findOneAndUpdate: async (
        filter: { runId: string },
        update: { $set?: Partial<GameRun> },
      ) => {
        const existing = runsMap.get(filter.runId);
        if (!existing) return null;
        const updated = { ...existing };
        if (update.$set) Object.assign(updated, update.$set);
        runsMap.set(filter.runId, updated);
        return updated;
      },
    };

    const mockFlags = {
      createIndex: async () => 'flags_index',
      countDocuments: async () => flagsMap.size,
      insertMany: async (docs: CountryFlag[]) => {
        for (const d of docs) {
          flagsMap.set(d.isoCode, d);
        }
        return { insertedCount: docs.length };
      },
      bulkWrite: async (
        ops: Array<{
          updateOne?: {
            filter: { isoCode: string };
            update: { $set: CountryFlag };
            upsert?: boolean;
          };
        }>,
      ) => {
        let upserted = 0;
        let matched = 0;
        for (const op of ops) {
          if (op.updateOne) {
            const isoCode = op.updateOne.filter.isoCode;
            const flag = op.updateOne.update.$set;
            if (flagsMap.has(isoCode)) {
              matched++;
            } else {
              upserted++;
            }
            flagsMap.set(isoCode, flag);
          }
        }
        return { upsertedCount: upserted, matchedCount: matched };
      },
      find: () => ({
        toArray: async () => Array.from(flagsMap.values()),
      }),
    };

    return {
      collection: (name: string) => {
        if (name === 'profiles') return mockProfiles as unknown;
        if (name === 'runs') return mockRuns as unknown;
        if (name === 'flags') return mockFlags as unknown;
        throw new Error(`Unexpected collection: ${name}`);
      },
    } as unknown as Db;
  }

  before(async () => {
    db = createMockDb();
    redis = await initRedis('memory');

    await seedFlags(db);

    const app = express();
    app.use(express.json());
    const sessionMiddleware = createRequireSessionMiddleware(sessionSecret);

    app.get(
      '/api/streak/status',
      sessionMiddleware,
      async (req: AuthenticatedSessionRequest, res) => {
        try {
          const telegramUserId = req.sessionUser?.telegramUserId;
          if (!telegramUserId) {
            res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
            return;
          }

          const result = await getStreakStatus(telegramUserId, db);
          res.status(200).json(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to fetch streak status';
          res.status(500).json({ error: 'Internal server error', message });
        }
      },
    );

    app.post(
      '/api/rewards/streak-save/intent',
      sessionMiddleware,
      async (req: AuthenticatedSessionRequest, res) => {
        try {
          const telegramUserId = req.sessionUser?.telegramUserId;
          if (!telegramUserId) {
            res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
            return;
          }

          const result = await requestStreakSaveIntent(telegramUserId, db, { redis, secret: rewardSecret });
          res.status(200).json(result);
        } catch (error) {
          if (error instanceof StreakNotAtRiskError) {
            res.status(400).json({ error: 'Streak not at risk', message: error.message });
            return;
          }
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
          const message = error instanceof Error ? error.message : 'Failed to create streak save intent';
          res.status(500).json({ error: 'Internal server error', message });
        }
      },
    );

    app.post(
      '/api/rewards/streak-save/redeem',
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

          const result = await redeemStreakSave(token, telegramUserId, db, { redis, secret: rewardSecret });
          res.status(200).json(result);
        } catch (error) {
          if (error instanceof StreakNotAtRiskError) {
            res.status(400).json({ error: 'Streak not at risk', message: error.message });
            return;
          }
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
          const message = error instanceof Error ? error.message : 'Failed to redeem streak save';
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
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await closeRedis();
  });

  beforeEach(async () => {
    profilesMap.clear();
    runsMap.clear();
    await redis.flushall();
  });

  function makeAuthHeaders(telegramUserId: number): Record<string, string> {
    const sessionToken = createSessionToken(
      telegramUserId,
      sessionSecret,
      '1h',
    );
    return {
      Authorization: `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
    };
  }

  function seedProfile(telegramUserId: number, overrides: Partial<PlayerProfile> = {}): PlayerProfile {
    const profile: PlayerProfile = {
      telegramUserId,
      username: `user_${telegramUserId}`,
      firstName: `User ${telegramUserId}`,
      lastName: null,
      photoUrl: null,
      coins: 100,
      xp: 50,
      level: 1,
      currentStreak: 0,
      longestStreak: 0,
      lastPlayedDate: null,
      gamesPlayed: 0,
      bestScore: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    profilesMap.set(telegramUserId, profile);
    return profile;
  }

  describe('GET /api/streak/status', () => {
    it('returns 401 when no session token is provided', async () => {
      const res = await fetch(`${baseUrl}/api/streak/status`);
      assert.equal(res.status, 401);
    });

    it('returns isAtRisk: false for a new profile with currentStreak 0', async () => {
      const userId = 7001;
      seedProfile(userId, { currentStreak: 0, longestStreak: 0, lastPlayedDate: null });

      const res = await fetch(`${baseUrl}/api/streak/status`, {
        headers: makeAuthHeaders(userId),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.isAtRisk, false);
      assert.equal(data.currentStreak, 0);
      assert.equal(data.longestStreak, 0);
      assert.equal(data.lastPlayedDate, null);
    });

    it('returns isAtRisk: false when played today', async () => {
      const userId = 7002;
      const today = getUtcDateString();
      seedProfile(userId, { currentStreak: 4, longestStreak: 4, lastPlayedDate: today });

      const res = await fetch(`${baseUrl}/api/streak/status`, {
        headers: makeAuthHeaders(userId),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.isAtRisk, false);
      assert.equal(data.currentStreak, 4);
      assert.equal(data.lastPlayedDate, today);
    });

    it('returns isAtRisk: false when played yesterday', async () => {
      const userId = 7003;
      const yesterday = getYesterdayUtcDateString();
      seedProfile(userId, { currentStreak: 5, longestStreak: 10, lastPlayedDate: yesterday });

      const res = await fetch(`${baseUrl}/api/streak/status`, {
        headers: makeAuthHeaders(userId),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.isAtRisk, false);
      assert.equal(data.currentStreak, 5);
      assert.equal(data.longestStreak, 10);
      assert.equal(data.lastPlayedDate, yesterday);
    });

    it('returns isAtRisk: true when played 2+ days ago with positive streak', async () => {
      const userId = 7004;
      seedProfile(userId, { currentStreak: 7, longestStreak: 7, lastPlayedDate: '2020-01-01' });

      const res = await fetch(`${baseUrl}/api/streak/status`, {
        headers: makeAuthHeaders(userId),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.isAtRisk, true);
      assert.equal(data.currentStreak, 7);
      assert.equal(data.lastPlayedDate, '2020-01-01');
    });

    it('returns isAtRisk: false when played 2+ days ago but streak is 0', async () => {
      const userId = 7005;
      seedProfile(userId, { currentStreak: 0, longestStreak: 12, lastPlayedDate: '2020-01-01' });

      const res = await fetch(`${baseUrl}/api/streak/status`, {
        headers: makeAuthHeaders(userId),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.isAtRisk, false);
      assert.equal(data.currentStreak, 0);
      assert.equal(data.longestStreak, 12);
    });
  });

  describe('POST /api/rewards/streak-save/intent', () => {
    it('returns 401 when no session token is provided', async () => {
      const res = await fetch(`${baseUrl}/api/rewards/streak-save/intent`, {
        method: 'POST',
      });
      assert.equal(res.status, 401);
    });

    it('returns 400 when streak is not at risk (played yesterday)', async () => {
      const userId = 7101;
      seedProfile(userId, {
        currentStreak: 3,
        longestStreak: 5,
        lastPlayedDate: getYesterdayUtcDateString(),
      });

      const res = await fetch(`${baseUrl}/api/rewards/streak-save/intent`, {
        method: 'POST',
        headers: makeAuthHeaders(userId),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'Streak not at risk');
    });

    it('returns 400 when streak is 0', async () => {
      const userId = 7102;
      seedProfile(userId, {
        currentStreak: 0,
        longestStreak: 10,
        lastPlayedDate: '2020-01-01',
      });

      const res = await fetch(`${baseUrl}/api/rewards/streak-save/intent`, {
        method: 'POST',
        headers: makeAuthHeaders(userId),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'Streak not at risk');
    });

    it('issues streak-save reward token when streak is at risk', async () => {
      const userId = 7103;
      seedProfile(userId, {
        currentStreak: 6,
        longestStreak: 6,
        lastPlayedDate: '2020-01-01',
      });

      const res = await fetch(`${baseUrl}/api/rewards/streak-save/intent`, {
        method: 'POST',
        headers: makeAuthHeaders(userId),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.ok, true);
      assert.ok(data.token);
      assert.equal(data.rewardType, 'streak-save');
      assert.equal(data.dailyCap, 1);
      assert.equal(data.currentStreak, 6);
      assert.equal(data.longestStreak, 6);
    });

    it('enforces daily cap of 1 and returns 429 on second attempt in same UTC day', async () => {
      const userId = 7104;
      seedProfile(userId, {
        currentStreak: 8,
        longestStreak: 8,
        lastPlayedDate: '2020-01-01',
      });

      const res1 = await fetch(`${baseUrl}/api/rewards/streak-save/intent`, {
        method: 'POST',
        headers: makeAuthHeaders(userId),
      });
      assert.equal(res1.status, 200);
      const data1 = await res1.json();

      const redeem1 = await fetch(`${baseUrl}/api/rewards/streak-save/redeem`, {
        method: 'POST',
        headers: makeAuthHeaders(userId),
        body: JSON.stringify({ token: data1.token }),
      });
      assert.equal(redeem1.status, 200);

      const p1 = profilesMap.get(userId)!;
      p1.lastPlayedDate = '2020-01-01';
      profilesMap.set(userId, p1);

      const res2 = await fetch(`${baseUrl}/api/rewards/streak-save/intent`, {
        method: 'POST',
        headers: makeAuthHeaders(userId),
      });
      assert.equal(res2.status, 429);
      const data2 = await res2.json();
      assert.equal(data2.ok, false);
      assert.equal(data2.error, 'Daily cap reached');
      assert.equal(data2.dailyCap, 1);
      assert.equal(data2.usedCount, 1);
    });

    it('resets daily cap on next UTC day', async () => {
      const userId = 7105;
      seedProfile(userId, {
        currentStreak: 5,
        longestStreak: 5,
        lastPlayedDate: '2020-01-01',
      });

      const day1 = new Date('2026-09-08T10:00:00.000Z');
      const day2 = new Date('2026-09-09T10:00:00.000Z');

      const intent1 = await requestStreakSaveIntent(userId, db, {
        redis,
        secret: rewardSecret,
        now: day1,
      });
      assert.equal(intent1.ok, true);
      assert.ok(intent1.token);

      await redeemStreakSave(intent1.token, userId, db, {
        redis,
        secret: rewardSecret,
        now: day1,
      });

      const p2 = profilesMap.get(userId)!;
      p2.lastPlayedDate = '2020-01-01';
      profilesMap.set(userId, p2);

      await assert.rejects(
        async () => {
          await requestStreakSaveIntent(userId, db, {
            redis,
            secret: rewardSecret,
            now: day1,
          });
        },
        (err) => err instanceof RewardCapReachedError,
      );

      const intent2 = await requestStreakSaveIntent(userId, db, {
        redis,
        secret: rewardSecret,
        now: day2,
      });
      assert.equal(intent2.ok, true);
      assert.ok(intent2.token);
    });
  });

  describe('POST /api/rewards/streak-save/redeem', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await fetch(`${baseUrl}/api/rewards/streak-save/redeem`, {
        method: 'POST',
        body: JSON.stringify({ token: 'some-token' }),
        headers: { 'Content-Type': 'application/json' },
      });
      assert.equal(res.status, 401);
    });

    it('returns 400 when token is missing', async () => {
      const userId = 7201;
      seedProfile(userId);

      const res = await fetch(`${baseUrl}/api/rewards/streak-save/redeem`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: makeAuthHeaders(userId),
      });
      assert.equal(res.status, 400);
    });

    it('returns 400 on invalid or malformed token', async () => {
      const userId = 7202;
      seedProfile(userId, { currentStreak: 4, lastPlayedDate: '2020-01-01' });

      const res = await fetch(`${baseUrl}/api/rewards/streak-save/redeem`, {
        method: 'POST',
        body: JSON.stringify({ token: 'invalid.token.here' }),
        headers: makeAuthHeaders(userId),
      });
      assert.equal(res.status, 400);
    });

    it('returns 403 when user B tries to redeem user A streak token', async () => {
      const userA = 7203;
      const userB = 7204;
      seedProfile(userA, { currentStreak: 5, lastPlayedDate: '2020-01-01' });
      seedProfile(userB, { currentStreak: 3, lastPlayedDate: '2020-01-01' });

      const intent = await requestStreakSaveIntent(userA, db, { redis, secret: rewardSecret });

      const res = await fetch(`${baseUrl}/api/rewards/streak-save/redeem`, {
        method: 'POST',
        body: JSON.stringify({ token: intent.token }),
        headers: makeAuthHeaders(userB),
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.error, 'Forbidden');
    });

    it('returns 400 when attempting to redeem bonus-coins token as streak-save', async () => {
      const userId = 7205;
      seedProfile(userId, { currentStreak: 5, lastPlayedDate: '2020-01-01' });

      const bonusToken = await issueRewardToken(userId, 'bonus-coins', {
        redis,
        secret: rewardSecret,
      });

      const res = await fetch(`${baseUrl}/api/rewards/streak-save/redeem`, {
        method: 'POST',
        body: JSON.stringify({ token: bonusToken }),
        headers: makeAuthHeaders(userId),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'Type mismatch');
    });

    it('returns 400 on double redemption of the same token', async () => {
      const userId = 7206;
      seedProfile(userId, { currentStreak: 5, lastPlayedDate: '2020-01-01' });

      const intent = await requestStreakSaveIntent(userId, db, { redis, secret: rewardSecret });

      const res1 = await fetch(`${baseUrl}/api/rewards/streak-save/redeem`, {
        method: 'POST',
        body: JSON.stringify({ token: intent.token }),
        headers: makeAuthHeaders(userId),
      });
      assert.equal(res1.status, 200);

      const res2 = await fetch(`${baseUrl}/api/rewards/streak-save/redeem`, {
        method: 'POST',
        body: JSON.stringify({ token: intent.token }),
        headers: makeAuthHeaders(userId),
      });
      assert.equal(res2.status, 400);
      const data2 = await res2.json();
      assert.equal(data2.error, 'Streak not at risk');
    });

    it('returns 400 if user finished a run after issuing token before redemption', async () => {
      const userId = 7207;
      const today = getUtcDateString();
      seedProfile(userId, { currentStreak: 4, lastPlayedDate: '2020-01-01' });

      const intent = await requestStreakSaveIntent(userId, db, { redis, secret: rewardSecret });

      const profile = profilesMap.get(userId)!;
      profile.lastPlayedDate = today;
      profilesMap.set(userId, profile);

      const res = await fetch(`${baseUrl}/api/rewards/streak-save/redeem`, {
        method: 'POST',
        body: JSON.stringify({ token: intent.token }),
        headers: makeAuthHeaders(userId),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'Streak not at risk');
    });

    it('successfully redeems token, updates lastPlayedDate to yesterday, and preserves streak', async () => {
      const userId = 7208;
      const yesterdayStr = getYesterdayUtcDateString();
      seedProfile(userId, {
        currentStreak: 9,
        longestStreak: 15,
        lastPlayedDate: '2020-01-01',
      });

      const intentRes = await fetch(`${baseUrl}/api/rewards/streak-save/intent`, {
        method: 'POST',
        headers: makeAuthHeaders(userId),
      });
      assert.equal(intentRes.status, 200);
      const intentData = await intentRes.json();

      const redeemRes = await fetch(`${baseUrl}/api/rewards/streak-save/redeem`, {
        method: 'POST',
        body: JSON.stringify({ token: intentData.token }),
        headers: makeAuthHeaders(userId),
      });
      assert.equal(redeemRes.status, 200);
      const redeemData = await redeemRes.json();
      assert.equal(redeemData.ok, true);
      assert.equal(redeemData.saved, true);
      assert.equal(redeemData.currentStreak, 9);
      assert.equal(redeemData.lastPlayedDate, yesterdayStr);

      const updatedProfile = profilesMap.get(userId)!;
      assert.equal(updatedProfile.currentStreak, 9);
      assert.equal(updatedProfile.lastPlayedDate, yesterdayStr);

      const statusRes = await fetch(`${baseUrl}/api/streak/status`, {
        headers: makeAuthHeaders(userId),
      });
      assert.equal(statusRes.status, 200);
      const statusData = await statusRes.json();
      assert.equal(statusData.isAtRisk, false);
      assert.equal(statusData.currentStreak, 9);
      assert.equal(statusData.lastPlayedDate, yesterdayStr);
    });

    it('end-to-end: streak increments on next run completion after streak-save instead of resetting to 1', async () => {
      const userId = 7209;
      seedProfile(userId, {
        currentStreak: 14,
        longestStreak: 20,
        lastPlayedDate: '2020-01-01',
      });

      const intent = await requestStreakSaveIntent(userId, db, { redis, secret: rewardSecret });
      await redeemStreakSave(intent.token, userId, db, { redis, secret: rewardSecret });

      const preRunProfile = profilesMap.get(userId)!;
      assert.equal(preRunProfile.currentStreak, 14);
      assert.equal(preRunProfile.lastPlayedDate, getYesterdayUtcDateString());

      const run = await createRun(userId, db, { mode: 'practice' });
      const finishResult = await finishRun(run.runId, userId, db);

      assert.equal(finishResult.currentStreak, 15);
      assert.equal(finishResult.longestStreak, 20);

      const postRunProfile = profilesMap.get(userId)!;
      assert.equal(postRunProfile.currentStreak, 15);
      assert.equal(postRunProfile.lastPlayedDate, getUtcDateString());
    });
  });
});
