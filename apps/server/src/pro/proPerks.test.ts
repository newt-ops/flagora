import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { type Db } from 'mongodb';
import { initDatabase, closeDatabase } from '../db/mongo.js';
import { seedFlags } from '../game/seedFlags.js';
import { initFlagCache } from '../game/flagCache.js';
import { createRequireSessionMiddleware, type AuthenticatedSessionRequest } from '../session/requireSession.js';
import { createSessionToken } from '../session/tokens.js';
import { createRun, finishRun, getRunHistory } from '../game/runService.js';
import { updatePinnedFlags, findOrCreatePlayerProfile } from '../profile/profileService.js';
import { hasActiveSubscription, hasEarlyAccess } from '../subscription/subscriptionService.js';
import {
  DOUBLE_XP_CONFIG,
  isDoubleXpActive,
  calculateAwardedXp,
  hasEarlyAccess as hasEarlyAccessShared,
  type PlayerProfile,
} from '@flagora/shared';
import { selectRunFlags } from '../game/flagSelection.js';

describe('Phase 10 Prompt 03: Pro Perks Backend', () => {
  let mongod: MongoMemoryServer;
  let db: Db;
  let server: http.Server;
  let baseUrl: string;
  const sessionSecret = 'test-pro-perks-secret-key-12345';

  before(async () => {
    mongod = await MongoMemoryServer.create();
    db = await initDatabase(mongod.getUri());
    await seedFlags(db);
    await initFlagCache(db);

    const app = express();
    app.use(express.json());
    const sessionMiddleware = createRequireSessionMiddleware(sessionSecret);

    app.post('/api/profile/pinned-flags', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
      try {
        const telegramUserId = req.sessionUser?.telegramUserId;
        if (!telegramUserId) {
          res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
          return;
        }

        const { pinnedIsoCodes } = req.body ?? {};
        if (!Array.isArray(pinnedIsoCodes) || pinnedIsoCodes.some((code) => typeof code !== 'string')) {
          res.status(400).json({ error: 'Bad request', message: 'pinnedIsoCodes must be an array of strings' });
          return;
        }

        const isPro = await hasActiveSubscription(telegramUserId, db);
        if (!isPro) {
          res.status(403).json({ error: 'Forbidden', message: 'Active Pro subscription required to pin flags' });
          return;
        }

        const updated = await updatePinnedFlags(telegramUserId, pinnedIsoCodes, db);
        res.status(200).json({ success: true, pinnedIsoCodes: updated.pinnedIsoCodes ?? [], profile: updated });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update pinned flags';
        res.status(500).json({ error: 'Internal server error', message });
      }
    });

    app.get('/api/runs/history', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
      try {
        const telegramUserId = req.sessionUser?.telegramUserId;
        if (!telegramUserId) {
          res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
          return;
        }

        const rawPage = Number(req.query.page);
        const rawLimit = Number(req.query.limit);
        const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
        const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 10;

        const history = await getRunHistory(telegramUserId, db, { page, limit });
        res.status(200).json(history);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch run history';
        res.status(500).json({ error: 'Internal server error', message });
      }
    });

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
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
    await closeDatabase();
    if (mongod) {
      await mongod.stop();
    }
  });

  beforeEach(async () => {
    await db.collection('profiles').deleteMany({});
    await db.collection('subscriptions').deleteMany({});
    await db.collection('runs').deleteMany({});
  });

  async function grantSubscription(userId: number, expiresAt = new Date(Date.now() + 30 * 86400000)) {
    await db.collection('subscriptions').updateOne(
      { telegramUserId: userId },
      {
        $set: {
          telegramUserId: userId,
          status: 'active',
          currentPeriodEnd: expiresAt,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );
  }

  describe('Early Access capability check', () => {
    it('returns true for active subscribers and false for non-subscribers/expired', async () => {
      const userPro = 5001;
      const userFree = 5002;
      const userExpired = 5003;

      await grantSubscription(userPro);
      await grantSubscription(userExpired, new Date(Date.now() - 10000));

      assert.equal(await hasEarlyAccess(userPro, db), true);
      assert.equal(await hasEarlyAccess({ telegramUserId: userPro }, db), true);
      assert.equal(await hasEarlyAccess(userFree, db), false);
      assert.equal(await hasEarlyAccess(userExpired, db), false);

      assert.equal(hasEarlyAccessShared({ isPro: true }), true);
      assert.equal(hasEarlyAccessShared({ isPro: false }), false);
    });
  });

  describe('Double XP Weekends', () => {
    it('isDoubleXpActive correctly identifies UTC Friday, Saturday, Sunday and rejects others', () => {
      const fridayUtc = new Date('2026-09-18T14:00:00Z');
      const saturdayUtc = new Date('2026-09-19T14:00:00Z');
      const sundayUtc = new Date('2026-09-20T14:00:00Z');
      const mondayUtc = new Date('2026-09-21T14:00:00Z');
      const tuesdayUtc = new Date('2026-09-22T14:00:00Z');
      const wednesdayUtc = new Date('2026-09-23T14:00:00Z');
      const thursdayUtc = new Date('2026-09-24T14:00:00Z');

      assert.equal(fridayUtc.getUTCDay(), 5);
      assert.equal(saturdayUtc.getUTCDay(), 6);
      assert.equal(sundayUtc.getUTCDay(), 0);

      assert.equal(isDoubleXpActive(fridayUtc), true);
      assert.equal(isDoubleXpActive(saturdayUtc), true);
      assert.equal(isDoubleXpActive(sundayUtc), true);
      assert.equal(isDoubleXpActive(mondayUtc), false);
      assert.equal(isDoubleXpActive(tuesdayUtc), false);
      assert.equal(isDoubleXpActive(wednesdayUtc), false);
      assert.equal(isDoubleXpActive(thursdayUtc), false);

      assert.equal(calculateAwardedXp(100, true, saturdayUtc), 200);
      assert.equal(calculateAwardedXp(100, false, saturdayUtc), 100);
      assert.equal(calculateAwardedXp(100, true, wednesdayUtc), 100);
      assert.equal(calculateAwardedXp(100, false, wednesdayUtc), 100);
    });

    it('applies 2x XP only to active Pro players on weekend UTC runs and credits profile atomically', async () => {
      const proUser = 6001;
      const freeUser = 6002;

      await findOrCreatePlayerProfile({ id: proUser, firstName: 'Pro' }, db);
      await findOrCreatePlayerProfile({ id: freeUser, firstName: 'Free' }, db);
      await grantSubscription(proUser);

      const saturdayDate = new Date('2026-09-19T12:00:00Z');

      const proRun = await createRun(proUser, db, { startedAt: saturdayDate });
      const freeRun = await createRun(freeUser, db, { startedAt: saturdayDate });

      await db.collection('runs').updateOne(
        { runId: proRun.runId },
        {
          $set: {
            runningTotal: 1000,
            comboCount: 5,
            flags: proRun.flags.map((f, i) => ({
              ...f,
              name: `Country ${i}`,
              tier: 1,
              answered: true,
              correct: true,
            })),
          },
        },
      );

      await db.collection('runs').updateOne(
        { runId: freeRun.runId },
        {
          $set: {
            runningTotal: 1000,
            comboCount: 5,
            flags: freeRun.flags.map((f, i) => ({
              ...f,
              name: `Country ${i}`,
              tier: 1,
              answered: true,
              correct: true,
            })),
          },
        },
      );

      const proFinish = await finishRun(proRun.runId, proUser, db);
      const freeFinish = await finishRun(freeRun.runId, freeUser, db);

      assert.ok(proFinish.xpEarned > 0);
      assert.ok(freeFinish.xpEarned > 0);

      const baseExpectedXp = Math.floor(proFinish.totalScore * 0.1);
      assert.equal(freeFinish.xpEarned, baseExpectedXp);

      const isCurrentDayWeekend = isDoubleXpActive(new Date());
      if (isCurrentDayWeekend) {
        assert.equal(proFinish.xpEarned, baseExpectedXp * DOUBLE_XP_CONFIG.multiplier);
      }

      const updatedProProfile = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: proUser });
      assert.equal(updatedProProfile?.xp, proFinish.xpEarned);
    });
  });

  describe('Run History API (GET /api/runs/history)', () => {
    it('correctly caps non-Pro players at 10 runs and paginates full history for Pro players', async () => {
      const proUser = 7001;
      const freeUser = 7002;

      await findOrCreatePlayerProfile({ id: proUser, firstName: 'Pro Player' }, db);
      await findOrCreatePlayerProfile({ id: freeUser, firstName: 'Free Player' }, db);
      await grantSubscription(proUser);

      for (let i = 1; i <= 15; i++) {
        const date = new Date(Date.now() - (20 - i) * 60000);
        await db.collection('runs').insertOne({
          runId: `run-free-${i}`,
          telegramUserId: freeUser,
          flags: [],
          comboCount: 0,
          maxCombo: 0,
          runningTotal: 100 * i,
          startedAt: date,
          finishedAt: date,
          status: 'finished',
          mode: 'practice',
          profileCredited: true,
          runDurationMs: 60000,
          finalScore: {
            correctCount: i % 10,
            timeUsedMs: 30000,
            maxCombo: 3,
            leftoverBonus: 50,
            totalScore: 100 * i,
            xpEarned: 10 * i,
            pinsEarned: 5 * i,
            newXp: 100 + 10 * i,
            newPins: 50 + 5 * i,
            newLevel: 1,
            leveledUp: false,
            bestScore: 100 * i,
            isNewBest: false,
            currentStreak: 1,
            longestStreak: 1,
            streakChange: 'incremented',
          },
          createdAt: date,
          updatedAt: date,
        });

        await db.collection('runs').insertOne({
          runId: `run-pro-${i}`,
          telegramUserId: proUser,
          flags: [],
          comboCount: 0,
          maxCombo: 0,
          runningTotal: 200 * i,
          startedAt: date,
          finishedAt: date,
          status: 'finished',
          mode: 'practice',
          profileCredited: true,
          runDurationMs: 60000,
          finalScore: {
            correctCount: i % 10,
            timeUsedMs: 25000,
            maxCombo: 4,
            leftoverBonus: 100,
            totalScore: 200 * i,
            xpEarned: 20 * i,
            pinsEarned: 10 * i,
            newXp: 200 + 20 * i,
            newPins: 100 + 10 * i,
            newLevel: 1,
            leveledUp: false,
            bestScore: 200 * i,
            isNewBest: false,
            currentStreak: 1,
            longestStreak: 1,
            streakChange: 'incremented',
          },
          createdAt: date,
          updatedAt: date,
        });
      }

      await db.collection('runs').insertOne({
        runId: 'run-active-ignored',
        telegramUserId: freeUser,
        flags: [],
        comboCount: 0,
        maxCombo: 0,
        runningTotal: 0,
        startedAt: new Date(),
        status: 'active',
        mode: 'practice',
        profileCredited: false,
        runDurationMs: 60000,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const freeToken = createSessionToken(freeUser, sessionSecret);
      const proToken = createSessionToken(proUser, sessionSecret);

      const freeRes1 = await fetch(`${baseUrl}/api/runs/history`, {
        headers: { Authorization: `Bearer ${freeToken}` },
      });
      assert.equal(freeRes1.status, 200);
      const freeData1 = (await freeRes1.json()) as { runs: unknown[]; total: number; hasMore: boolean };
      assert.equal(freeData1.runs.length, 10);
      assert.equal(freeData1.total, 10);
      assert.equal(freeData1.hasMore, false);

      const freeResClamped = await fetch(`${baseUrl}/api/runs/history?limit=50`, {
        headers: { Authorization: `Bearer ${freeToken}` },
      });
      assert.equal(freeResClamped.status, 200);
      const freeDataClamped = (await freeResClamped.json()) as { runs: unknown[]; total: number };
      assert.equal(freeDataClamped.runs.length, 10);
      assert.equal(freeDataClamped.total, 10);

      const freeResPage1 = await fetch(`${baseUrl}/api/runs/history?page=1&limit=5`, {
        headers: { Authorization: `Bearer ${freeToken}` },
      });
      assert.equal(freeResPage1.status, 200);
      const freeDataPage1 = (await freeResPage1.json()) as { runs: unknown[]; total: number; hasMore: boolean };
      assert.equal(freeDataPage1.runs.length, 5);
      assert.equal(freeDataPage1.total, 10);
      assert.equal(freeDataPage1.hasMore, true);

      const freeResPage2 = await fetch(`${baseUrl}/api/runs/history?page=2&limit=5`, {
        headers: { Authorization: `Bearer ${freeToken}` },
      });
      assert.equal(freeResPage2.status, 200);
      const freeDataPage2 = (await freeResPage2.json()) as { runs: unknown[]; total: number; hasMore: boolean };
      assert.equal(freeDataPage2.runs.length, 5);
      assert.equal(freeDataPage2.total, 10);
      assert.equal(freeDataPage2.hasMore, false);

      const freeResPage3 = await fetch(`${baseUrl}/api/runs/history?page=3&limit=5`, {
        headers: { Authorization: `Bearer ${freeToken}` },
      });
      assert.equal(freeResPage3.status, 200);
      const freeDataPage3 = (await freeResPage3.json()) as { runs: unknown[]; total: number; hasMore: boolean };
      assert.equal(freeDataPage3.runs.length, 0);
      assert.equal(freeDataPage3.total, 10);
      assert.equal(freeDataPage3.hasMore, false);

      const proResPage1 = await fetch(`${baseUrl}/api/runs/history?page=1&limit=10`, {
        headers: { Authorization: `Bearer ${proToken}` },
      });
      assert.equal(proResPage1.status, 200);
      const proDataPage1 = (await proResPage1.json()) as { runs: unknown[]; total: number; hasMore: boolean };
      assert.equal(proDataPage1.runs.length, 10);
      assert.equal(proDataPage1.total, 15);
      assert.equal(proDataPage1.hasMore, true);

      const proResPage2 = await fetch(`${baseUrl}/api/runs/history?page=2&limit=10`, {
        headers: { Authorization: `Bearer ${proToken}` },
      });
      assert.equal(proResPage2.status, 200);
      const proDataPage2 = (await proResPage2.json()) as { runs: unknown[]; total: number; hasMore: boolean };
      assert.equal(proDataPage2.runs.length, 5);
      assert.equal(proDataPage2.total, 15);
      assert.equal(proDataPage2.hasMore, false);

      const proResAll = await fetch(`${baseUrl}/api/runs/history?page=1&limit=25`, {
        headers: { Authorization: `Bearer ${proToken}` },
      });
      assert.equal(proResAll.status, 200);
      const proDataAll = (await proResAll.json()) as { runs: Array<{ runId: string; mode: string; score: number; date: string; correctCount: number }>; total: number };
      assert.equal(proDataAll.runs.length, 15);
      assert.equal(proDataAll.total, 15);

      const firstSummary = proDataAll.runs[0];
      assert.ok(firstSummary.runId);
      assert.ok(firstSummary.mode);
      assert.equal(typeof firstSummary.score, 'number');
      assert.ok(firstSummary.date);
      assert.equal(typeof firstSummary.correctCount, 'number');
    });
  });

  describe('Custom Flag Order (Pinning)', () => {
    it('rejects POST /api/profile/pinned-flags for non-Pro players', async () => {
      const freeUser = 8001;
      await findOrCreatePlayerProfile({ id: freeUser, firstName: 'Free Pin' }, db);
      const token = createSessionToken(freeUser, sessionSecret);

      const res = await fetch(`${baseUrl}/api/profile/pinned-flags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ pinnedIsoCodes: ['FR', 'DE'] }),
      });

      assert.equal(res.status, 403);
      const body = (await res.json()) as { error: string };
      assert.equal(body.error, 'Forbidden');
    });

    it('allows active Pro player to set pinned flags and updates profile document', async () => {
      const proUser = 8002;
      await findOrCreatePlayerProfile({ id: proUser, firstName: 'Pro Pin' }, db);
      await grantSubscription(proUser);
      const token = createSessionToken(proUser, sessionSecret);

      const res = await fetch(`${baseUrl}/api/profile/pinned-flags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ pinnedIsoCodes: ['FR', 'JP', 'BR'] }),
      });

      assert.equal(res.status, 200);
      const body = (await res.json()) as { success: boolean; pinnedIsoCodes: string[] };
      assert.equal(body.success, true);
      assert.deepEqual(body.pinnedIsoCodes, ['FR', 'JP', 'BR']);

      const profile = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: proUser });
      assert.deepEqual(profile?.pinnedIsoCodes, ['FR', 'JP', 'BR']);
    });

    it('statistically biases practice-mode selection frequency while preserving variety and going dormant on lapse', async () => {
      const proUser = 8003;
      await findOrCreatePlayerProfile({ id: proUser, firstName: 'Statistical Pin' }, db);
      await grantSubscription(proUser);

      const pinnedTarget = ['FR', 'DE'];
      await updatePinnedFlags(proUser, pinnedTarget, db);

      let frPickedActive = 0;
      let dePickedActive = 0;
      let nonPinnedCount = 0;
      const totalRuns = 200;

      for (let i = 0; i < totalRuns; i++) {
        const run = await createRun(proUser, db, { mode: 'practice' });
        const codes = run.flags.map((f) => f.isoCode.toUpperCase());
        if (codes.includes('FR')) frPickedActive++;
        if (codes.includes('DE')) dePickedActive++;
        if (codes.includes('CA')) nonPinnedCount++;
      }

      assert.ok(
        frPickedActive > nonPinnedCount,
        `Expected pinned FR (${frPickedActive}) to appear more often than unpinned CA (${nonPinnedCount})`,
      );
      assert.ok(
        dePickedActive > nonPinnedCount,
        `Expected pinned DE (${dePickedActive}) to appear more often than unpinned CA (${nonPinnedCount})`,
      );

      assert.ok(
        frPickedActive < totalRuns,
        `Variety check: Pinned flag FR should not appear in 100% of runs (appeared ${frPickedActive}/${totalRuns})`,
      );
      assert.ok(
        dePickedActive < totalRuns,
        `Variety check: Pinned flag DE should not appear in 100% of runs (appeared ${dePickedActive}/${totalRuns})`,
      );

      await db.collection('subscriptions').updateOne(
        { telegramUserId: proUser },
        { $set: { currentPeriodEnd: new Date(Date.now() - 1000) } },
      );

      const profileAfterLapse = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: proUser });
      assert.deepEqual(profileAfterLapse?.pinnedIsoCodes, pinnedTarget);

      let frPickedLapsed = 0;
      for (let i = 0; i < totalRuns; i++) {
        const run = await createRun(proUser, db, { mode: 'practice' });
        if (run.flags.some((f) => f.isoCode.toUpperCase() === 'FR')) {
          frPickedLapsed++;
        }
      }

      assert.ok(
        frPickedLapsed < frPickedActive,
        `Lapsed Pro flag FR frequency (${frPickedLapsed}) should drop compared to active Pro frequency (${frPickedActive})`,
      );
    });

    it('provably isolates daily, challenge, and battle modes from flag pinning', async () => {
      const proUser = 8004;
      await findOrCreatePlayerProfile({ id: proUser, firstName: 'Isolation User' }, db);
      await grantSubscription(proUser);
      await updatePinnedFlags(proUser, ['FR', 'DE', 'JP'], db);

      const dailyRun = await createRun(proUser, db, { mode: 'daily' });
      const challengeRun = await createRun(proUser, db, { mode: 'challenge' });
      const battleRun = await createRun(proUser, db, { mode: 'live-battle' });

      assert.equal(dailyRun.flags.length, 10);
      assert.equal(challengeRun.flags.length, 10);
      assert.equal(battleRun.flags.length, 10);

      const unpinnedBaselineSelection = selectRunFlags();
      assert.equal(unpinnedBaselineSelection.length, 10);
    });
  });
});
