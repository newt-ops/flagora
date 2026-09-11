import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import type { Redis as RedisClient } from 'ioredis';
import {
  type PlayerProfile,
  type PlayerBadge,
  type BadgesMeResponse,
  BADGE_CATALOG,
  getRankedLeaderboardKey,
} from '@flagora/shared';
import { initRedis, closeRedis } from '../db/redis.js';
import { createRequireSessionMiddleware, type AuthenticatedSessionRequest } from '../session/requireSession.js';
import { createSessionToken } from '../session/tokens.js';
import { seedFlags } from '../game/seedFlags.js';
import { initFlagCache } from '../game/flagCache.js';
import { createRun, submitAnswer, finishRun } from '../game/runService.js';
import { ensureCurrentSeason } from '../rank/rankService.js';
import {
  initBadgeCollection,
  awardBadge,
  evaluateBadges,
  getPlayerBadges,
  awardSeasonTop100Badges,
} from './badgeService.js';

describe('Mastery Badges Backend', () => {
  let mongod: MongoMemoryServer;
  let mongoClient: MongoClient;
  let db: Db;
  let redis: RedisClient;
  let server: http.Server;
  let baseUrl: string;
  const sessionSecret = 'test-session-secret-for-badges-98765';

  before(async () => {
    mongod = await MongoMemoryServer.create();
    mongoClient = new MongoClient(mongod.getUri());
    await mongoClient.connect();
    db = mongoClient.db('test-badges');

    redis = await initRedis('memory');
    await seedFlags(db);
    await initFlagCache(db);
    await initBadgeCollection(db);

    const app = express();
    app.use(express.json());
    const sessionMiddleware = createRequireSessionMiddleware(sessionSecret);

    app.get('/api/badges/me', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
      try {
        const telegramUserId = req.sessionUser?.telegramUserId;
        if (!telegramUserId) {
          res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
          return;
        }

        const badges = await getPlayerBadges(telegramUserId, db);
        res.status(200).json({ badges });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error';
        res.status(500).json({ error: 'Internal server error', message });
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
    await db.collection('player_badges').deleteMany({});
    await db.collection('profiles').deleteMany({});
    await db.collection('runs').deleteMany({});
    await db.collection('season_results').deleteMany({});
    await redis.flushall();
  });

  async function createTestProfile(userId: number, overrides: Partial<PlayerProfile> = {}): Promise<PlayerProfile> {
    const profile: PlayerProfile = {
      telegramUserId: userId,
      firstName: `User_${userId}`,
      lastName: null,
      username: `user${userId}`,
      coins: 500,
      xp: 0,
      level: 1,
      currentStreak: 0,
      longestStreak: 0,
      lastPlayedDate: null,
      gamesPlayed: 0,
      bestScore: 0,
      referralCount: 0,
      referredBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      battleRating: 0,
      currentSeason: '2026-S1',
      tier4CorrectCount: 0,
      ...overrides,
    };
    await db.collection<PlayerProfile>('profiles').insertOne(profile);
    return profile;
  }

  it('verifies badge catalog definitions and non-purchasable prestige rule', () => {
    assert.strictEqual(BADGE_CATALOG.length, 6);
    const ids = BADGE_CATALOG.map((b) => b.id);
    assert.ok(ids.includes('flawless_run'));
    assert.ok(ids.includes('speed_demon'));
    assert.ok(ids.includes('tier_4_specialist'));
    assert.ok(ids.includes('week_warrior'));
    assert.ok(ids.includes('month_warrior'));
    assert.ok(ids.includes('season_top_100'));

    for (const badge of BADGE_CATALOG) {
      assert.strictEqual('cost' in badge, false);
      assert.strictEqual('price' in badge, false);
    }
  });

  it('guarantees idempotent badge awarding without duplicate errors', async () => {
    const userId = 1001;
    const first = await awardBadge(userId, 'flawless_run', null, db);
    assert.ok(first);
    assert.strictEqual(first?.badgeId, 'flawless_run');

    const second = await awardBadge(userId, 'flawless_run', null, db);
    assert.strictEqual(second, null);

    const count = await db.collection('player_badges').countDocuments({
      telegramUserId: userId,
      badgeId: 'flawless_run',
    });
    assert.strictEqual(count, 1);
  });

  it('evaluates flawless_run: awards on 10/10 correct, denies on 9/10', async () => {
    const userIdPass = 2001;
    await createTestProfile(userIdPass);

    const fakeRunPass = {
      runId: 'run-pass',
      telegramUserId: userIdPass,
      flags: [],
      comboCount: 10,
      maxCombo: 10,
      runningTotal: 1000,
      startedAt: new Date(),
      status: 'finished' as const,
      profileCredited: true,
      runDurationMs: 60000,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const awardedPass = await evaluateBadges(
      userIdPass,
      {
        type: 'run_finished',
        run: fakeRunPass,
        finalScore: {
          totalScore: 1000,
          correctCount: 10,
          timeUsedMs: 50000,
          maxCombo: 0,
          leftoverBonus: 10,
          xpEarned: 100,
          coinsEarned: 50,
          newXp: 100,
          newCoins: 550,
          newLevel: 1,
          leveledUp: false,
          currentStreak: 1,
          longestStreak: 1,
          streakChange: 'incremented',
          bestScore: 1000,
          isNewBest: true,
        },
      },
      db,
    );

    assert.ok(awardedPass.some((b) => b.badgeId === 'flawless_run'));

    const userIdFail = 2002;
    await createTestProfile(userIdFail);

    const awardedFail = await evaluateBadges(
      userIdFail,
      {
        type: 'run_finished',
        run: { ...fakeRunPass, runId: 'run-fail', telegramUserId: userIdFail },
        finalScore: {
          totalScore: 900,
          correctCount: 9,
          timeUsedMs: 30000,
          maxCombo: 0,
          leftoverBonus: 30,
          xpEarned: 90,
          coinsEarned: 45,
          newXp: 90,
          newCoins: 545,
          newLevel: 1,
          leveledUp: false,
          currentStreak: 1,
          longestStreak: 1,
          streakChange: 'incremented',
          bestScore: 900,
          isNewBest: true,
        },
      },
      db,
    );

    assert.strictEqual(awardedFail.some((b) => b.badgeId === 'flawless_run'), false);
  });

  it('evaluates speed_demon: awards on 10/10 correct with >=20s leftover, denies otherwise', async () => {
    const userIdPass = 3001;
    await createTestProfile(userIdPass);

    const fakeRun = {
      runId: 'run-speed-pass',
      telegramUserId: userIdPass,
      flags: [],
      comboCount: 10,
      maxCombo: 10,
      runningTotal: 1200,
      startedAt: new Date(),
      status: 'finished' as const,
      profileCredited: true,
      runDurationMs: 60000,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const awardedPass = await evaluateBadges(
      userIdPass,
      {
        type: 'run_finished',
        run: fakeRun,
        finalScore: {
          totalScore: 1200,
          correctCount: 10,
          timeUsedMs: 35000,
          maxCombo: 0,
          leftoverBonus: 25,
          xpEarned: 120,
          coinsEarned: 60,
          newXp: 120,
          newCoins: 560,
          newLevel: 1,
          leveledUp: false,
          currentStreak: 1,
          longestStreak: 1,
          streakChange: 'incremented',
          bestScore: 1200,
          isNewBest: true,
        },
      },
      db,
    );

    assert.ok(awardedPass.some((b) => b.badgeId === 'speed_demon'));
    assert.ok(awardedPass.some((b) => b.badgeId === 'flawless_run'));

    const userIdSlow = 3002;
    await createTestProfile(userIdSlow);

    const awardedSlow = await evaluateBadges(
      userIdSlow,
      {
        type: 'run_finished',
        run: { ...fakeRun, runId: 'run-speed-slow', telegramUserId: userIdSlow },
        finalScore: {
          totalScore: 1050,
          correctCount: 10,
          timeUsedMs: 45000,
          maxCombo: 0,
          leftoverBonus: 15,
          xpEarned: 105,
          coinsEarned: 52,
          newXp: 105,
          newCoins: 552,
          newLevel: 1,
          leveledUp: false,
          currentStreak: 1,
          longestStreak: 1,
          streakChange: 'incremented',
          bestScore: 1050,
          isNewBest: true,
        },
      },
      db,
    );

    assert.ok(awardedSlow.some((b) => b.badgeId === 'flawless_run'));
    assert.strictEqual(awardedSlow.some((b) => b.badgeId === 'speed_demon'), false);

    const userIdImperfect = 3003;
    await createTestProfile(userIdImperfect);

    const awardedImperfect = await evaluateBadges(
      userIdImperfect,
      {
        type: 'run_finished',
        run: { ...fakeRun, runId: 'run-imperfect', telegramUserId: userIdImperfect },
        finalScore: {
          totalScore: 900,
          correctCount: 9,
          timeUsedMs: 25000,
          maxCombo: 0,
          leftoverBonus: 35,
          xpEarned: 90,
          coinsEarned: 45,
          newXp: 90,
          newCoins: 545,
          newLevel: 1,
          leveledUp: false,
          currentStreak: 1,
          longestStreak: 1,
          streakChange: 'incremented',
          bestScore: 900,
          isNewBest: true,
        },
      },
      db,
    );

    assert.strictEqual(awardedImperfect.some((b) => b.badgeId === 'speed_demon'), false);
    assert.strictEqual(awardedImperfect.some((b) => b.badgeId === 'flawless_run'), false);
  });

  it('evaluates tier_4_specialist: increments tier4CorrectCount and awards at exactly >= 50', async () => {
    const userId = 4001;
    await createTestProfile(userId, { tier4CorrectCount: 48 });

    const runWith1Tier4 = {
      runId: 'run-t4-1',
      telegramUserId: userId,
      flags: [
        { flagIndex: 0, isoCode: 'NP', name: 'Nepal', tier: 4 as const, choices: [], answered: true, correct: true },
        { flagIndex: 1, isoCode: 'FR', name: 'France', tier: 1 as const, choices: [], answered: true, correct: true },
      ],
      comboCount: 2,
      maxCombo: 2,
      runningTotal: 200,
      startedAt: new Date(),
      status: 'finished' as const,
      profileCredited: true,
      runDurationMs: 60000,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const awarded49 = await evaluateBadges(
      userId,
      {
        type: 'run_finished',
        run: runWith1Tier4,
        finalScore: {
          totalScore: 200,
          correctCount: 2,
          timeUsedMs: 10000,
          maxCombo: 0,
          leftoverBonus: 50,
          xpEarned: 20,
          coinsEarned: 10,
          newXp: 20,
          newCoins: 510,
          newLevel: 1,
          leveledUp: false,
          currentStreak: 1,
          longestStreak: 1,
          streakChange: 'incremented',
          bestScore: 200,
          isNewBest: true,
        },
      },
      db,
    );

    assert.strictEqual(awarded49.some((b) => b.badgeId === 'tier_4_specialist'), false);

    const profileAt49 = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: userId });
    assert.strictEqual(profileAt49?.tier4CorrectCount, 49);

    const runWith2Tier4 = {
      runId: 'run-t4-2',
      telegramUserId: userId,
      flags: [
        { flagIndex: 0, isoCode: 'BT', name: 'Bhutan', tier: 4 as const, choices: [], answered: true, correct: true },
        { flagIndex: 1, isoCode: 'SZ', name: 'Eswatini', tier: 4 as const, choices: [], answered: true, correct: false },
      ],
      comboCount: 1,
      maxCombo: 1,
      runningTotal: 100,
      startedAt: new Date(),
      status: 'finished' as const,
      profileCredited: true,
      runDurationMs: 60000,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const awarded50 = await evaluateBadges(
      userId,
      {
        type: 'run_finished',
        run: runWith2Tier4,
        finalScore: {
          totalScore: 100,
          correctCount: 1,
          timeUsedMs: 10000,
          maxCombo: 0,
          leftoverBonus: 50,
          xpEarned: 10,
          coinsEarned: 5,
          newXp: 10,
          newCoins: 505,
          newLevel: 1,
          leveledUp: false,
          currentStreak: 1,
          longestStreak: 1,
          streakChange: 'incremented',
          bestScore: 200,
          isNewBest: false,
        },
      },
      db,
    );

    assert.ok(awarded50.some((b) => b.badgeId === 'tier_4_specialist'));

    const profileAt50 = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: userId });
    assert.strictEqual(profileAt50?.tier4CorrectCount, 50);

    const awardedAgain = await evaluateBadges(
      userId,
      {
        type: 'run_finished',
        run: runWith2Tier4,
        finalScore: {
          totalScore: 100,
          correctCount: 1,
          timeUsedMs: 10000,
          maxCombo: 0,
          leftoverBonus: 50,
          xpEarned: 10,
          coinsEarned: 5,
          newXp: 10,
          newCoins: 505,
          newLevel: 1,
          leveledUp: false,
          currentStreak: 1,
          longestStreak: 1,
          streakChange: 'incremented',
          bestScore: 200,
          isNewBest: false,
        },
      },
      db,
    );

    assert.strictEqual(awardedAgain.some((b) => b.badgeId === 'tier_4_specialist'), false);
  });

  it('evaluates week_warrior and month_warrior streaks accurately', async () => {
    const userId = 5001;
    await createTestProfile(userId);

    const awarded6 = await evaluateBadges(userId, { type: 'streak_updated', currentStreak: 6 }, db);
    assert.strictEqual(awarded6.length, 0);

    const awarded7 = await evaluateBadges(userId, { type: 'streak_updated', currentStreak: 7 }, db);
    assert.strictEqual(awarded7.length, 1);
    assert.strictEqual(awarded7[0].badgeId, 'week_warrior');

    const awarded29 = await evaluateBadges(userId, { type: 'streak_updated', currentStreak: 29 }, db);
    assert.strictEqual(awarded29.length, 0);

    const awarded30 = await evaluateBadges(userId, { type: 'streak_updated', currentStreak: 30 }, db);
    assert.strictEqual(awarded30.length, 1);
    assert.strictEqual(awarded30[0].badgeId, 'month_warrior');
  });

  it('evaluates season_top_100: awards rank <= 100 with season tag, allows earning each season', async () => {
    const userPass = 6001;
    const userFail = 6002;
    await createTestProfile(userPass);
    await createTestProfile(userFail);

    const awarded100 = await evaluateBadges(
      userPass,
      { type: 'season_archived', season: '2026-S1', finalRank: 100 },
      db,
    );
    assert.strictEqual(awarded100.length, 1);
    assert.strictEqual(awarded100[0].badgeId, 'season_top_100');
    assert.strictEqual(awarded100[0].season, '2026-S1');

    const awarded101 = await evaluateBadges(
      userFail,
      { type: 'season_archived', season: '2026-S1', finalRank: 101 },
      db,
    );
    assert.strictEqual(awarded101.length, 0);

    const awardedS2 = await evaluateBadges(
      userPass,
      { type: 'season_archived', season: '2026-S2', finalRank: 5 },
      db,
    );
    assert.strictEqual(awardedS2.length, 1);
    assert.strictEqual(awardedS2[0].badgeId, 'season_top_100');
    assert.strictEqual(awardedS2[0].season, '2026-S2');

    const badges = await db
      .collection<PlayerBadge>('player_badges')
      .find({ telegramUserId: userPass, badgeId: 'season_top_100' })
      .toArray();
    assert.strictEqual(badges.length, 2);
  });

  it('integrates season archival in ensureCurrentSeason to award season_top_100 badge', async () => {
    const user = 7001;
    const profile = await createTestProfile(user, {
      battleRating: 1400,
      currentSeason: '2026-02',
    });

    await redis.zadd(getRankedLeaderboardKey('2026-02'), 1400, String(user));

    const futureDate = new Date(Date.UTC(2026, 2, 1, 0, 0, 0));
    await ensureCurrentSeason(profile, db, redis, futureDate);

    const userBadges = await getPlayerBadges(user, db);
    const topBadge = userBadges.find((b) => b.badgeId === 'season_top_100');
    assert.ok(topBadge);
    assert.strictEqual(topBadge?.season, '2026-02');
  });

  it('awards batch season_top_100 badges via awardSeasonTop100Badges', async () => {
    const season = '2026-S_TEST';
    for (let i = 1; i <= 105; i++) {
      await redis.zadd(getRankedLeaderboardKey(season), 1000 - i, String(8000 + i));
    }

    const count = await awardSeasonTop100Badges(season, db, redis);
    assert.strictEqual(count, 100);

    const rank100Badges = await getPlayerBadges(8100, db);
    assert.ok(rank100Badges.some((b) => b.badgeId === 'season_top_100'));

    const rank101Badges = await getPlayerBadges(8101, db);
    assert.strictEqual(rank101Badges.some((b) => b.badgeId === 'season_top_100'), false);
  });

  it('integrates full finishRun flow: awards badges and increments tier4CorrectCount', async () => {
    const userId = 9001;
    await createTestProfile(userId, { tier4CorrectCount: 49 });

    const run = await createRun(userId, db);
    const flags = run.flags;

    await db.collection('flags').updateOne({ isoCode: flags[0].isoCode }, { $set: { tier: 4 } });
    await db.collection('runs').updateOne(
      { runId: run.runId, 'flags.flagIndex': 0 },
      { $set: { 'flags.$.tier': 4 } },
    );

    for (let i = 0; i < flags.length; i++) {
      await submitAnswer(run.runId, userId, i, flags[i].isoCode, db);
    }

    const finishResult = await finishRun(run.runId, userId, db, redis);
    assert.strictEqual(finishResult.correctCount, 10);

    const profile = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: userId });
    assert.ok(profile!.tier4CorrectCount! >= 50);

    const badges = await getPlayerBadges(userId, db);
    const badgeIds = badges.map((b) => b.badgeId);
    assert.ok(badgeIds.includes('flawless_run'));
    assert.ok(badgeIds.includes('tier_4_specialist'));
  });

  it('serves GET /api/badges/me with enriched metadata and auth validation', async () => {
    const userId = 9500;
    await createTestProfile(userId);
    const token = createSessionToken(userId, sessionSecret);

    const unauthRes = await fetch(`${baseUrl}/api/badges/me`);
    assert.strictEqual(unauthRes.status, 401);

    const emptyRes = await fetch(`${baseUrl}/api/badges/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(emptyRes.status, 200);
    const emptyData = (await emptyRes.json()) as BadgesMeResponse;
    assert.deepStrictEqual(emptyData.badges, []);

    await awardBadge(userId, 'flawless_run', null, db);
    await awardBadge(userId, 'season_top_100', '2026-03', db);

    const populatedRes = await fetch(`${baseUrl}/api/badges/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(populatedRes.status, 200);
    const populatedData = (await populatedRes.json()) as BadgesMeResponse;
    assert.strictEqual(populatedData.badges.length, 2);

    const flawless = populatedData.badges.find((b) => b.badgeId === 'flawless_run');
    assert.ok(flawless);
    assert.strictEqual(flawless?.name, 'Flawless Run');
    assert.strictEqual(flawless?.season, null);
    assert.ok(flawless?.earnedAt);

    const top100 = populatedData.badges.find((b) => b.badgeId === 'season_top_100');
    assert.ok(top100);
    assert.strictEqual(top100?.name, 'Season Top 100');
    assert.strictEqual(top100?.season, '2026-03');
  });
});
