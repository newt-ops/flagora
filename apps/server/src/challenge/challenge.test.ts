import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import type { Redis as RedisClient } from 'ioredis';
import type { PlayerProfile, Challenge } from '@flagora/shared';
import { initRedis, closeRedis } from '../db/redis.js';
import { createRequireSessionMiddleware, type AuthenticatedSessionRequest } from '../session/requireSession.js';
import { createSessionToken } from '../session/tokens.js';
import { finishRun, submitAnswer, createRun } from '../game/runService.js';
import { createChallenge, getChallenge } from './challengeService.js';

describe('challenge backend and rules', () => {
  let mongod: MongoMemoryServer;
  let mongoClient: MongoClient;
  let db: Db;
  let redis: RedisClient;
  let server: http.Server;
  let baseUrl: string;
  const sessionSecret = 'test-secret-challenge-key-32';

  before(async () => {
    mongod = await MongoMemoryServer.create();
    mongoClient = new MongoClient(mongod.getUri());
    await mongoClient.connect();
    db = mongoClient.db('test-challenge');

    await db.collection('profiles').createIndex({ telegramUserId: 1 }, { unique: true });
    await db.collection('runs').createIndex({ runId: 1 }, { unique: true });
    await db.collection('challenges').createIndex({ challengeId: 1 }, { unique: true });
    await db.collection('challenges').createIndex({ expiresAt: 1 });

    redis = await initRedis('memory');

    const app = express();
    app.use(express.json());
    const sessionMiddleware = createRequireSessionMiddleware(sessionSecret);

    app.post('/api/challenges', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
      try {
        const telegramUserId = req.sessionUser?.telegramUserId;
        if (!telegramUserId) {
          res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
          return;
        }

        const challenge = await createChallenge(telegramUserId, db);
        res.status(200).json(challenge);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create challenge';
        res.status(500).json({ error: 'Internal server error', message });
      }
    });

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closeRedis();
    await mongoClient.close();
    await mongod.stop();
  });

  it('rejects unauthenticated requests to POST /api/challenges', async () => {
    const res = await fetch(`${baseUrl}/api/challenges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    assert.equal(res.status, 401);
  });

  it('creates a 1v1 challenge with dedicated flag set, 48h expiration, and challenger run', async () => {
    const challengerId = 91001;
    await db.collection<PlayerProfile>('profiles').insertOne({
      telegramUserId: challengerId,
      username: 'challenger_one',
      firstName: 'Challenger',
      xp: 0,
      level: 1,
      coins: 0,
      gamesPlayed: 0,
      bestScore: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastPlayedDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const token = createSessionToken(challengerId, sessionSecret);
    const res = await fetch(`${baseUrl}/api/challenges`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.challengeId);
    assert.ok(body.runId);
    assert.equal(body.flags.length, 10);
    assert.equal(typeof body.runDurationMs, 'number');

    for (const flag of body.flags) {
      assert.equal(typeof flag.flagIndex, 'number');
      assert.equal(typeof flag.isoCode, 'string');
      assert.equal(flag.choices.length, 4);
      assert.equal((flag as Record<string, unknown>).name, undefined);
      assert.equal((flag as Record<string, unknown>).answered, undefined);
    }

    const challengeDoc = await db.collection<Challenge>('challenges').findOne({ challengeId: body.challengeId });
    assert.ok(challengeDoc);
    assert.equal(challengeDoc.challengerUserId, challengerId);
    assert.equal(challengeDoc.challengerRunId, body.runId);
    assert.equal(challengeDoc.challengerScore, null);
    assert.equal(challengeDoc.opponentUserId, null);
    assert.equal(challengeDoc.opponentRunId, null);
    assert.equal(challengeDoc.opponentScore, null);
    assert.equal(challengeDoc.status, 'pending');
    assert.equal(challengeDoc.flags.length, 10);

    for (const flag of challengeDoc.flags) {
      assert.equal(typeof flag.flagIndex, 'number');
      assert.equal(typeof flag.isoCode, 'string');
      assert.equal(typeof flag.name, 'string');
      assert.equal(typeof flag.tier, 'number');
      assert.equal(flag.choices.length, 4);
    }

    const createdTime = new Date(challengeDoc.createdAt).getTime();
    const expiryTime = new Date(challengeDoc.expiresAt).getTime();
    const diffHours = (expiryTime - createdTime) / (1000 * 60 * 60);
    assert.ok(Math.abs(diffHours - 48) < 0.1);

    const runDoc = await db.collection('runs').findOne({ runId: body.runId });
    assert.ok(runDoc);
    assert.equal(runDoc.mode, 'challenge');
    assert.equal(runDoc.challengeId, body.challengeId);
  });

  it('records challenger score upon run finish without completing challenge or updating global leaderboard', async () => {
    const challengerId = 91002;
    await db.collection<PlayerProfile>('profiles').insertOne({
      telegramUserId: challengerId,
      username: 'challenger_score_test',
      firstName: 'ScoreChallenger',
      xp: 100,
      level: 1,
      coins: 20,
      gamesPlayed: 2,
      bestScore: 50,
      currentStreak: 1,
      longestStreak: 1,
      lastPlayedDate: '2026-09-06',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const challenge = await createChallenge(challengerId, db);
    const runDoc = await db.collection('runs').findOne({ runId: challenge.runId });
    assert.ok(runDoc);

    for (let i = 0; i < 3; i++) {
      const flag = runDoc.flags[i];
      await submitAnswer(challenge.runId, challengerId, i, flag.isoCode, db);
    }

    const finishResult = await finishRun(challenge.runId, challengerId, db, redis);
    assert.ok(finishResult.totalScore > 0);
    assert.equal(finishResult.isNewBest, false);
    assert.equal(finishResult.bestScore, 50);

    const updatedProfile = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: challengerId });
    assert.ok(updatedProfile);
    assert.equal(updatedProfile.bestScore, 50);
    assert.ok(updatedProfile.xp > 100);
    assert.ok(updatedProfile.coins > 20);
    assert.equal(updatedProfile.gamesPlayed, 3);

    const globalRank = await redis.zrevrank('leaderboard:global', challengerId.toString());
    assert.equal(globalRank, null);

    const updatedChallenge = await db.collection<Challenge>('challenges').findOne({ challengeId: challenge.challengeId });
    assert.ok(updatedChallenge);
    assert.equal(updatedChallenge.challengerScore, finishResult.totalScore);
    assert.equal(updatedChallenge.status, 'pending');
    assert.equal(updatedChallenge.opponentScore, null);
  });

  it('detects 48h expiration lazily and updates status to expired', async () => {
    const challengerId = 91003;
    const challenge = await createChallenge(challengerId, db);

    const pastExpiry = new Date(Date.now() - 3600 * 1000);
    await db.collection('challenges').updateOne(
      { challengeId: challenge.challengeId },
      { $set: { expiresAt: pastExpiry } },
    );

    const retrieved = await getChallenge(challenge.challengeId, db);
    assert.ok(retrieved);
    assert.equal(retrieved.status, 'expired');

    const inDb = await db.collection<Challenge>('challenges').findOne({ challengeId: challenge.challengeId });
    assert.ok(inDb);
    assert.equal(inDb.status, 'expired');
  });

  it('does not mutate status of completed challenge when retrieved after expiry', async () => {
    const challengerId = 91004;
    const challenge = await createChallenge(challengerId, db);

    const pastExpiry = new Date(Date.now() - 3600 * 1000);
    await db.collection('challenges').updateOne(
      { challengeId: challenge.challengeId },
      { $set: { status: 'completed', expiresAt: pastExpiry } },
    );

    const retrieved = await getChallenge(challenge.challengeId, db);
    assert.ok(retrieved);
    assert.equal(retrieved.status, 'completed');
  });

  it('preserves practice run behavior updating best score and global leaderboard', async () => {
    const userId = 91005;
    await db.collection<PlayerProfile>('profiles').insertOne({
      telegramUserId: userId,
      username: 'practice_user',
      firstName: 'Practice',
      xp: 0,
      level: 1,
      coins: 0,
      gamesPlayed: 0,
      bestScore: 10,
      currentStreak: 0,
      longestStreak: 0,
      lastPlayedDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const run = await createRun(userId, db, { mode: 'practice' });
    const runDoc = await db.collection('runs').findOne({ runId: run.runId });
    assert.ok(runDoc);

    for (let i = 0; i < 5; i++) {
      const flag = runDoc.flags[i];
      await submitAnswer(run.runId, userId, i, flag.isoCode, db);
    }

    const finish = await finishRun(run.runId, userId, db, redis);
    assert.ok(finish.totalScore > 10);
    assert.equal(finish.isNewBest, true);
    assert.equal(finish.bestScore, finish.totalScore);

    const profile = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: userId });
    assert.ok(profile);
    assert.equal(profile.bestScore, finish.totalScore);

    const globalScore = await redis.zscore('leaderboard:global', userId.toString());
    assert.equal(Number(globalScore), finish.totalScore);
  });
});
