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
import { createRun, finishRun } from '../game/runService.js';
import type { GameRun } from '../game/runTypes.js';
import {
  getTopLeaderboard,
  getPlayerLeaderboardRank,
  reconcileLeaderboard,
  updateLeaderboardScore,
} from './leaderboardService.js';

describe('leaderboard backend and Redis integration', () => {
  let mongod: MongoMemoryServer;
  let mongoClient: MongoClient;
  let db: Db;
  let redis: RedisClient;
  let server: http.Server;
  let baseUrl: string;
  const sessionSecret = 'test-session-secret-for-leaderboard-tests';

  before(async () => {
    mongod = await MongoMemoryServer.create();
    mongoClient = new MongoClient(mongod.getUri());
    await mongoClient.connect();
    db = mongoClient.db('test-leaderboard');

    redis = await initRedis('memory');

    const app = express();
    app.use(express.json());
    const sessionMiddleware = createRequireSessionMiddleware(sessionSecret);

    app.get('/api/leaderboard/top', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
      try {
        const rawLimit = Number(req.query.limit);
        const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 50;
        const entries = await getTopLeaderboard(limit, db, redis);
        res.status(200).json(entries);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch leaderboard';
        res.status(500).json({ error: 'Internal server error', message });
      }
    });

    app.get('/api/leaderboard/me', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
      try {
        const telegramUserId = req.sessionUser?.telegramUserId;
        if (!telegramUserId) {
          res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
          return;
        }
        const rankInfo = await getPlayerLeaderboardRank(telegramUserId, redis);
        res.status(200).json(rankInfo);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch player rank';
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

  it('updates sorted set on run raising bestScore and leaves it unchanged on lower score', async () => {
    const userId = 5001;
    const profiles = db.collection<PlayerProfile>('profiles');

    const profile: PlayerProfile = {
      telegramUserId: userId,
      firstName: 'BestScoreRunner',
      coins: 0,
      xp: 0,
      level: 1,
      currentStreak: 0,
      longestStreak: 0,
      gamesPlayed: 0,
      bestScore: 200,
      lastPlayedDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await profiles.insertOne(profile);
    await updateLeaderboardScore(userId, 200, redis);

    const run1 = await createRun(userId, db);
    await db.collection<GameRun>('runs').updateOne(
      { runId: run1.runId },
      { $set: { runningTotal: 600, startedAt: new Date(Date.now() - 60_000) } },
    );
    const finish1 = await finishRun(run1.runId, userId, db, redis);
    assert.equal(finish1.bestScore, 600);
    assert.equal(finish1.isNewBest, true);

    const scoreAfterHigh = await redis.zscore('leaderboard:global', String(userId));
    assert.equal(Number(scoreAfterHigh), 600);

    const run2 = await createRun(userId, db);
    await db.collection<GameRun>('runs').updateOne(
      { runId: run2.runId },
      { $set: { runningTotal: 350, startedAt: new Date(Date.now() - 60_000) } },
    );
    const finish2 = await finishRun(run2.runId, userId, db, redis);
    assert.equal(finish2.bestScore, 600);
    assert.equal(finish2.isNewBest, false);

    const scoreAfterLow = await redis.zscore('leaderboard:global', String(userId));
    assert.equal(Number(scoreAfterLow), 600);
  });

  it('returns correctly ordered results and respects limit clamp in top leaderboard', async () => {
    await redis.del('leaderboard:global');
    const profiles = db.collection<PlayerProfile>('profiles');

    const testUsers = [
      { id: 6001, name: 'Alice', user: 'alice_flag', score: 100 },
      { id: 6002, name: 'Bob', user: null, last: 'Builder', score: 400 },
      { id: 6003, name: 'Charlie', user: null, last: null, score: 300 },
      { id: 6004, name: 'Diana', user: 'diana_prince', score: 950 },
      { id: 6005, name: 'Evan', user: 'evan_speed', score: 720 },
    ];

    for (const u of testUsers) {
      await profiles.updateOne(
        { telegramUserId: u.id },
        {
          $set: {
            telegramUserId: u.id,
            firstName: u.name,
            username: u.user,
            lastName: u.last ?? null,
            photoUrl: `https://example.com/avatar/${u.id}.jpg`,
            coins: 0,
            xp: 0,
            level: 1,
            currentStreak: 1,
            longestStreak: 1,
            gamesPlayed: 1,
            bestScore: u.score,
            lastPlayedDate: '2026-09-07',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );
      await redis.zadd('leaderboard:global', u.score, String(u.id));
    }

    const top3 = await getTopLeaderboard(3, db, redis);
    assert.equal(top3.length, 3);
    assert.equal(top3[0].rank, 1);
    assert.equal(top3[0].telegramUserId, 6004);
    assert.equal(top3[0].displayName, '@diana_prince');
    assert.equal(top3[0].bestScore, 950);

    assert.equal(top3[1].rank, 2);
    assert.equal(top3[1].telegramUserId, 6005);
    assert.equal(top3[1].displayName, '@evan_speed');
    assert.equal(top3[1].bestScore, 720);

    assert.equal(top3[2].rank, 3);
    assert.equal(top3[2].telegramUserId, 6002);
    assert.equal(top3[2].displayName, 'Bob B.');
    assert.equal(top3[2].bestScore, 400);

    const clamped = await getTopLeaderboard(200, db, redis);
    assert.equal(clamped.length, 5);
  });

  it('returns player rank and unranked result for players with no runs', async () => {
    const rankedDiana = await getPlayerLeaderboardRank(6004, redis);
    assert.equal(rankedDiana.ranked, true);
    assert.equal(rankedDiana.rank, 1);
    assert.equal(rankedDiana.bestScore, 950);

    const rankedAlice = await getPlayerLeaderboardRank(6001, redis);
    assert.equal(rankedAlice.ranked, true);
    assert.equal(rankedAlice.rank, 5);
    assert.equal(rankedAlice.bestScore, 100);

    const unranked = await getPlayerLeaderboardRank(99999, redis);
    assert.equal(unranked.ranked, false);
    assert.equal(unranked.rank, null);
    assert.equal(unranked.bestScore, 0);
  });

  it('reconciles leaderboard accurately from Mongo alone', async () => {
    await redis.del('leaderboard:global');
    const emptyTop = await getTopLeaderboard(10, db, redis);
    assert.equal(emptyTop.length, 0);

    const result = await reconcileLeaderboard(db, redis);
    assert.ok(result.count >= 5);

    const restoredTop = await getTopLeaderboard(5, db, redis);
    assert.equal(restoredTop.length, 5);
    assert.equal(restoredTop[0].rank, 1);
    assert.equal(restoredTop[0].telegramUserId, 6004);
    assert.equal(restoredTop[0].bestScore, 950);
  });

  it('does not fail finishRun if Redis write throws an error', async () => {
    const userId = 7001;
    const profiles = db.collection<PlayerProfile>('profiles');

    await profiles.insertOne({
      telegramUserId: userId,
      firstName: 'FaultTolerantRunner',
      coins: 0,
      xp: 0,
      level: 1,
      currentStreak: 0,
      longestStreak: 0,
      gamesPlayed: 0,
      bestScore: 100,
      lastPlayedDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const failingRedis = {
      zadd: async () => {
        throw new Error('Simulated Redis network timeout');
      },
    } as unknown as RedisClient;

    const run = await createRun(userId, db);
    await db.collection<GameRun>('runs').updateOne(
      { runId: run.runId },
      { $set: { runningTotal: 850, startedAt: new Date(Date.now() - 60_000) } },
    );

    const finish = await finishRun(run.runId, userId, db, failingRedis);
    assert.equal(finish.totalScore, 850);
    assert.equal(finish.bestScore, 850);
    assert.equal(finish.isNewBest, true);

    const updatedProfile = await profiles.findOne({ telegramUserId: userId });
    assert.equal(updatedProfile?.bestScore, 850);
  });

  it('HTTP endpoints require authentication and return correct payload shape', async () => {
    const unauthTop = await fetch(`${baseUrl}/api/leaderboard/top`);
    assert.equal(unauthTop.status, 401);

    const unauthMe = await fetch(`${baseUrl}/api/leaderboard/me`);
    assert.equal(unauthMe.status, 401);

    const token = createSessionToken(6004, sessionSecret);
    const authTop = await fetch(`${baseUrl}/api/leaderboard/top?limit=2`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(authTop.status, 200);
    const topData = (await authTop.json()) as Array<{ rank: number; bestScore: number }>;
    assert.equal(topData.length, 2);
    assert.equal(topData[0].rank, 1);
    assert.equal(topData[0].bestScore, 950);

    const authMe = await fetch(`${baseUrl}/api/leaderboard/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(authMe.status, 200);
    const meData = (await authMe.json()) as { ranked: boolean; rank: number; bestScore: number };
    assert.equal(meData.ranked, true);
    assert.equal(meData.rank, 1);
    assert.equal(meData.bestScore, 950);
  });
});
