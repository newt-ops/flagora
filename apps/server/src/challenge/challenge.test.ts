import { describe, it, before, after, beforeEach } from 'node:test';
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
import {
  createChallenge,
  getChallenge,
  getChallengeInfo,
  acceptChallenge,
  rematchChallenge,
} from './challengeService.js';
import {
  ChallengeNotFoundError,
  ChallengeExpiredError,
  ChallengeAlreadyCompletedError,
  ChallengeNotCompletedError,
  SelfChallengeNotAllowedError,
  ChallengeAlreadyAcceptedError,
  UnauthorizedChallengeAccessError,
} from './challengeTypes.js';

interface CapturedTelegramMessage {
  chatId: number;
  text: string;
  buttonText?: string;
  buttonUrl?: string;
}

describe('challenge backend and rules', () => {
  let mongod: MongoMemoryServer;
  let mongoClient: MongoClient;
  let db: Db;
  let redis: RedisClient;
  let server: http.Server;
  let baseUrl: string;
  let mockTelegramServer: http.Server;
  let sentTelegramMessages: CapturedTelegramMessage[] = [];
  let shouldFailTelegramApi = false;
  const sessionSecret = 'test-secret-challenge-key-32';

  before(async () => {
    mockTelegramServer = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url?.includes('/sendMessage')) {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          if (shouldFailTelegramApi) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                ok: false,
                error_code: 403,
                description: 'Forbidden: bot was blocked by the user',
              }),
            );
            return;
          }
          const parsed = JSON.parse(body);
          const button = parsed.reply_markup?.inline_keyboard?.[0]?.[0];
          sentTelegramMessages.push({
            chatId: parsed.chat_id,
            text: parsed.text,
            buttonText: button?.text,
            buttonUrl: button?.url,
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, result: { message_id: 101 } }));
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => {
      mockTelegramServer.listen(0, () => {
        const addr = mockTelegramServer.address();
        if (addr && typeof addr === 'object') {
          process.env.TELEGRAM_API_BASE_URL = `http://127.0.0.1:${addr.port}`;
          process.env.TELEGRAM_BOT_TOKEN = 'test_mock_bot_token';
          process.env.TELEGRAM_BOT_USERNAME = 'FlagoraBot';
        }
        resolve();
      });
    });

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

    app.get('/api/challenges/:id', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
      try {
        const telegramUserId = req.sessionUser?.telegramUserId;
        if (!telegramUserId) {
          res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
          return;
        }

        const id = String(req.params.id);
        const info = await getChallengeInfo(id, telegramUserId, db);
        res.status(200).json(info);
      } catch (error) {
        if (error instanceof ChallengeNotFoundError) {
          res.status(404).json({ error: 'Not found', message: error.message });
          return;
        }
        const message = error instanceof Error ? error.message : 'Failed to fetch challenge info';
        res.status(500).json({ error: 'Internal server error', message });
      }
    });

    app.post('/api/challenges/:id/accept', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
      try {
        const telegramUserId = req.sessionUser?.telegramUserId;
        if (!telegramUserId) {
          res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
          return;
        }

        const id = String(req.params.id);
        const run = await acceptChallenge(id, telegramUserId, db);
        res.status(200).json(run);
      } catch (error) {
        if (error instanceof ChallengeNotFoundError) {
          res.status(404).json({ error: 'Not found', message: error.message });
          return;
        }
        if (error instanceof ChallengeExpiredError) {
          res.status(400).json({ error: 'Challenge expired', message: error.message });
          return;
        }
        if (error instanceof ChallengeAlreadyCompletedError) {
          res.status(400).json({ error: 'Challenge completed', message: error.message });
          return;
        }
        if (error instanceof SelfChallengeNotAllowedError) {
          res.status(400).json({ error: 'Self challenge not allowed', message: error.message });
          return;
        }
        if (error instanceof ChallengeAlreadyAcceptedError) {
          res.status(400).json({ error: 'Challenge already accepted', message: error.message });
          return;
        }
        const message = error instanceof Error ? error.message : 'Failed to accept challenge';
        res.status(500).json({ error: 'Internal server error', message });
      }
    });

    app.post('/api/challenges/:id/rematch', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
      try {
        const telegramUserId = req.sessionUser?.telegramUserId;
        if (!telegramUserId) {
          res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
          return;
        }

        const id = String(req.params.id);
        const challenge = await rematchChallenge(id, telegramUserId, db);
        res.status(200).json(challenge);
      } catch (error) {
        if (error instanceof ChallengeNotFoundError) {
          res.status(404).json({ error: 'Not found', message: error.message });
          return;
        }
        if (error instanceof ChallengeNotCompletedError) {
          res.status(400).json({ error: 'Challenge not completed', message: error.message });
          return;
        }
        if (error instanceof UnauthorizedChallengeAccessError) {
          res.status(403).json({ error: 'Forbidden', message: error.message });
          return;
        }
        const message = error instanceof Error ? error.message : 'Failed to create rematch';
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

  beforeEach(() => {
    sentTelegramMessages = [];
    shouldFailTelegramApi = false;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockTelegramServer.close(() => resolve()));
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

  it('returns challenge info before accepting with challenger display name and status', async () => {
    const challengerId = 92001;
    const opponentId = 92002;
    await db.collection<PlayerProfile>('profiles').insertOne({
      telegramUserId: challengerId,
      username: 'flag_master',
      firstName: 'Master',
      lastName: 'Flags',
      xp: 500,
      level: 2,
      coins: 100,
      gamesPlayed: 5,
      bestScore: 320,
      currentStreak: 2,
      longestStreak: 3,
      lastPlayedDate: '2026-09-06',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const challenge = await createChallenge(challengerId, db);
    const runDoc = await db.collection('runs').findOne({ runId: challenge.runId });
    assert.ok(runDoc);
    await submitAnswer(challenge.runId, challengerId, 0, runDoc.flags[0].isoCode, db);
    await finishRun(challenge.runId, challengerId, db, redis);

    const opponentToken = createSessionToken(opponentId, sessionSecret);
    const resOpponent = await fetch(`${baseUrl}/api/challenges/${challenge.challengeId}`, {
      headers: { Authorization: `Bearer ${opponentToken}` },
    });
    assert.equal(resOpponent.status, 200);
    const opponentBody = await resOpponent.json();
    assert.equal(opponentBody.challengeId, challenge.challengeId);
    assert.equal(opponentBody.challengerDisplayName, '@flag_master');
    assert.ok(opponentBody.challengerScore > 0);
    assert.equal(opponentBody.status, 'pending');
    assert.equal(opponentBody.isOpen, true);
    assert.equal(opponentBody.isChallenger, false);
    assert.equal(opponentBody.isOpponent, false);

    const challengerToken = createSessionToken(challengerId, sessionSecret);
    const resChallenger = await fetch(`${baseUrl}/api/challenges/${challenge.challengeId}`, {
      headers: { Authorization: `Bearer ${challengerToken}` },
    });
    assert.equal(resChallenger.status, 200);
    const challengerBody = await resChallenger.json();
    assert.equal(challengerBody.isChallenger, true);
    assert.equal(challengerBody.isOpponent, false);
  });

  it('returns 404 for nonexistent challenge and 200 with expired status for expired challenge', async () => {
    const userId = 92003;
    const token = createSessionToken(userId, sessionSecret);

    const res404 = await fetch(`${baseUrl}/api/challenges/nonexistent-challenge-id`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res404.status, 404);

    const challenge = await createChallenge(92004, db);
    await db.collection('challenges').updateOne(
      { challengeId: challenge.challengeId },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );

    const resExpired = await fetch(`${baseUrl}/api/challenges/${challenge.challengeId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(resExpired.status, 200);
    const expiredBody = await resExpired.json();
    assert.equal(expiredBody.status, 'expired');
    assert.equal(expiredBody.isOpen, false);
  });

  it('rejects accepting own challenge, expired challenge, completed challenge, or duplicate acceptance', async () => {
    const challengerId = 93001;
    const opponent1 = 93002;
    const opponent2 = 93003;

    const challenge = await createChallenge(challengerId, db);

    const challengerToken = createSessionToken(challengerId, sessionSecret);
    const resSelf = await fetch(`${baseUrl}/api/challenges/${challenge.challengeId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${challengerToken}` },
    });
    assert.equal(resSelf.status, 400);
    const selfBody = await resSelf.json();
    assert.equal(selfBody.error, 'Self challenge not allowed');

    const expiredChallenge = await createChallenge(challengerId, db);
    await db.collection('challenges').updateOne(
      { challengeId: expiredChallenge.challengeId },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    const opponentToken = createSessionToken(opponent1, sessionSecret);
    const resExpired = await fetch(`${baseUrl}/api/challenges/${expiredChallenge.challengeId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opponentToken}` },
    });
    assert.equal(resExpired.status, 400);
    const expiredBody = await resExpired.json();
    assert.equal(expiredBody.error, 'Challenge expired');

    const completedChallenge = await createChallenge(challengerId, db);
    await db.collection('challenges').updateOne(
      { challengeId: completedChallenge.challengeId },
      { $set: { status: 'completed' } },
    );
    const resCompleted = await fetch(`${baseUrl}/api/challenges/${completedChallenge.challengeId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opponentToken}` },
    });
    assert.equal(resCompleted.status, 400);
    const completedBody = await resCompleted.json();
    assert.equal(completedBody.error, 'Challenge completed');

    const validChallenge = await createChallenge(challengerId, db);
    const resAccepted = await fetch(`${baseUrl}/api/challenges/${validChallenge.challengeId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opponentToken}` },
    });
    assert.equal(resAccepted.status, 200);

    const opponent2Token = createSessionToken(opponent2, sessionSecret);
    const resDuplicate = await fetch(`${baseUrl}/api/challenges/${validChallenge.challengeId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opponent2Token}` },
    });
    assert.equal(resDuplicate.status, 400);
    const duplicateBody = await resDuplicate.json();
    assert.equal(duplicateBody.error, 'Challenge already accepted');
  });

  it('accepts challenge delivering identical flags and choices, determines winner, and sends personalized notifications', async () => {
    const challengerId = 94001;
    const opponentId = 94002;

    await db.collection<PlayerProfile>('profiles').insertOne({
      telegramUserId: challengerId,
      username: 'alice_flags',
      firstName: 'Alice',
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

    await db.collection<PlayerProfile>('profiles').insertOne({
      telegramUserId: opponentId,
      username: 'bob_flags',
      firstName: 'Bob',
      xp: 0,
      level: 1,
      coins: 0,
      gamesPlayed: 0,
      bestScore: 100,
      currentStreak: 0,
      longestStreak: 0,
      lastPlayedDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const c1 = await createChallenge(challengerId, db);
    const c1ChallengerRun = await db.collection('runs').findOne({ runId: c1.runId });
    assert.ok(c1ChallengerRun);
    for (let i = 0; i < 5; i++) {
      await submitAnswer(c1.runId, challengerId, i, c1ChallengerRun.flags[i].isoCode, db);
    }
    const c1ChallengerFinish = await finishRun(c1.runId, challengerId, db, redis);

    const opponentToken = createSessionToken(opponentId, sessionSecret);
    const acceptRes1 = await fetch(`${baseUrl}/api/challenges/${c1.challengeId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opponentToken}` },
    });
    assert.equal(acceptRes1.status, 200);
    const opponentRunData1 = await acceptRes1.json();

    assert.equal(opponentRunData1.flags.length, c1.flags.length);
    for (let i = 0; i < c1.flags.length; i++) {
      assert.equal(opponentRunData1.flags[i].flagIndex, c1.flags[i].flagIndex);
      assert.equal(opponentRunData1.flags[i].isoCode, c1.flags[i].isoCode);
      assert.deepEqual(opponentRunData1.flags[i].choices, c1.flags[i].choices);
      assert.equal((opponentRunData1.flags[i] as Record<string, unknown>).name, undefined);
    }

    sentTelegramMessages = [];

    const c1OpponentRun = await db.collection('runs').findOne({ runId: opponentRunData1.runId });
    assert.ok(c1OpponentRun);
    for (let i = 0; i < 2; i++) {
      await submitAnswer(opponentRunData1.runId, opponentId, i, c1OpponentRun.flags[i].isoCode, db);
    }
    const c1OpponentFinish = await finishRun(opponentRunData1.runId, opponentId, db, redis);

    assert.ok(c1ChallengerFinish.totalScore > c1OpponentFinish.totalScore);
    const doc1 = await db.collection<Challenge>('challenges').findOne({ challengeId: c1.challengeId });
    assert.ok(doc1);
    assert.equal(doc1.status, 'completed');
    assert.equal(doc1.winner, 'challenger');

    assert.equal(sentTelegramMessages.length, 2);
    const challengerMsg = sentTelegramMessages.find((m) => m.chatId === challengerId);
    const opponentMsg = sentTelegramMessages.find((m) => m.chatId === opponentId);
    assert.ok(challengerMsg);
    assert.ok(opponentMsg);

    assert.ok(challengerMsg.text.includes('You won the challenge against @bob_flags!'));
    assert.ok(challengerMsg.text.includes(String(c1ChallengerFinish.totalScore)));
    assert.ok(challengerMsg.buttonUrl?.includes(c1.challengeId));

    assert.ok(opponentMsg.text.includes('@alice_flags won the challenge!'));
    assert.ok(opponentMsg.text.includes(String(c1OpponentFinish.totalScore)));
    assert.ok(opponentMsg.buttonUrl?.includes(c1.challengeId));

    sentTelegramMessages = [];
    const c2 = await createChallenge(challengerId, db);
    const c2ChallengerRun = await db.collection('runs').findOne({ runId: c2.runId });
    assert.ok(c2ChallengerRun);
    for (let i = 0; i < 2; i++) {
      await submitAnswer(c2.runId, challengerId, i, c2ChallengerRun.flags[i].isoCode, db);
    }
    const c2ChallengerFinish = await finishRun(c2.runId, challengerId, db, redis);

    const acceptRes2 = await fetch(`${baseUrl}/api/challenges/${c2.challengeId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opponentToken}` },
    });
    assert.equal(acceptRes2.status, 200);
    const opponentRunData2 = await acceptRes2.json();
    const c2OpponentRun = await db.collection('runs').findOne({ runId: opponentRunData2.runId });
    assert.ok(c2OpponentRun);
    for (let i = 0; i < 6; i++) {
      await submitAnswer(opponentRunData2.runId, opponentId, i, c2OpponentRun.flags[i].isoCode, db);
    }
    const c2OpponentFinish = await finishRun(opponentRunData2.runId, opponentId, db, redis);

    assert.ok(c2OpponentFinish.totalScore > c2ChallengerFinish.totalScore);
    assert.equal(sentTelegramMessages.length, 2);
    const c2ChallengerMsg = sentTelegramMessages.find((m) => m.chatId === challengerId);
    const c2OpponentMsg = sentTelegramMessages.find((m) => m.chatId === opponentId);
    assert.ok(c2ChallengerMsg);
    assert.ok(c2OpponentMsg);
    assert.ok(c2ChallengerMsg.text.includes('@bob_flags beat your score in the challenge!'));
    assert.ok(c2OpponentMsg.text.includes('You won the challenge against @alice_flags!'));

    sentTelegramMessages = [];
    const c3 = await createChallenge(challengerId, db);
    const c3ChallengerRun = await db.collection('runs').findOne({ runId: c3.runId });
    assert.ok(c3ChallengerRun);
    for (let i = 0; i < 4; i++) {
      await submitAnswer(c3.runId, challengerId, i, c3ChallengerRun.flags[i].isoCode, db);
    }
    await finishRun(c3.runId, challengerId, db, redis);

    const acceptRes3 = await fetch(`${baseUrl}/api/challenges/${c3.challengeId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opponentToken}` },
    });
    assert.equal(acceptRes3.status, 200);
    const opponentRunData3 = await acceptRes3.json();
    const c3OpponentRun = await db.collection('runs').findOne({ runId: opponentRunData3.runId });
    assert.ok(c3OpponentRun);
    for (let i = 0; i < 4; i++) {
      await submitAnswer(opponentRunData3.runId, opponentId, i, c3OpponentRun.flags[i].isoCode, db);
    }

    await db.collection('runs').updateOne(
      { runId: opponentRunData3.runId },
      { $set: { startedAt: new Date(Date.now() - 70000), runningTotal: 400 } },
    );
    await db.collection('challenges').updateOne(
      { challengeId: c3.challengeId },
      { $set: { challengerScore: 400 } },
    );

    const opponentFinishTie = await finishRun(opponentRunData3.runId, opponentId, db, redis);
    assert.equal(opponentFinishTie.totalScore, 400);

    const doc3 = await db.collection<Challenge>('challenges').findOne({ challengeId: c3.challengeId });
    assert.ok(doc3);
    assert.equal(doc3.status, 'completed');
    assert.equal(doc3.winner, 'tie');
    assert.equal(doc3.challengerScore, 400);
    assert.equal(doc3.opponentScore, 400);

    assert.equal(sentTelegramMessages.length, 2);
    const c3ChallengerMsg = sentTelegramMessages.find((m) => m.chatId === challengerId);
    const c3OpponentMsg = sentTelegramMessages.find((m) => m.chatId === opponentId);
    assert.ok(c3ChallengerMsg);
    assert.ok(c3OpponentMsg);
    assert.ok(c3ChallengerMsg.text.includes('ended in a tie! Both scored 400 points.'));
    assert.ok(c3OpponentMsg.text.includes('ended in a tie! Both scored 400 points.'));
  });

  it('does not fail finishRun when telegram message send fails (blocked bot)', async () => {
    const challengerId = 95001;
    const opponentId = 95002;

    const challenge = await createChallenge(challengerId, db);
    const cRun = await db.collection('runs').findOne({ runId: challenge.runId });
    assert.ok(cRun);
    await submitAnswer(challenge.runId, challengerId, 0, cRun.flags[0].isoCode, db);
    await finishRun(challenge.runId, challengerId, db, redis);

    const opponentToken = createSessionToken(opponentId, sessionSecret);
    const acceptRes = await fetch(`${baseUrl}/api/challenges/${challenge.challengeId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opponentToken}` },
    });
    assert.equal(acceptRes.status, 200);
    const opponentRunData = await acceptRes.json();

    shouldFailTelegramApi = true;

    const finishResult = await finishRun(opponentRunData.runId, opponentId, db, redis);
    assert.ok(finishResult.totalScore > 0);

    const updatedChallenge = await db.collection<Challenge>('challenges').findOne({ challengeId: challenge.challengeId });
    assert.ok(updatedChallenge);
    assert.equal(updatedChallenge.status, 'completed');
  });

  it('creates rematch with fresh flag set and sends invite notification, rejecting invalid rematch cases', async () => {
    const playerA = 96001;
    const playerB = 96002;
    const outsider = 96003;

    await db.collection<PlayerProfile>('profiles').insertOne({
      telegramUserId: playerA,
      username: 'player_a',
      firstName: 'Alice',
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

    await db.collection<PlayerProfile>('profiles').insertOne({
      telegramUserId: playerB,
      username: 'player_b',
      firstName: 'Bob',
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

    const challenge = await createChallenge(playerA, db);
    const cRun = await db.collection('runs').findOne({ runId: challenge.runId });
    assert.ok(cRun);
    await submitAnswer(challenge.runId, playerA, 0, cRun.flags[0].isoCode, db);
    await finishRun(challenge.runId, playerA, db, redis);

    const playerBToken = createSessionToken(playerB, sessionSecret);
    const resRematchPending = await fetch(`${baseUrl}/api/challenges/${challenge.challengeId}/rematch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${playerBToken}` },
    });
    assert.equal(resRematchPending.status, 400);
    const pendingBody = await resRematchPending.json();
    assert.equal(pendingBody.error, 'Challenge not completed');

    const acceptRes = await fetch(`${baseUrl}/api/challenges/${challenge.challengeId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${playerBToken}` },
    });
    assert.equal(acceptRes.status, 200);
    const opponentRunData = await acceptRes.json();
    await finishRun(opponentRunData.runId, playerB, db, redis);

    const outsiderToken = createSessionToken(outsider, sessionSecret);
    const resOutsider = await fetch(`${baseUrl}/api/challenges/${challenge.challengeId}/rematch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${outsiderToken}` },
    });
    assert.equal(resOutsider.status, 403);
    const outsiderBody = await resOutsider.json();
    assert.equal(outsiderBody.error, 'Forbidden');

    sentTelegramMessages = [];

    const resRematch = await fetch(`${baseUrl}/api/challenges/${challenge.challengeId}/rematch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${playerBToken}` },
    });
    assert.equal(resRematch.status, 200);
    const rematchBody = await resRematch.json();

    assert.ok(rematchBody.challengeId);
    assert.notEqual(rematchBody.challengeId, challenge.challengeId);
    assert.ok(rematchBody.runId);
    assert.equal(rematchBody.flags.length, 10);

    const newChallengeDoc = await db.collection<Challenge>('challenges').findOne({ challengeId: rematchBody.challengeId });
    assert.ok(newChallengeDoc);
    assert.equal(newChallengeDoc.challengerUserId, playerB);
    assert.equal(newChallengeDoc.opponentUserId, null);
    assert.equal(newChallengeDoc.status, 'pending');

    assert.equal(sentTelegramMessages.length, 1);
    const rematchInvite = sentTelegramMessages[0];
    assert.equal(rematchInvite.chatId, playerA);
    assert.ok(rematchInvite.text.includes('@player_b has challenged you to a rematch!'));
    assert.equal(rematchInvite.buttonText, 'Accept Rematch');
    assert.ok(rematchInvite.buttonUrl?.includes(rematchBody.challengeId));
  });
});
