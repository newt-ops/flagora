import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import type { Redis as RedisClient } from 'ioredis';
import type { PlayerProfile } from '@flagora/shared';
import { initRedis, closeRedis } from '../db/redis.js';
import { createRequireSessionMiddleware, type AuthenticatedSessionRequest } from '../session/requireSession.js';
import { createSessionToken } from '../session/tokens.js';
import { finishRun, submitAnswer } from '../game/runService.js';
import {
  startDailyChallenge,
  getDailyChallengeStatus,
  getDailyLeaderboard,
  getOrCreateDailyDefinition,
} from './dailyService.js';
import { DailyChallengeAlreadyAttemptedError } from './dailyTypes.js';

describe('daily challenge backend and rules', () => {
  let mongod: MongoMemoryServer;
  let mongoClient: MongoClient;
  let db: Db;
  let redis: RedisClient;
  let server: http.Server;
  let baseUrl: string;
  const sessionSecret = 'test-secret-daily-challenge';

  before(async () => {
    mongod = await MongoMemoryServer.create();
    mongoClient = new MongoClient(mongod.getUri());
    await mongoClient.connect();
    db = mongoClient.db('test-daily');

    await db.collection('profiles').createIndex({ telegramUserId: 1 }, { unique: true });
    await db.collection('daily_challenge_definitions').createIndex({ date: 1 }, { unique: true });
    await db.collection('daily_challenge_attempts').createIndex({ telegramUserId: 1, date: 1 }, { unique: true });

    redis = await initRedis('memory');

    const app = express();
    app.use(express.json());
    const sessionMiddleware = createRequireSessionMiddleware(sessionSecret);

    app.post('/api/daily/start', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
      try {
        const telegramUserId = req.sessionUser?.telegramUserId;
        if (!telegramUserId) {
          res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
          return;
        }

        const run = await startDailyChallenge(telegramUserId, db);
        res.status(200).json(run);
      } catch (error) {
        if (error instanceof DailyChallengeAlreadyAttemptedError) {
          res.status(400).json({ error: 'Already attempted', message: error.message });
          return;
        }
        const message = error instanceof Error ? error.message : 'Failed to start daily challenge';
        res.status(500).json({ error: 'Internal server error', message });
      }
    });

    app.get('/api/daily/status', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
      try {
        const telegramUserId = req.sessionUser?.telegramUserId;
        if (!telegramUserId) {
          res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
          return;
        }

        const status = await getDailyChallengeStatus(telegramUserId, db);
        res.status(200).json(status);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get daily challenge status';
        res.status(500).json({ error: 'Internal server error', message });
      }
    });

    app.get('/api/daily/leaderboard', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
      try {
        const telegramUserId = req.sessionUser?.telegramUserId;
        if (!telegramUserId) {
          res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
          return;
        }

        const rawLimit = Number(req.query.limit);
        const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 50;
        const result = await getDailyLeaderboard(telegramUserId, db, redis, undefined, limit);
        res.status(200).json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch daily leaderboard';
        res.status(500).json({ error: 'Internal server error', message });
      }
    });

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });
    const addr = server.address();
    if (addr && typeof addr === 'object') {
      baseUrl = `http://127.0.0.1:${addr.port}`;
    }
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await closeRedis();
    if (mongoClient) {
      await mongoClient.close();
    }
    if (mongod) {
      await mongod.stop();
    }
  });

  it('enforces one attempt per day and rejects concurrent first attempts via unique index', async () => {
    const userId = 8001;
    const testDate = '2026-05-10';

    const results = await Promise.allSettled([
      startDailyChallenge(userId, db, testDate),
      startDailyChallenge(userId, db, testDate),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);

    if (rejected[0].status === 'rejected') {
      assert.ok(rejected[0].reason instanceof DailyChallengeAlreadyAttemptedError);
    }

    const attempts = await db
      .collection('daily_challenge_attempts')
      .find({ telegramUserId: userId, date: testDate })
      .toArray();
    assert.equal(attempts.length, 1);

    await assert.rejects(
      async () => {
        await startDailyChallenge(userId, db, testDate);
      },
      DailyChallengeAlreadyAttemptedError,
    );
  });

  it('delivers identical flag set and choices for all players on the same date', async () => {
    const testDate = '2026-05-11';
    const userA = 8002;
    const userB = 8003;

    const runA = await startDailyChallenge(userA, db, testDate);
    const runB = await startDailyChallenge(userB, db, testDate);

    assert.notEqual(runA.runId, runB.runId);
    assert.equal(runA.flags.length, 10);
    assert.equal(runB.flags.length, 10);

    for (let i = 0; i < 10; i++) {
      assert.equal(runA.flags[i].isoCode, runB.flags[i].isoCode);
      assert.equal(runA.flags[i].flagIndex, runB.flags[i].flagIndex);
      assert.deepEqual(runA.flags[i].choices, runB.flags[i].choices);
    }

    const defs = await db
      .collection('daily_challenge_definitions')
      .find({ date: testDate })
      .toArray();
    assert.equal(defs.length, 1);
  });

  it('does not alter profile bestScore or global leaderboard for daily runs, but updates daily leaderboard', async () => {
    const userId = 8004;
    const testDate = '2026-05-12';

    await db.collection<PlayerProfile>('profiles').insertOne({
      telegramUserId: userId,
      firstName: 'DailyTester',
      coins: 0,
      xp: 0,
      level: 1,
      currentStreak: 0,
      longestStreak: 0,
      gamesPlayed: 0,
      bestScore: 500,
      lastPlayedDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const startRes = await startDailyChallenge(userId, db, testDate);
    assert.ok(startRes.runId);

    const definition = await getOrCreateDailyDefinition(testDate, db);
    for (let i = 0; i < 5; i++) {
      const flag = definition.flags[i];
      await submitAnswer(startRes.runId, userId, i, flag.isoCode, db);
    }

    const finishResult = await finishRun(startRes.runId, userId, db, redis);

    assert.equal(finishResult.isNewBest, false);
    assert.equal(finishResult.bestScore, 500);
    assert.ok(finishResult.totalScore > 0);
    assert.ok(finishResult.xpEarned > 0);
    assert.ok(finishResult.coinsEarned > 0);
    assert.equal(finishResult.currentStreak, 1);

    const profileAfter = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: userId });
    assert.equal(profileAfter?.bestScore, 500);
    assert.equal(profileAfter?.gamesPlayed, 1);
    assert.equal(profileAfter?.currentStreak, 1);

    const globalScore = await redis.zscore('leaderboard:global', String(userId));
    assert.equal(globalScore, null);

    const dailyScore = await redis.zscore(`leaderboard:daily:${testDate}`, String(userId));
    assert.equal(Number(dailyScore), finishResult.totalScore);
  });

  it('reflects status accurately through not_attempted, in_progress, and finished', async () => {
    const userId = 8005;
    const testDate = '2026-05-13';

    const statusBefore = await getDailyChallengeStatus(userId, db, testDate);
    assert.equal(statusBefore.attempted, false);
    assert.equal(statusBefore.status, 'not_attempted');
    assert.equal(statusBefore.result, null);

    const startRes = await startDailyChallenge(userId, db, testDate);
    const statusDuring = await getDailyChallengeStatus(userId, db, testDate);
    assert.equal(statusDuring.attempted, true);
    assert.equal(statusDuring.status, 'in_progress');
    assert.equal(statusDuring.runId, startRes.runId);
    assert.equal(statusDuring.result, null);

    const finishResult = await finishRun(startRes.runId, userId, db, redis);
    const statusAfter = await getDailyChallengeStatus(userId, db, testDate);
    assert.equal(statusAfter.attempted, true);
    assert.equal(statusAfter.status, 'finished');
    assert.equal(statusAfter.runId, startRes.runId);
    assert.equal(statusAfter.result?.totalScore, finishResult.totalScore);
  });

  it('returns correctly ordered daily leaderboard and player rank', async () => {
    const testDate = '2026-05-14';
    const userA = 8010;
    const userB = 8011;

    await db.collection<PlayerProfile>('profiles').insertMany([
      {
        telegramUserId: userA,
        username: 'alice_daily',
        firstName: 'Alice',
        coins: 0,
        xp: 0,
        level: 1,
        currentStreak: 0,
        longestStreak: 0,
        gamesPlayed: 0,
        bestScore: 0,
        lastPlayedDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        telegramUserId: userB,
        firstName: 'Bob',
        coins: 0,
        xp: 0,
        level: 1,
        currentStreak: 0,
        longestStreak: 0,
        gamesPlayed: 0,
        bestScore: 0,
        lastPlayedDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await redis.zadd(`leaderboard:daily:${testDate}`, 950, String(userA));
    await redis.zadd(`leaderboard:daily:${testDate}`, 620, String(userB));

    const leaderboardResA = await getDailyLeaderboard(userA, db, redis, testDate);
    assert.equal(leaderboardResA.date, testDate);
    assert.equal(leaderboardResA.top.length, 2);
    assert.equal(leaderboardResA.top[0].telegramUserId, userA);
    assert.equal(leaderboardResA.top[0].displayName, '@alice_daily');
    assert.equal(leaderboardResA.top[0].bestScore, 950);
    assert.equal(leaderboardResA.top[0].rank, 1);
    assert.equal(leaderboardResA.top[1].telegramUserId, userB);
    assert.equal(leaderboardResA.top[1].rank, 2);
    assert.equal(leaderboardResA.me.ranked, true);
    assert.equal(leaderboardResA.me.rank, 1);
    assert.equal(leaderboardResA.me.bestScore, 950);

    const leaderboardResB = await getDailyLeaderboard(userB, db, redis, testDate);
    assert.equal(leaderboardResB.me.ranked, true);
    assert.equal(leaderboardResB.me.rank, 2);
    assert.equal(leaderboardResB.me.bestScore, 620);

    const unrankedRes = await getDailyLeaderboard(9999, db, redis, testDate);
    assert.equal(unrankedRes.me.ranked, false);
    assert.equal(unrankedRes.me.rank, null);
    assert.equal(unrankedRes.me.bestScore, 0);
  });

  it('validates HTTP endpoints requiring session auth and returning 400 on duplicate attempt', async () => {
    const unauthStart = await fetch(`${baseUrl}/api/daily/start`, { method: 'POST' });
    assert.equal(unauthStart.status, 401);

    const unauthStatus = await fetch(`${baseUrl}/api/daily/status`, { method: 'GET' });
    assert.equal(unauthStatus.status, 401);

    const unauthLb = await fetch(`${baseUrl}/api/daily/leaderboard`, { method: 'GET' });
    assert.equal(unauthLb.status, 401);

    const userId = 8020;
    const token = createSessionToken(userId, sessionSecret);

    const firstStart = await fetch(`${baseUrl}/api/daily/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(firstStart.status, 200);
    const startBody = await firstStart.json();
    assert.ok(startBody.runId);
    assert.equal(startBody.flags.length, 10);

    const secondStart = await fetch(`${baseUrl}/api/daily/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(secondStart.status, 400);
    const secondBody = await secondStart.json();
    assert.equal(secondBody.error, 'Already attempted');

    const statusRes = await fetch(`${baseUrl}/api/daily/status`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(statusRes.status, 200);
    const statusBody = await statusRes.json();
    assert.equal(statusBody.attempted, true);
    assert.equal(statusBody.status, 'in_progress');

    const lbRes = await fetch(`${baseUrl}/api/daily/leaderboard`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(lbRes.status, 200);
    const lbBody = await lbRes.json();
    assert.ok(Array.isArray(lbBody.top));
    assert.ok(lbBody.me);
  });
});
