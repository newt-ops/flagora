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
  STREAK_SAVE_PIN_COST,
} from '@flagora/shared';
import { initRedis, closeRedis } from '../db/redis.js';
import { createRequireSessionMiddleware, type AuthenticatedSessionRequest } from '../session/requireSession.js';
import { createSessionToken } from '../session/tokens.js';
import {
  getStreakStatus,
  saveStreak,
} from './streakSaveService.js';
import {
  StreakNotAtRiskError,
  RewardCapReachedError,
  InsufficientPinsError,
} from './rewardErrors.js';
import { finishRun, createRun, submitAnswer } from '../game/runService.js';
import type { GameRun } from '../game/runTypes.js';
import { seedFlags } from '../game/seedFlags.js';

describe('Ad-Free Streak-Save Backend', () => {
  let db: Db;
  let redis: RedisClient;
  let server: http.Server;
  let baseUrl: string;
  const profilesMap = new Map<number, PlayerProfile>();
  const runsMap = new Map<string, GameRun>();
  const flagsMap = new Map<string, CountryFlag>();
  const subscriptionsMap = new Map<number, { active: boolean }>();
  const sessionSecret = 'test-secret-streak-save-session-key';

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
      findOneAndUpdate: async (
        filter: { telegramUserId: number; pins?: { $gte: number } },
        update: { $inc?: { pins?: number }; $set?: Partial<PlayerProfile> },
      ) => {
        const existing = profilesMap.get(filter.telegramUserId);
        if (!existing) return null;
        if (filter.pins?.$gte !== undefined && (existing.pins ?? 0) < filter.pins.$gte) {
          return null;
        }
        const updated = { ...existing };
        if (update.$inc?.pins !== undefined) {
          updated.pins = (updated.pins ?? 0) + update.$inc.pins;
        }
        if (update.$set) {
          Object.assign(updated, update.$set);
        }
        profilesMap.set(filter.telegramUserId, updated);
        return updated;
      },
      updateOne: async (
        query: { telegramUserId: number },
        update: { $inc?: { pins?: number }; $set?: Partial<PlayerProfile> },
      ) => {
        const existing = profilesMap.get(query.telegramUserId);
        if (!existing) return { matchedCount: 0, modifiedCount: 0 };
        const updated = { ...existing };
        if (update.$inc?.pins !== undefined) {
          updated.pins = (updated.pins ?? 0) + update.$inc.pins;
        }
        if (update.$set) {
          Object.assign(updated, update.$set);
        }
        profilesMap.set(query.telegramUserId, updated);
        return { matchedCount: 1, modifiedCount: 1 };
      },
    };

    const mockRuns = {
      createIndex: async () => 'runId_1',
      deleteMany: async () => {
        runsMap.clear();
        return { deletedCount: 0 };
      },
      insertOne: async (doc: GameRun) => {
        runsMap.set(doc.runId, { ...doc });
        return { insertedId: doc.runId };
      },
      findOne: async (query: { runId: string }) => {
        const found = runsMap.get(query.runId);
        return found ? { ...found } : null;
      },
      updateOne: async (query: { runId: string }, update: { $set?: Partial<GameRun> }) => {
        const existing = runsMap.get(query.runId);
        if (!existing) return { matchedCount: 0, modifiedCount: 0 };
        const updated = { ...existing, ...update.$set };
        runsMap.set(query.runId, updated);
        return { matchedCount: 1, modifiedCount: 1 };
      },
      findOneAndUpdate: async (query: { runId: string }, update: { $set?: Partial<GameRun> }) => {
        const existing = runsMap.get(query.runId);
        if (!existing) return null;
        const updated = { ...existing, ...update.$set };
        runsMap.set(query.runId, updated);
        return updated;
      },
      countDocuments: async () => runsMap.size,
      find: () => ({
        sort: () => ({
          skip: () => ({
            limit: () => ({
              toArray: async () => Array.from(runsMap.values()),
            }),
          }),
        }),
      }),
    };

    const mockFlags = {
      createIndex: async () => 'isoCode_1',
      deleteMany: async () => {
        flagsMap.clear();
        return { deletedCount: 0 };
      },
      insertMany: async (docs: CountryFlag[]) => {
        for (const doc of docs) flagsMap.set(doc.isoCode, { ...doc });
        return { insertedCount: docs.length };
      },
      bulkWrite: async (ops: Array<{ updateOne: { filter: { isoCode: string }; update: { $set: CountryFlag } } }>) => {
        for (const op of ops) {
          flagsMap.set(op.updateOne.filter.isoCode, op.updateOne.update.$set);
        }
        return { upsertedCount: ops.length };
      },
      countDocuments: async () => flagsMap.size,
      find: () => ({
        toArray: async () => Array.from(flagsMap.values()),
      }),
    };

    const mockSubscriptions = {
      findOne: async (query: { telegramUserId: number }) => {
        const found = subscriptionsMap.get(query.telegramUserId);
        if (!found || !found.active) return null;
        return {
          telegramUserId: query.telegramUserId,
          status: 'active',
          currentPeriodEnd: new Date(Date.now() + 86400000 * 30),
        };
      },
    };

    return {
      collection: (name: string) => {
        if (name === 'profiles') return mockProfiles as unknown;
        if (name === 'runs') return mockRuns as unknown;
        if (name === 'flags') return mockFlags as unknown;
        if (name === 'subscriptions') return mockSubscriptions as unknown;
        return {
          createIndex: async () => '',
          deleteMany: async () => ({ deletedCount: 0 }),
          insertOne: async () => ({ insertedId: '' }),
          findOne: async () => null,
          updateOne: async () => ({ matchedCount: 0, modifiedCount: 0 }),
        } as unknown;
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
      '/api/streak/save',
      sessionMiddleware,
      async (req: AuthenticatedSessionRequest, res) => {
        try {
          const telegramUserId = req.sessionUser?.telegramUserId;
          if (!telegramUserId) {
            res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
            return;
          }

          const result = await saveStreak(telegramUserId, db, { redis });
          res.status(200).json(result);
        } catch (error) {
          if (error instanceof StreakNotAtRiskError) {
            res.status(400).json({ error: 'Streak not at risk', message: error.message });
            return;
          }
          if (error instanceof InsufficientPinsError) {
            res.status(400).json({ error: 'Insufficient pins', message: error.message });
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
          const message = error instanceof Error ? error.message : 'Failed to save streak';
          res.status(500).json({ error: 'Internal server error', message });
        }
      },
    );

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (typeof addr === 'object' && addr !== null) {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
    await closeRedis();
  });

  beforeEach(async () => {
    profilesMap.clear();
    runsMap.clear();
    subscriptionsMap.clear();
    await redis.flushall();
  });

  function createTestProfile(userId: number, overrides: Partial<PlayerProfile> = {}): PlayerProfile {
    const profile: PlayerProfile = {
      telegramUserId: userId,
      username: `user_${userId}`,
      firstName: `User${userId}`,
      lastName: null,
      photoUrl: null,
      pins: 100,
      xp: 0,
      level: 1,
      currentStreak: 5,
      longestStreak: 10,
      gamesPlayed: 5,
      bestScore: 100,
      lastPlayedDate: '2026-09-06',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    profilesMap.set(userId, profile);
    return profile;
  }

  describe('getStreakStatus', () => {
    it('returns isAtRisk true when lastPlayedDate was 2 days ago and streak > 0', async () => {
      const fixedNow = new Date('2026-09-08T12:00:00Z');
      createTestProfile(101, {
        currentStreak: 5,
        longestStreak: 10,
        lastPlayedDate: '2026-09-06',
      });

      const status = await getStreakStatus(101, db, { now: fixedNow });
      assert.equal(status.isAtRisk, true);
      assert.equal(status.currentStreak, 5);
      assert.equal(status.longestStreak, 10);
      assert.equal(status.lastPlayedDate, '2026-09-06');
    });

    it('returns isAtRisk false when played yesterday', async () => {
      const fixedNow = new Date('2026-09-08T12:00:00Z');
      createTestProfile(102, {
        currentStreak: 3,
        lastPlayedDate: '2026-09-07',
      });

      const status = await getStreakStatus(102, db, { now: fixedNow });
      assert.equal(status.isAtRisk, false);
    });

    it('returns isAtRisk false when streak is 0', async () => {
      const fixedNow = new Date('2026-09-08T12:00:00Z');
      createTestProfile(103, {
        currentStreak: 0,
        lastPlayedDate: '2026-09-01',
      });

      const status = await getStreakStatus(103, db, { now: fixedNow });
      assert.equal(status.isAtRisk, false);
    });
  });

  describe('saveStreak service logic', () => {
    it('successfully saves streak for non-Pro player and deducts 50 pins', async () => {
      const fixedNow = new Date('2026-09-08T12:00:00Z');
      createTestProfile(201, {
        pins: 150,
        currentStreak: 7,
        lastPlayedDate: '2026-09-06',
      });

      const result = await saveStreak(201, db, { now: fixedNow, redis });
      assert.equal(result.ok, true);
      assert.equal(result.saved, true);
      assert.equal(result.pinsDeducted, STREAK_SAVE_PIN_COST);
      assert.equal(result.pins, 100);
      assert.equal(result.lastPlayedDate, '2026-09-07');
      assert.equal(result.currentStreak, 7);

      const profile = profilesMap.get(201);
      assert.equal(profile?.pins, 100);
      assert.equal(profile?.lastPlayedDate, '2026-09-07');
    });

    it('saves streak for Pro player with 0 pins deducted', async () => {
      const fixedNow = new Date('2026-09-08T12:00:00Z');
      createTestProfile(202, {
        pins: 20,
        currentStreak: 12,
        lastPlayedDate: '2026-09-06',
      });
      subscriptionsMap.set(202, { active: true });

      const result = await saveStreak(202, db, { now: fixedNow, redis });
      assert.equal(result.ok, true);
      assert.equal(result.saved, true);
      assert.equal(result.pinsDeducted, 0);
      assert.equal(result.pins, 20);
      assert.equal(result.lastPlayedDate, '2026-09-07');

      const profile = profilesMap.get(202);
      assert.equal(profile?.pins, 20);
    });

    it('rejects when non-Pro player has fewer than 50 pins', async () => {
      const fixedNow = new Date('2026-09-08T12:00:00Z');
      createTestProfile(203, {
        pins: 45,
        currentStreak: 5,
        lastPlayedDate: '2026-09-06',
      });

      await assert.rejects(
        () => saveStreak(203, db, { now: fixedNow, redis }),
        InsufficientPinsError,
      );

      const profile = profilesMap.get(203);
      assert.equal(profile?.pins, 45);
      assert.equal(profile?.lastPlayedDate, '2026-09-06');
    });

    it('rejects when streak is not at risk', async () => {
      const fixedNow = new Date('2026-09-08T12:00:00Z');
      createTestProfile(204, {
        pins: 100,
        currentStreak: 4,
        lastPlayedDate: '2026-09-07',
      });

      await assert.rejects(
        () => saveStreak(204, db, { now: fixedNow, redis }),
        StreakNotAtRiskError,
      );
    });

    it('enforces daily cap of 1 streak save per UTC day', async () => {
      const fixedNow = new Date('2026-09-08T12:00:00Z');
      createTestProfile(205, {
        pins: 200,
        currentStreak: 4,
        lastPlayedDate: '2026-09-06',
      });

      const first = await saveStreak(205, db, { now: fixedNow, redis });
      assert.equal(first.ok, true);

      profilesMap.set(205, {
        ...profilesMap.get(205)!,
        lastPlayedDate: '2026-09-06',
      });

      await assert.rejects(
        () => saveStreak(205, db, { now: fixedNow, redis }),
        RewardCapReachedError,
      );
    });
  });

  describe('POST /api/streak/save HTTP endpoint', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await fetch(`${baseUrl}/api/streak/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      assert.equal(res.status, 401);
    });

    it('returns 400 when streak is not at risk', async () => {
      createTestProfile(301, {
        pins: 100,
        currentStreak: 3,
        lastPlayedDate: getYesterdayUtcDateString(),
      });
      const token = createSessionToken(301, sessionSecret);

      const res = await fetch(`${baseUrl}/api/streak/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      assert.equal(res.status, 400);
      const data = await res.json() as { error: string };
      assert.equal(data.error, 'Streak not at risk');
    });

    it('returns 400 when insufficient pins', async () => {
      const dayBeforeYesterday = getUtcDateString(new Date(Date.now() - 86400000 * 2));
      createTestProfile(302, {
        pins: 10,
        currentStreak: 5,
        lastPlayedDate: dayBeforeYesterday,
      });
      const token = createSessionToken(302, sessionSecret);

      const res = await fetch(`${baseUrl}/api/streak/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      assert.equal(res.status, 400);
      const data = await res.json() as { error: string };
      assert.equal(data.error, 'Insufficient pins');
    });

    it('returns 200 and preserves streak when saved', async () => {
      const dayBeforeYesterday = getUtcDateString(new Date(Date.now() - 86400000 * 2));
      createTestProfile(303, {
        pins: 80,
        currentStreak: 8,
        lastPlayedDate: dayBeforeYesterday,
      });
      const token = createSessionToken(303, sessionSecret);

      const res = await fetch(`${baseUrl}/api/streak/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      assert.equal(res.status, 200);
      const data = await res.json() as {
        ok: boolean;
        saved: boolean;
        pinsDeducted: number;
        pins: number;
        currentStreak: number;
      };
      assert.equal(data.ok, true);
      assert.equal(data.saved, true);
      assert.equal(data.pinsDeducted, 50);
      assert.equal(data.pins, 30);
      assert.equal(data.currentStreak, 8);
    });

    it('end-to-end: streak increments on next run after save instead of resetting to 1', async () => {
      const dayBeforeYesterday = getUtcDateString(new Date(Date.now() - 86400000 * 2));
      createTestProfile(304, {
        pins: 100,
        currentStreak: 6,
        lastPlayedDate: dayBeforeYesterday,
      });
      const token = createSessionToken(304, sessionSecret);

      const saveRes = await fetch(`${baseUrl}/api/streak/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      assert.equal(saveRes.status, 200);

      const run = await createRun(304, db, { mode: 'practice' });
      await submitAnswer(run.runId, 304, 0, run.flags[0].isoCode, db);
      const finishRes = await finishRun(run.runId, 304, db);
      assert.equal(finishRes.currentStreak, 7);
      assert.equal(finishRes.streakChange, 'incremented');
    });
  });
});
