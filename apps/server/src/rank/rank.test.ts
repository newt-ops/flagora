import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import type { Redis as RedisClient } from 'ioredis';
import {
  type PlayerProfile,
  type SeasonResult,
  type BattleSession,
  getRankedTier,
  getUtcSeasonString,
  getRankedLeaderboardKey,
} from '@flagora/shared';
import { initRedis, closeRedis } from '../db/redis.js';
import { createRequireSessionMiddleware, type AuthenticatedSessionRequest } from '../session/requireSession.js';
import { createSessionToken } from '../session/tokens.js';
import {
  calculateRatingDelta,
  processBattleRatingUpdate,
  getRankStatus,
  getRankedLeaderboard,
} from './rankService.js';
import { checkAndFinalizeBattle } from '../battle/battleService.js';
import { createRun, finishRun } from '../game/runService.js';
import { seedFlags } from '../game/seedFlags.js';
import { initFlagCache } from '../game/flagCache.js';

describe('Ranked Tiers and Battle Rating Backend', () => {
  let mongod: MongoMemoryServer;
  let mongoClient: MongoClient;
  let db: Db;
  let redis: RedisClient;
  let server: http.Server;
  let baseUrl: string;
  const sessionSecret = 'test-session-secret-for-rank-tests-12345';

  before(async () => {
    mongod = await MongoMemoryServer.create();
    mongoClient = new MongoClient(mongod.getUri());
    await mongoClient.connect();
    db = mongoClient.db('test-ranked');

    redis = await initRedis('memory');
    await seedFlags(db);
    await initFlagCache(db);

    const app = express();
    app.use(express.json());
    const sessionMiddleware = createRequireSessionMiddleware(sessionSecret);

    app.get('/api/rank/status', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
      try {
        const telegramUserId = req.sessionUser?.telegramUserId;
        if (!telegramUserId) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }
        const status = await getRankStatus(telegramUserId, db, redis);
        res.status(200).json(status);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error';
        res.status(500).json({ error: message });
      }
    });

    app.get('/api/rank/leaderboard', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
      try {
        const telegramUserId = req.sessionUser?.telegramUserId;
        if (!telegramUserId) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }
        const limit = Number(req.query.limit) || 50;
        const result = await getRankedLeaderboard(telegramUserId, db, redis, limit);
        res.status(200).json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error';
        res.status(500).json({ error: message });
      }
    });

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://localhost:${addr.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    server?.close();
    await closeRedis();
    await mongoClient?.close();
    await mongod?.stop();
  });

  beforeEach(async () => {
    await db.collection('profiles').deleteMany({});
    await db.collection('season_results').deleteMany({});
    await db.collection('battles').deleteMany({});
    await db.collection('runs').deleteMany({});
    await redis.flushall();
  });

  function makeProfile(userId: number, overrides: Partial<PlayerProfile> = {}): PlayerProfile {
    const now = new Date();
    return {
      telegramUserId: userId,
      username: `user_${userId}`,
      firstName: `User ${userId}`,
      lastName: null,
      photoUrl: null,
      coins: 100,
      xp: 0,
      level: 1,
      currentStreak: 0,
      longestStreak: 0,
      gamesPlayed: 0,
      bestScore: 0,
      lastPlayedDate: null,
      battleRating: 0,
      currentSeason: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  describe('Tier derivation at threshold boundaries', () => {
    it('correctly maps every tier boundary according to rules', () => {
      assert.equal(getRankedTier(0), 'Bronze');
      assert.equal(getRankedTier(150), 'Bronze');
      assert.equal(getRankedTier(299), 'Bronze');

      assert.equal(getRankedTier(300), 'Silver');
      assert.equal(getRankedTier(450), 'Silver');
      assert.equal(getRankedTier(599), 'Silver');

      assert.equal(getRankedTier(600), 'Gold');
      assert.equal(getRankedTier(800), 'Gold');
      assert.equal(getRankedTier(999), 'Gold');

      assert.equal(getRankedTier(1000), 'Platinum');
      assert.equal(getRankedTier(1250), 'Platinum');
      assert.equal(getRankedTier(1499), 'Platinum');

      assert.equal(getRankedTier(1500), 'Diamond');
      assert.equal(getRankedTier(1750), 'Diamond');
      assert.equal(getRankedTier(1999), 'Diamond');

      assert.equal(getRankedTier(2000), 'Legend');
      assert.equal(getRankedTier(2800), 'Legend');
      assert.equal(getRankedTier(-50), 'Bronze');
    });
  });

  describe('Rating deltas and floor-at-0 rules', () => {
    it('calculates correct asymmetric deltas for win (+20), loss (-15), and tie (+2)', () => {
      assert.equal(calculateRatingDelta('win'), 20);
      assert.equal(calculateRatingDelta('loss'), -15);
      assert.equal(calculateRatingDelta('tie'), 2);
    });

    it('floors rating at 0 on loss when rating is below 15', async () => {
      const profile = makeProfile(101, { battleRating: 10, currentSeason: '2026-09' });
      await db.collection('profiles').insertOne(profile);

      const update = await processBattleRatingUpdate(101, 'loss', db, redis, new Date('2026-09-12T12:00:00Z'));
      assert.equal(update.oldRating, 10);
      assert.equal(update.newRating, 0);
      assert.equal(update.ratingDelta, -10);
      assert.equal(update.tier, 'Bronze');

      const saved = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: 101 });
      assert.equal(saved?.battleRating, 0);
    });

    it('preserves rating at 0 when losing with 0 rating', async () => {
      const profile = makeProfile(102, { battleRating: 0, currentSeason: '2026-09' });
      await db.collection('profiles').insertOne(profile);

      const update = await processBattleRatingUpdate(102, 'loss', db, redis, new Date('2026-09-12T12:00:00Z'));
      assert.equal(update.oldRating, 0);
      assert.equal(update.newRating, 0);
      assert.equal(update.ratingDelta, 0);
      assert.equal(update.tier, 'Bronze');
    });

    it('applies win (+20) and promotes tier when threshold reached', async () => {
      const profile = makeProfile(103, { battleRating: 290, currentSeason: '2026-09' });
      await db.collection('profiles').insertOne(profile);

      const update = await processBattleRatingUpdate(103, 'win', db, redis, new Date('2026-09-12T12:00:00Z'));
      assert.equal(update.oldRating, 290);
      assert.equal(update.newRating, 310);
      assert.equal(update.ratingDelta, 20);
      assert.equal(update.tier, 'Silver');

      const saved = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: 103 });
      assert.equal(saved?.battleRating, 310);
    });

    it('applies tie (+2) correctly', async () => {
      const profile = makeProfile(104, { battleRating: 100, currentSeason: '2026-09' });
      await db.collection('profiles').insertOne(profile);

      const update = await processBattleRatingUpdate(104, 'tie', db, redis, new Date('2026-09-12T12:00:00Z'));
      assert.equal(update.oldRating, 100);
      assert.equal(update.newRating, 102);
      assert.equal(update.ratingDelta, 2);
    });
  });

  describe('Lazy Season Rollover across month boundaries', () => {
    it('archives previous season to SeasonResult and resets rating to 0 before applying new delta', async () => {
      const profile = makeProfile(201, {
        battleRating: 450,
        currentSeason: '2026-08',
      });
      await db.collection('profiles').insertOne(profile);
      await redis.zadd(getRankedLeaderboardKey('2026-08'), 450, '201');

      const competitor = makeProfile(202, { battleRating: 500, currentSeason: '2026-08' });
      await db.collection('profiles').insertOne(competitor);
      await redis.zadd(getRankedLeaderboardKey('2026-08'), 500, '202');

      const septemberDate = new Date('2026-09-02T10:00:00Z');
      const update = await processBattleRatingUpdate(201, 'win', db, redis, septemberDate);

      assert.equal(update.oldRating, 0);
      assert.equal(update.newRating, 20);
      assert.equal(update.ratingDelta, 20);
      assert.equal(update.season, '2026-09');
      assert.equal(update.tier, 'Bronze');

      const archived = await db.collection<SeasonResult>('season_results').findOne({
        telegramUserId: 201,
        season: '2026-08',
      });
      assert.ok(archived);
      assert.equal(archived.finalRating, 450);
      assert.equal(archived.finalTier, 'Silver');
      assert.equal(archived.finalRank, 2);

      const saved = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: 201 });
      assert.equal(saved?.currentSeason, '2026-09');
      assert.equal(saved?.battleRating, 20);

      const scoreInRedis = await redis.zscore(getRankedLeaderboardKey('2026-09'), '201');
      assert.equal(Number(scoreInRedis), 20);
    });

    it('handles ensureCurrentSeason when accessing rank status without battles played', async () => {
      const profile = makeProfile(203, {
        battleRating: 620,
        currentSeason: '2026-07',
      });
      await db.collection('profiles').insertOne(profile);
      await redis.zadd(getRankedLeaderboardKey('2026-07'), 620, '203');

      const octoberDate = new Date('2026-10-05T08:00:00Z');
      const status = await getRankStatus(203, db, redis, octoberDate);

      assert.equal(status.season, '2026-10');
      assert.equal(status.battleRating, 0);
      assert.equal(status.tier, 'Bronze');
      assert.equal(status.rank, null);

      const archived = await db.collection<SeasonResult>('season_results').findOne({
        telegramUserId: 203,
        season: '2026-07',
      });
      assert.ok(archived);
      assert.equal(archived.finalRating, 620);
      assert.equal(archived.finalTier, 'Gold');
    });
  });

  describe('Live Battle Finalization Integration', () => {
    it('applies win and loss deltas to challenger and opponent upon battle completion', async () => {
      const challenger = makeProfile(301, { battleRating: 100, currentSeason: '2026-09' });
      const opponent = makeProfile(302, { battleRating: 50, currentSeason: '2026-09' });
      await db.collection('profiles').insertMany([challenger, opponent]);

      const battleId = 'test-battle-uuid-1';
      const challengerRunId = 'run-c-1';
      const opponentRunId = 'run-o-1';

      const battleSession: BattleSession = {
        battleId,
        challengerUserId: 301,
        opponentUserId: 302,
        status: 'in_progress',
        challengerRunId,
        opponentRunId,
        startedAt: new Date(),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60000),
        updatedAt: new Date(),
      };
      await db.collection('battles').insertOne(battleSession);

      await db.collection('runs').insertMany([
        {
          runId: challengerRunId,
          telegramUserId: 301,
          mode: 'live-battle',
          battleId,
          status: 'finished',
          profileCredited: true,
          flags: [{ countryCode: 'fr', correct: true }],
          runningTotal: 900,
          runDurationMs: 60000,
          startedAt: new Date(),
          finalScore: { totalScore: 900, basePoints: 900, timeBonus: 0, streakBonus: 0, tierBonus: 0, perfectRunBonus: 0, correctCount: 1, totalFlags: 1 },
        },
        {
          runId: opponentRunId,
          telegramUserId: 302,
          mode: 'live-battle',
          battleId,
          status: 'finished',
          profileCredited: true,
          flags: [{ countryCode: 'de', correct: true }],
          runningTotal: 700,
          runDurationMs: 60000,
          startedAt: new Date(),
          finalScore: { totalScore: 700, basePoints: 700, timeBonus: 0, streakBonus: 0, tierBonus: 0, perfectRunBonus: 0, correctCount: 1, totalFlags: 1 },
        },
      ]);

      const finalized = await checkAndFinalizeBattle(battleId, db, redis);
      assert.ok(finalized);
      assert.equal(finalized.status, 'completed');
      assert.equal(finalized.winner, 'challenger');

      const updatedChallenger = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: 301 });
      const updatedOpponent = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: 302 });

      assert.equal(updatedChallenger?.battleRating, 120);
      assert.equal(updatedOpponent?.battleRating, 35);

      const currentSeason = getUtcSeasonString();
      const cScore = await redis.zscore(getRankedLeaderboardKey(currentSeason), '301');
      const oScore = await redis.zscore(getRankedLeaderboardKey(currentSeason), '302');
      assert.equal(Number(cScore), 120);
      assert.equal(Number(oScore), 35);
    });

    it('applies tie (+2) to both participants when scores are identical', async () => {
      const challenger = makeProfile(303, { battleRating: 200, currentSeason: '2026-09' });
      const opponent = makeProfile(304, { battleRating: 200, currentSeason: '2026-09' });
      await db.collection('profiles').insertMany([challenger, opponent]);

      const battleId = 'test-battle-uuid-tie';
      const challengerRunId = 'run-c-tie';
      const opponentRunId = 'run-o-tie';

      await db.collection('battles').insertOne({
        battleId,
        challengerUserId: 303,
        opponentUserId: 304,
        status: 'in_progress',
        challengerRunId,
        opponentRunId,
        startedAt: new Date(),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60000),
        updatedAt: new Date(),
      });

      await db.collection('runs').insertMany([
        {
          runId: challengerRunId,
          telegramUserId: 303,
          mode: 'live-battle',
          battleId,
          status: 'finished',
          profileCredited: true,
          flags: [{ countryCode: 'fr', correct: true }],
          runningTotal: 800,
          runDurationMs: 60000,
          startedAt: new Date(),
          finalScore: { totalScore: 800, basePoints: 800, timeBonus: 0, streakBonus: 0, tierBonus: 0, perfectRunBonus: 0, correctCount: 1, totalFlags: 1 },
        },
        {
          runId: opponentRunId,
          telegramUserId: 304,
          mode: 'live-battle',
          battleId,
          status: 'finished',
          profileCredited: true,
          flags: [{ countryCode: 'de', correct: true }],
          runningTotal: 800,
          runDurationMs: 60000,
          startedAt: new Date(),
          finalScore: { totalScore: 800, basePoints: 800, timeBonus: 0, streakBonus: 0, tierBonus: 0, perfectRunBonus: 0, correctCount: 1, totalFlags: 1 },
        },
      ]);

      const finalized = await checkAndFinalizeBattle(battleId, db, redis);
      assert.ok(finalized);
      assert.equal(finalized.winner, 'tie');

      const updatedChallenger = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: 303 });
      const updatedOpponent = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: 304 });

      assert.equal(updatedChallenger?.battleRating, 202);
      assert.equal(updatedOpponent?.battleRating, 202);
    });
  });

  describe('Isolation from Practice and Daily Runs', () => {
    it('practice and daily completions do not modify battleRating or ranked leaderboard', async () => {
      const profile = makeProfile(401, { battleRating: 150, currentSeason: '2026-09' });
      await db.collection('profiles').insertOne(profile);

      const run = await createRun(401, db, { mode: 'practice' });
      await finishRun(run.runId, 401, db, redis);

      const postPractice = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: 401 });
      assert.equal(postPractice?.battleRating, 150);

      const season = getUtcSeasonString();
      const scoreInRanked = await redis.zscore(getRankedLeaderboardKey(season), '401');
      assert.equal(scoreInRanked, null);
    });
  });

  describe('HTTP API Endpoints (/api/rank/status, /api/rank/leaderboard)', () => {
    it('GET /api/rank/status returns 401 when unauthenticated', async () => {
      const res = await fetch(`${baseUrl}/api/rank/status`);
      assert.equal(res.status, 401);
    });

    it('GET /api/rank/status returns correct rating, tier, and rank for authenticated user', async () => {
      const profile = makeProfile(501, { battleRating: 650, currentSeason: getUtcSeasonString() });
      await db.collection('profiles').insertOne(profile);
      await redis.zadd(getRankedLeaderboardKey(getUtcSeasonString()), 650, '501');

      const token = createSessionToken(501, sessionSecret);
      const res = await fetch(`${baseUrl}/api/rank/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.equal(body.season, getUtcSeasonString());
      assert.equal(body.battleRating, 650);
      assert.equal(body.tier, 'Gold');
      assert.equal(body.rank, 1);
    });

    it('GET /api/rank/leaderboard returns ordered top entries and player me rank', async () => {
      const currentSeason = getUtcSeasonString();
      const p1 = makeProfile(601, { firstName: 'Alice', battleRating: 1200, currentSeason });
      const p2 = makeProfile(602, { firstName: 'Bob', battleRating: 800, currentSeason });
      const p3 = makeProfile(603, { firstName: 'Charlie', battleRating: 300, currentSeason });
      await db.collection('profiles').insertMany([p1, p2, p3]);

      await redis.zadd(getRankedLeaderboardKey(currentSeason), 1200, '601');
      await redis.zadd(getRankedLeaderboardKey(currentSeason), 800, '602');
      await redis.zadd(getRankedLeaderboardKey(currentSeason), 300, '603');

      const token = createSessionToken(602, sessionSecret);
      const res = await fetch(`${baseUrl}/api/rank/leaderboard?limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.equal(body.season, currentSeason);
      assert.equal(body.top.length, 3);
      assert.equal(body.top[0].telegramUserId, 601);
      assert.equal(body.top[0].rank, 1);
      assert.equal(body.top[0].bestScore, 1200);

      assert.equal(body.top[1].telegramUserId, 602);
      assert.equal(body.top[1].rank, 2);
      assert.equal(body.top[1].bestScore, 800);

      assert.ok(body.me.ranked);
      assert.equal(body.me.rank, 2);
      assert.equal(body.me.bestScore, 800);
    });
  });
});
