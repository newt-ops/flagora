import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  PlayerProfile,
  BattleSession,
  CreateBattleResponse,
  BattleInfoResponse,
  JoinBattleResponse,
} from '@flagora/shared';
import { createRequireSessionMiddleware } from '../session/requireSession.js';
import { ensureIndexes } from '../db/mongo.js';
import { createSessionToken } from '../session/tokens.js';
import { initSocketServer } from '../multiplayer/socketServer.js';
import type {
  TypedSocketServer,
  JoinBattleRoomResponse,
  OpponentJoinedPayload,
  BattleErrorPayload,
  BattleStartPayload,
  BattleCountdownPayload,
  PlayerReadyResponse,
  SubmitAnswerResponse,
  AnswerResultPayload,
  OpponentProgressPayload,
  BattleFinishedPayload,
} from '../multiplayer/socketTypes.js';
import type { GameRun } from '../game/runTypes.js';
import { scoreAnswer, finalizeRun } from '../game/runScoringService.js';
import { createRun, submitAnswer as submitRestAnswer, finishRun } from '../game/runService.js';
import {
  TimeExpiredError,
  FlagAlreadyAnsweredError,
  InvalidFlagIndexError,
} from '../game/runTypes.js';
import {
  createBattle,
  getBattleInfo,
  joinBattle,
} from './battleService.js';
import {
  BattleNotFoundError,
  BattleExpiredError,
  SelfBattleNotAllowedError,
  BattleAlreadyJoinedError,
} from './battleTypes.js';

const TEST_SECRET = 'battle_test_session_secret_32_chars_ok';

describe('battle invite, view, join and room presence', () => {
  let mongod: MongoMemoryServer;
  let mongoClient: MongoClient;
  let db: Db;
  let httpServer: http.Server;
  let io: TypedSocketServer;
  let baseUrl: string;
  const activeSockets: ClientSocket[] = [];

  function createClient(sessionToken: string): ClientSocket {
    const client = ioClient(baseUrl, {
      autoConnect: true,
      transports: ['websocket'],
      reconnection: false,
      auth: { token: sessionToken },
    });
    activeSockets.push(client);
    return client;
  }

  before(async () => {
    mongod = await MongoMemoryServer.create();
    mongoClient = new MongoClient(mongod.getUri());
    await mongoClient.connect();
    db = mongoClient.db();

    await ensureIndexes(db);

    const app = express();
    app.use(express.json());

    const sessionMiddleware = createRequireSessionMiddleware(TEST_SECRET);

    httpServer = http.createServer(app);
    io = initSocketServer(httpServer, TEST_SECRET, db, { countdownDelayMs: 50 });

    app.post('/api/battles', sessionMiddleware, async (req, res) => {
      try {
        const userId = (req as unknown as { sessionUser?: { telegramUserId: number } }).sessionUser?.telegramUserId;
        if (!userId) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }
        const battle = await createBattle(userId, db);
        res.status(200).json(battle);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error';
        res.status(500).json({ error: message });
      }
    });

    app.get('/api/battles/:id', sessionMiddleware, async (req, res) => {
      try {
        const userId = (req as unknown as { sessionUser?: { telegramUserId: number } }).sessionUser?.telegramUserId;
        if (!userId) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }
        const id = String(req.params.id);
        const info = await getBattleInfo(id, userId, db);
        res.status(200).json(info);
      } catch (error) {
        if (error instanceof BattleNotFoundError) {
          res.status(404).json({ error: 'Not found', message: error.message });
          return;
        }
        const message = error instanceof Error ? error.message : 'Error';
        res.status(500).json({ error: message });
      }
    });

    app.post('/api/battles/:id/join', sessionMiddleware, async (req, res) => {
      try {
        const userId = (req as unknown as { sessionUser?: { telegramUserId: number } }).sessionUser?.telegramUserId;
        if (!userId) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }
        const id = String(req.params.id);
        const result = await joinBattle(id, userId, db, io);
        res.status(200).json(result);
      } catch (error) {
        if (error instanceof BattleNotFoundError) {
          res.status(404).json({ error: 'Not found', message: error.message });
          return;
        }
        if (error instanceof BattleExpiredError) {
          res.status(400).json({ error: 'Battle expired', message: error.message });
          return;
        }
        if (error instanceof SelfBattleNotAllowedError) {
          res.status(400).json({ error: 'Self battle not allowed', message: error.message });
          return;
        }
        if (error instanceof BattleAlreadyJoinedError) {
          res.status(400).json({ error: 'Battle already joined', message: error.message });
          return;
        }
        const message = error instanceof Error ? error.message : 'Error';
        res.status(500).json({ error: message });
      }
    });

    app.post('/api/runs/:id/finish', sessionMiddleware, async (req, res) => {
      try {
        const userId = (req as unknown as { sessionUser?: { telegramUserId: number } }).sessionUser?.telegramUserId;
        if (!userId) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }
        const id = String(req.params.id);
        const result = await finishRun(id, userId, db, undefined, io);
        res.status(200).json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error';
        res.status(500).json({ error: message });
      }
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });

    const addr = httpServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    for (const socket of activeSockets) {
      if (socket.connected) {
        socket.disconnect();
      }
    }
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await mongoClient.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    await db.collection('battles').deleteMany({});
    await db.collection('profiles').deleteMany({});
  });

  it('rejects unauthenticated requests to POST /api/battles', async () => {
    const res = await fetch(`${baseUrl}/api/battles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    assert.equal(res.status, 401);
  });

  it('creates a valid empty battle invite with 24-hour expiration', async () => {
    const challengerId = 88101;
    const token = createSessionToken(challengerId, TEST_SECRET);

    const res = await fetch(`${baseUrl}/api/battles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as CreateBattleResponse;
    assert.ok(body.battleId);
    assert.equal(body.status, 'waiting');

    const expiresAt = new Date(body.expiresAt).getTime();
    const now = Date.now();
    const diffHours = (expiresAt - now) / (1000 * 60 * 60);
    assert.ok(diffHours > 23.9 && diffHours <= 24.1);

    const saved = await db.collection<BattleSession>('battles').findOne({ battleId: body.battleId });
    assert.ok(saved);
    assert.equal(saved.challengerUserId, challengerId);
    assert.equal(saved.opponentUserId, null);
    assert.equal(saved.status, 'waiting');
  });

  it('returns battle info with perspective flags and joinable status', async () => {
    const challengerId = 88201;
    const visitorId = 88203;

    await db.collection<PlayerProfile>('profiles').insertOne({
      telegramUserId: challengerId,
      username: 'alice_flags',
      firstName: 'Alice',
      photoUrl: 'https://example.com/alice.jpg',
      coins: 100,
      xp: 200,
      level: 2,
      currentStreak: 1,
      longestStreak: 2,
      gamesPlayed: 5,
      bestScore: 1200,
      lastPlayedDate: '2026-09-07',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const challengerToken = createSessionToken(challengerId, TEST_SECRET);
    const visitorToken = createSessionToken(visitorId, TEST_SECRET);

    const createRes = await fetch(`${baseUrl}/api/battles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${challengerToken}`,
      },
    });
    const created = (await createRes.json()) as CreateBattleResponse;

    const challengerInfoRes = await fetch(`${baseUrl}/api/battles/${created.battleId}`, {
      headers: { Authorization: `Bearer ${challengerToken}` },
    });
    assert.equal(challengerInfoRes.status, 200);
    const challengerInfo = (await challengerInfoRes.json()) as BattleInfoResponse;
    assert.equal(challengerInfo.isChallenger, true);
    assert.equal(challengerInfo.isOwnInvite, true);
    assert.equal(challengerInfo.isOpponent, false);
    assert.equal(challengerInfo.isJoinable, true);
    assert.equal(challengerInfo.challengerDisplayName, '@alice_flags');
    assert.equal(challengerInfo.challengerPhotoUrl, 'https://example.com/alice.jpg');

    const visitorInfoRes = await fetch(`${baseUrl}/api/battles/${created.battleId}`, {
      headers: { Authorization: `Bearer ${visitorToken}` },
    });
    assert.equal(visitorInfoRes.status, 200);
    const visitorInfo = (await visitorInfoRes.json()) as BattleInfoResponse;
    assert.equal(visitorInfo.isChallenger, false);
    assert.equal(visitorInfo.isOwnInvite, false);
    assert.equal(visitorInfo.isOpponent, false);
    assert.equal(visitorInfo.isJoinable, true);

    const notFoundRes = await fetch(`${baseUrl}/api/battles/nonexistent-id`, {
      headers: { Authorization: `Bearer ${visitorToken}` },
    });
    assert.equal(notFoundRes.status, 404);

    await db.collection('battles').updateOne(
      { battleId: created.battleId },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );

    const expiredInfoRes = await fetch(`${baseUrl}/api/battles/${created.battleId}`, {
      headers: { Authorization: `Bearer ${visitorToken}` },
    });
    assert.equal(expiredInfoRes.status, 200);
    const expiredInfo = (await expiredInfoRes.json()) as BattleInfoResponse;
    assert.equal(expiredInfo.status, 'expired');
    assert.equal(expiredInfo.isJoinable, false);
  });

  it('correctly handles REST join: rejects self-join, expired, already joined, and allows valid opponent', async () => {
    const challengerId = 88301;
    const opponentId = 88302;
    const thirdUserId = 88303;

    const challengerToken = createSessionToken(challengerId, TEST_SECRET);
    const opponentToken = createSessionToken(opponentId, TEST_SECRET);
    const thirdToken = createSessionToken(thirdUserId, TEST_SECRET);

    const createRes = await fetch(`${baseUrl}/api/battles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${challengerToken}`,
      },
    });
    const created = (await createRes.json()) as CreateBattleResponse;

    const selfJoinRes = await fetch(`${baseUrl}/api/battles/${created.battleId}/join`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${challengerToken}` },
    });
    assert.equal(selfJoinRes.status, 400);

    const expiredCreateRes = await fetch(`${baseUrl}/api/battles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${challengerToken}`,
      },
    });
    const expiredBattle = (await expiredCreateRes.json()) as CreateBattleResponse;
    await db.collection('battles').updateOne(
      { battleId: expiredBattle.battleId },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );

    const expiredJoinRes = await fetch(`${baseUrl}/api/battles/${expiredBattle.battleId}/join`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opponentToken}` },
    });
    assert.equal(expiredJoinRes.status, 400);

    const validJoinRes = await fetch(`${baseUrl}/api/battles/${created.battleId}/join`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opponentToken}` },
    });
    assert.equal(validJoinRes.status, 200);
    const joinBody = (await validJoinRes.json()) as JoinBattleResponse;
    assert.equal(joinBody.battleId, created.battleId);
    assert.equal(joinBody.status, 'ready');
    assert.equal(joinBody.opponentUserId, opponentId);

    const updatedDoc = await db.collection<BattleSession>('battles').findOne({ battleId: created.battleId });
    assert.ok(updatedDoc);
    assert.equal(updatedDoc.status, 'ready');
    assert.equal(updatedDoc.opponentUserId, opponentId);

    const secondJoinRes = await fetch(`${baseUrl}/api/battles/${created.battleId}/join`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${thirdToken}` },
    });
    assert.equal(secondJoinRes.status, 400);
  });

  it('rejects a non-participant attempting to join the battle room via socket', async () => {
    const challengerId = 88401;
    const intruderId = 88403;

    const challengerToken = createSessionToken(challengerId, TEST_SECRET);
    const intruderToken = createSessionToken(intruderId, TEST_SECRET);

    const createRes = await fetch(`${baseUrl}/api/battles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${challengerToken}`,
      },
    });
    const created = (await createRes.json()) as CreateBattleResponse;

    const intruderClient = createClient(intruderToken);
    await new Promise<void>((resolve) => {
      intruderClient.on('connect', () => resolve());
    });

    let battleErrorReceived: BattleErrorPayload | undefined;
    intruderClient.on('battleError', (err) => {
      battleErrorReceived = err;
    });

    const response = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      intruderClient.emit('joinBattleRoom', { battleId: created.battleId }, (res: JoinBattleRoomResponse) => {
        resolve(res);
      });
    });

    assert.equal(response.success, false);
    assert.ok(response.error?.includes('Forbidden'));
    assert.ok(battleErrorReceived?.message.includes('Forbidden'));

    const socketsInRoom = await io.in(`battle:${created.battleId}`).fetchSockets();
    assert.equal(socketsInRoom.length, 0);
  });

  it('handles room presence: emits opponentJoined on REST join and broadcasts bothPlayersPresent only when both sockets are connected', async () => {
    const challengerId = 88501;
    const opponentId = 88502;

    await db.collection<PlayerProfile>('profiles').insertMany([
      {
        telegramUserId: challengerId,
        username: 'challenger_pro',
        firstName: 'Challenger',
        coins: 10,
        xp: 10,
        level: 1,
        currentStreak: 1,
        longestStreak: 1,
        gamesPlayed: 1,
        bestScore: 500,
        lastPlayedDate: '2026-09-07',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        telegramUserId: opponentId,
        username: 'opponent_ace',
        firstName: 'Opponent',
        coins: 20,
        xp: 20,
        level: 1,
        currentStreak: 2,
        longestStreak: 2,
        gamesPlayed: 2,
        bestScore: 800,
        lastPlayedDate: '2026-09-07',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const challengerToken = createSessionToken(challengerId, TEST_SECRET);
    const opponentToken = createSessionToken(opponentId, TEST_SECRET);

    const createRes = await fetch(`${baseUrl}/api/battles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${challengerToken}`,
      },
    });
    const created = (await createRes.json()) as CreateBattleResponse;

    const challengerSocket = createClient(challengerToken);
    await new Promise<void>((resolve) => {
      challengerSocket.on('connect', () => resolve());
    });

    const challengerJoinRes = await new Promise<{ success: boolean }>((resolve) => {
      challengerSocket.emit('joinBattleRoom', { battleId: created.battleId }, (res: JoinBattleRoomResponse) => {
        resolve(res);
      });
    });
    assert.equal(challengerJoinRes.success, true);

    let opponentJoinedReceived: OpponentJoinedPayload | undefined;
    challengerSocket.on('opponentJoined', (payload) => {
      opponentJoinedReceived = payload;
    });

    let bothPlayersPresentReceivedByChallenger = false;
    challengerSocket.on('bothPlayersPresent', () => {
      bothPlayersPresentReceivedByChallenger = true;
    });

    const restJoinRes = await fetch(`${baseUrl}/api/battles/${created.battleId}/join`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opponentToken}` },
    });
    assert.equal(restJoinRes.status, 200);

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(opponentJoinedReceived);
    assert.equal(opponentJoinedReceived?.opponentUserId, opponentId);
    assert.equal(opponentJoinedReceived?.opponentDisplayName, '@opponent_ace');

    assert.equal(
      bothPlayersPresentReceivedByChallenger,
      false,
      'bothPlayersPresent should not fire before opponent socket connects to room',
    );

    const opponentSocket = createClient(opponentToken);
    await new Promise<void>((resolve) => {
      opponentSocket.on('connect', () => resolve());
    });

    let bothPlayersPresentReceivedByOpponent = false;
    opponentSocket.on('bothPlayersPresent', () => {
      bothPlayersPresentReceivedByOpponent = true;
    });

    const opponentRoomJoinRes = await new Promise<{ success: boolean }>((resolve) => {
      opponentSocket.emit('joinBattleRoom', { battleId: created.battleId }, (res: JoinBattleRoomResponse) => {
        resolve(res);
      });
    });
    assert.equal(opponentRoomJoinRes.success, true);

    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(bothPlayersPresentReceivedByChallenger, true);
    assert.equal(bothPlayersPresentReceivedByOpponent, true);
  });

  it('synchronized start: waits for both playerReady events before emitting battleCountdown and battleStart with identical flags and authoritative timestamp', async () => {
    const challengerId = 88601;
    const opponentId = 88602;

    const challengerToken = createSessionToken(challengerId, TEST_SECRET);
    const opponentToken = createSessionToken(opponentId, TEST_SECRET);

    const createRes = await fetch(`${baseUrl}/api/battles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${challengerToken}`,
      },
    });
    const created = (await createRes.json()) as CreateBattleResponse;

    const joinRes = await fetch(`${baseUrl}/api/battles/${created.battleId}/join`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opponentToken}` },
    });
    assert.equal(joinRes.status, 200);

    const challengerSocket = createClient(challengerToken);
    const opponentSocket = createClient(opponentToken);

    await Promise.all([
      new Promise<void>((resolve) => challengerSocket.on('connect', () => resolve())),
      new Promise<void>((resolve) => opponentSocket.on('connect', () => resolve())),
    ]);

    await Promise.all([
      new Promise<void>((resolve) => {
        challengerSocket.emit('joinBattleRoom', { battleId: created.battleId }, () => resolve());
      }),
      new Promise<void>((resolve) => {
        opponentSocket.emit('joinBattleRoom', { battleId: created.battleId }, () => resolve());
      }),
    ]);

    let challengerCountdown: BattleCountdownPayload | undefined;
    let opponentCountdown: BattleCountdownPayload | undefined;
    challengerSocket.on('battleCountdown', (p) => {
      challengerCountdown = p;
    });
    opponentSocket.on('battleCountdown', (p) => {
      opponentCountdown = p;
    });

    let challengerStart: BattleStartPayload | undefined;
    let opponentStart: BattleStartPayload | undefined;
    challengerSocket.on('battleStart', (p) => {
      challengerStart = p;
    });
    opponentSocket.on('battleStart', (p) => {
      opponentStart = p;
    });

    const challengerReadyRes = await new Promise<PlayerReadyResponse>((resolve) => {
      challengerSocket.emit('playerReady', { battleId: created.battleId }, (res: PlayerReadyResponse) => {
        resolve(res);
      });
    });
    assert.equal(challengerReadyRes.success, true);
    assert.equal(challengerReadyRes.readyCount, 1);

    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(challengerCountdown, undefined);
    assert.equal(challengerStart, undefined);

    const opponentReadyRes = await new Promise<PlayerReadyResponse>((resolve) => {
      opponentSocket.emit('playerReady', { battleId: created.battleId }, (res: PlayerReadyResponse) => {
        resolve(res);
      });
    });
    assert.equal(opponentReadyRes.success, true);
    assert.equal(opponentReadyRes.readyCount, 2);

    const deadline = Date.now() + 3000;
    while ((!challengerStart || !opponentStart) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    const cCountdown = challengerCountdown as unknown as BattleCountdownPayload | undefined;
    const oCountdown = opponentCountdown as unknown as BattleCountdownPayload | undefined;
    const cStart = challengerStart as unknown as BattleStartPayload | undefined;
    const oStart = opponentStart as unknown as BattleStartPayload | undefined;

    assert.ok(cCountdown);
    assert.ok(oCountdown);
    assert.equal(cCountdown?.countdownSeconds, 3);
    assert.equal(oCountdown?.countdownSeconds, 3);

    assert.ok(cStart);
    assert.ok(oStart);
    assert.equal(cStart?.battleId, created.battleId);
    assert.equal(oStart?.battleId, created.battleId);

    assert.equal(cStart?.startedAt, oStart?.startedAt);
    assert.equal(cStart?.challengerRunId, oStart?.challengerRunId);
    assert.equal(cStart?.opponentRunId, oStart?.opponentRunId);

    assert.equal(cStart?.flags.length, 10);
    assert.equal(oStart?.flags.length, 10);
    for (let i = 0; i < 10; i++) {
      assert.equal(cStart?.flags[i].flagIndex, i);
      assert.equal(cStart?.flags[i].isoCode, oStart?.flags[i].isoCode);
      assert.deepEqual(cStart?.flags[i].choices, oStart?.flags[i].choices);
    }

    const updatedBattle = await db.collection<BattleSession>('battles').findOne({ battleId: created.battleId });
    assert.ok(updatedBattle);
    assert.equal(updatedBattle?.status, 'in_progress');
    assert.ok(updatedBattle?.challengerRunId);
    assert.ok(updatedBattle?.opponentRunId);
    assert.notEqual(updatedBattle?.challengerRunId, updatedBattle?.opponentRunId);

    const challengerRunDoc = await db.collection<GameRun>('runs').findOne({ runId: updatedBattle?.challengerRunId });
    const opponentRunDoc = await db.collection<GameRun>('runs').findOne({ runId: updatedBattle?.opponentRunId });

    assert.ok(challengerRunDoc);
    assert.ok(opponentRunDoc);
    assert.equal(challengerRunDoc?.mode, 'live-battle');
    assert.equal(opponentRunDoc?.mode, 'live-battle');
    assert.equal(challengerRunDoc?.battleId, created.battleId);
    assert.equal(opponentRunDoc?.battleId, created.battleId);
    assert.equal(challengerRunDoc?.telegramUserId, challengerId);
    assert.equal(opponentRunDoc?.telegramUserId, opponentId);

    assert.equal(challengerRunDoc?.startedAt.getTime(), opponentRunDoc?.startedAt.getTime());
    assert.equal(new Date(cStart?.startedAt || 0).getTime(), challengerRunDoc?.startedAt.getTime());

    assert.equal(challengerRunDoc?.flags.length, 10);
    assert.equal(opponentRunDoc?.flags.length, 10);
    for (let i = 0; i < 10; i++) {
      assert.equal(challengerRunDoc?.flags[i].isoCode, opponentRunDoc?.flags[i].isoCode);
      assert.equal(challengerRunDoc?.flags[i].tier, opponentRunDoc?.flags[i].tier);
      assert.deepEqual(challengerRunDoc?.flags[i].choices, opponentRunDoc?.flags[i].choices);
    }
  });

  it('order independence: opponent emitting playerReady first also starts countdown and battle once challenger readies up', async () => {
    const challengerId = 88701;
    const opponentId = 88702;

    const challengerToken = createSessionToken(challengerId, TEST_SECRET);
    const opponentToken = createSessionToken(opponentId, TEST_SECRET);

    const createRes = await fetch(`${baseUrl}/api/battles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${challengerToken}`,
      },
    });
    const created = (await createRes.json()) as CreateBattleResponse;

    await fetch(`${baseUrl}/api/battles/${created.battleId}/join`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opponentToken}` },
    });

    const challengerSocket = createClient(challengerToken);
    const opponentSocket = createClient(opponentToken);

    await Promise.all([
      new Promise<void>((resolve) => challengerSocket.on('connect', () => resolve())),
      new Promise<void>((resolve) => opponentSocket.on('connect', () => resolve())),
    ]);

    await Promise.all([
      new Promise<void>((resolve) => {
        challengerSocket.emit('joinBattleRoom', { battleId: created.battleId }, () => resolve());
      }),
      new Promise<void>((resolve) => {
        opponentSocket.emit('joinBattleRoom', { battleId: created.battleId }, () => resolve());
      }),
    ]);

    let startReceived = false;
    challengerSocket.on('battleStart', () => {
      startReceived = true;
    });

    const opponentReadyRes = await new Promise<PlayerReadyResponse>((resolve) => {
      opponentSocket.emit('playerReady', { battleId: created.battleId }, (res: PlayerReadyResponse) => {
        resolve(res);
      });
    });
    assert.equal(opponentReadyRes.success, true);
    assert.equal(opponentReadyRes.readyCount, 1);

    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(startReceived, false);

    const challengerReadyRes = await new Promise<PlayerReadyResponse>((resolve) => {
      challengerSocket.emit('playerReady', { battleId: created.battleId }, (res: PlayerReadyResponse) => {
        resolve(res);
      });
    });
    assert.equal(challengerReadyRes.success, true);
    assert.equal(challengerReadyRes.readyCount, 2);

    const deadline2 = Date.now() + 3000;
    while (!startReceived && Date.now() < deadline2) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(startReceived, true);
  });

  describe('runScoringService transport-agnostic evaluation', () => {
    const baseRun: GameRun = {
      runId: 'scoring-test-run',
      telegramUserId: 99999,
      comboCount: 0,
      maxCombo: 0,
      runningTotal: 0,
      startedAt: new Date(Date.now() - 5000),
      status: 'active',
      mode: 'practice',
      profileCredited: false,
      runDurationMs: 60000,
      createdAt: new Date(),
      updatedAt: new Date(),
      flags: [
        {
          flagIndex: 0,
          isoCode: 'FR',
          name: 'France',
          tier: 1,
          choices: ['France', 'Germany', 'Spain', 'Italy'],
          answered: false,
        },
        {
          flagIndex: 1,
          isoCode: 'BR',
          name: 'Brazil',
          tier: 2,
          choices: ['Brazil', 'Argentina', 'Chile', 'Peru'],
          answered: false,
        },
      ],
    };

    it('correctly calculates points and combo for correct and wrong answers', () => {
      const correctResult = scoreAnswer(baseRun, 0, 'FR', Date.now());
      assert.equal(correctResult.isCorrect, true);
      assert.equal(correctResult.newCombo, 1);
      assert.equal(correctResult.pointsThisFlag, 55);
      assert.equal(correctResult.newRunningTotal, 55);
      assert.equal(correctResult.newMaxCombo, 1);

      const runAfterFirst = {
        ...baseRun,
        comboCount: correctResult.newCombo,
        maxCombo: correctResult.newMaxCombo,
        runningTotal: correctResult.newRunningTotal,
        flags: [
          { ...baseRun.flags[0], answered: true, correct: true },
          baseRun.flags[1],
        ],
      };

      const wrongResult = scoreAnswer(runAfterFirst, 1, 'WRONG', Date.now());
      assert.equal(wrongResult.isCorrect, false);
      assert.equal(wrongResult.newCombo, 0);
      assert.equal(wrongResult.pointsThisFlag, 0);
      assert.equal(wrongResult.newRunningTotal, 55);
      assert.equal(wrongResult.newMaxCombo, 1);
    });

    it('throws TimeExpiredError when answering after duration has elapsed', () => {
      assert.throws(
        () => scoreAnswer(baseRun, 0, 'FR', new Date(baseRun.startedAt).getTime() + 60001),
        (err) => err instanceof TimeExpiredError,
      );
    });

    it('throws FlagAlreadyAnsweredError when answering an already answered flag', () => {
      const answeredRun: GameRun = {
        ...baseRun,
        flags: [{ ...baseRun.flags[0], answered: true }],
      };
      assert.throws(
        () => scoreAnswer(answeredRun, 0, 'FR', Date.now()),
        (err) => err instanceof FlagAlreadyAnsweredError,
      );
    });

    it('throws InvalidFlagIndexError for out-of-bounds flag index', () => {
      assert.throws(
        () => scoreAnswer(baseRun, 99, 'FR', Date.now()),
        (err) => err instanceof InvalidFlagIndexError,
      );
    });

    it('finalizes run with leftover bonus and awards accurately', () => {
      const runToFinalize: GameRun = {
        ...baseRun,
        runningTotal: 500,
        flags: [
          { ...baseRun.flags[0], answered: true, correct: true },
          { ...baseRun.flags[1], answered: true, correct: true },
        ],
      };

      const finalized = finalizeRun(runToFinalize, new Date(runToFinalize.startedAt).getTime() + 20000);
      assert.equal(finalized.elapsedMs, 20000);
      assert.equal(finalized.timeUsedMs, 20000);
      assert.equal(finalized.leftoverMs, 40000);
      assert.equal(finalized.leftoverBonus, 400);
      assert.equal(finalized.totalScore, 900);
      assert.equal(finalized.correctCount, 2);
      assert.ok(finalized.xpEarned > 0);
      assert.ok(finalized.coinsEarned > 0);
    });
  });

  describe('live battle answer submissions and opponent progress', () => {
    async function setupActiveBattle(challengerId = 91001, opponentId = 91002) {
      await db.collection('profiles').deleteMany({ telegramUserId: { $in: [challengerId, opponentId] } });
      await db.collection('profiles').insertMany([
        {
          telegramUserId: challengerId,
          username: `challenger_${challengerId}`,
          displayName: `Challenger ${challengerId}`,
          xp: 0,
          coins: 0,
          level: 1,
          bestScore: 0,
          gamesPlayed: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          telegramUserId: opponentId,
          username: `opponent_${opponentId}`,
          displayName: `Opponent ${opponentId}`,
          xp: 0,
          coins: 0,
          level: 1,
          bestScore: 0,
          gamesPlayed: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const challengerToken = createSessionToken(challengerId, TEST_SECRET);
      const opponentToken = createSessionToken(opponentId, TEST_SECRET);

      const createRes = await fetch(`${baseUrl}/api/battles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${challengerToken}`,
        },
      });
      const created = (await createRes.json()) as CreateBattleResponse;
      const battleId = created.battleId;

      await fetch(`${baseUrl}/api/battles/${battleId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${opponentToken}` },
      });

      const challengerSocket = createClient(challengerToken);
      const opponentSocket = createClient(opponentToken);

      await Promise.all([
        new Promise<void>((resolve) => challengerSocket.on('connect', () => resolve())),
        new Promise<void>((resolve) => opponentSocket.on('connect', () => resolve())),
      ]);

      await Promise.all([
        new Promise<void>((resolve) => challengerSocket.emit('joinBattleRoom', { battleId }, () => resolve())),
        new Promise<void>((resolve) => opponentSocket.emit('joinBattleRoom', { battleId }, () => resolve())),
      ]);

      const startPromise = Promise.all([
        new Promise<BattleStartPayload>((resolve) => challengerSocket.once('battleStart', resolve)),
        new Promise<BattleStartPayload>((resolve) => opponentSocket.once('battleStart', resolve)),
      ]);

      await Promise.all([
        new Promise<void>((resolve) => challengerSocket.emit('playerReady', { battleId }, () => resolve())),
        new Promise<void>((resolve) => opponentSocket.emit('playerReady', { battleId }, () => resolve())),
      ]);

      const [cStart, oStart] = await startPromise;

      return {
        battleId,
        challengerId,
        opponentId,
        challengerSocket,
        opponentSocket,
        cStart,
        oStart,
      };
    }

    it('produces identical scoring results between REST runService and socket submitAnswer for the same input sequence', async () => {
      const { battleId, challengerSocket, cStart } = await setupActiveBattle(92001, 92002);
      const battleRun = await db.collection<GameRun>('runs').findOne({ runId: cStart.challengerRunId });
      assert.ok(battleRun);

      const soloUserId = 92003;
      await db.collection('profiles').insertOne({
        telegramUserId: soloUserId,
        displayName: 'Solo Player',
        xp: 0,
        coins: 0,
        level: 1,
        bestScore: 0,
        gamesPlayed: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const soloRun = await createRun(soloUserId, db, {
        mode: 'practice',
        flags: battleRun.flags,
      });

      const inputSequence = [
        { flagIndex: 0, selectedIsoCode: battleRun.flags[0].isoCode },
        { flagIndex: 1, selectedIsoCode: battleRun.flags[1].isoCode },
        { flagIndex: 2, selectedIsoCode: 'INVALID_ISO' },
        { flagIndex: 3, selectedIsoCode: battleRun.flags[3].isoCode },
        { flagIndex: 4, selectedIsoCode: battleRun.flags[4].isoCode },
      ];

      for (const step of inputSequence) {
        const restResult = await submitRestAnswer(soloRun.runId, soloUserId, step.flagIndex, step.selectedIsoCode, db);

        const socketEventPromise = new Promise<AnswerResultPayload>((resolve) => {
          challengerSocket.once('answerResult', resolve);
        });

        const socketCallbackResult = await new Promise<SubmitAnswerResponse>((resolve) => {
          challengerSocket.emit(
            'submitAnswer',
            {
              battleId,
              flagIndex: step.flagIndex,
              selectedIsoCode: step.selectedIsoCode,
            },
            (res: SubmitAnswerResponse) => resolve(res),
          );
        });

        const socketEventResult = await socketEventPromise;

        assert.equal(socketCallbackResult.success, true);
        assert.ok(socketCallbackResult.result);
        assert.equal(socketCallbackResult.result.correct, restResult.correct);
        assert.equal(socketCallbackResult.result.comboCount, restResult.comboCount);
        assert.equal(socketCallbackResult.result.pointsThisFlag, restResult.pointsThisFlag);
        assert.equal(socketCallbackResult.result.runningTotal, restResult.runningTotal);

        assert.equal(socketEventResult.correct, restResult.correct);
        assert.equal(socketEventResult.comboCount, restResult.comboCount);
        assert.equal(socketEventResult.pointsThisFlag, restResult.pointsThisFlag);
        assert.equal(socketEventResult.runningTotal, restResult.runningTotal);
      }
    });

    it('opponentProgress payloads never contain selectedIsoCode or correct-answer data', async () => {
      const { battleId, challengerSocket, opponentSocket, cStart } = await setupActiveBattle(93001, 93002);
      const battleRun = await db.collection<GameRun>('runs').findOne({ runId: cStart.challengerRunId });
      assert.ok(battleRun);

      const receivedProgress: OpponentProgressPayload[] = [];
      opponentSocket.on('opponentProgress', (payload) => {
        receivedProgress.push(payload);
      });

      const answersToSubmit = [
        { flagIndex: 0, choice: battleRun.flags[0].isoCode },
        { flagIndex: 1, choice: 'WRONG' },
        { flagIndex: 2, choice: battleRun.flags[2].isoCode },
      ];

      for (const item of answersToSubmit) {
        await new Promise<SubmitAnswerResponse>((resolve) => {
          challengerSocket.emit(
            'submitAnswer',
            {
              battleId,
              flagIndex: item.flagIndex,
              selectedIsoCode: item.choice,
            },
            (res: SubmitAnswerResponse) => resolve(res),
          );
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.equal(receivedProgress.length, 3);

      for (let i = 0; i < receivedProgress.length; i++) {
        const item = receivedProgress[i];
        assert.equal(item.flagIndex, i);
        assert.equal(typeof item.correct, 'boolean');
        assert.equal(typeof item.runningTotal, 'number');

        const raw = item as unknown as Record<string, unknown>;
        assert.equal(raw.selectedIsoCode, undefined);
        assert.equal(raw.isoCode, undefined);
        assert.equal(raw.name, undefined);
        assert.equal(raw.choices, undefined);
        assert.equal(raw.answer, undefined);

        const keys = Object.keys(item).sort();
        assert.deepEqual(keys, ['correct', 'flagIndex', 'runningTotal']);
      }
    });

    it('rejects double-answering the same flagIndex over socket', async () => {
      const { battleId, challengerSocket, opponentSocket, cStart } = await setupActiveBattle(94001, 94002);
      const battleRun = await db.collection<GameRun>('runs').findOne({ runId: cStart.challengerRunId });
      assert.ok(battleRun);

      const opponentProgressEvents: OpponentProgressPayload[] = [];
      opponentSocket.on('opponentProgress', (payload) => {
        opponentProgressEvents.push(payload);
      });

      const firstRes = await new Promise<SubmitAnswerResponse>((resolve) => {
        challengerSocket.emit(
          'submitAnswer',
          {
            battleId,
            flagIndex: 0,
            selectedIsoCode: battleRun.flags[0].isoCode,
          },
          (res: SubmitAnswerResponse) => resolve(res),
        );
      });
      assert.equal(firstRes.success, true);

      let battleErrorEvent: BattleErrorPayload | undefined;
      challengerSocket.once('battleError', (p) => {
        battleErrorEvent = p;
      });

      const secondRes = await new Promise<SubmitAnswerResponse>((resolve) => {
        challengerSocket.emit(
          'submitAnswer',
          {
            battleId,
            flagIndex: 0,
            selectedIsoCode: battleRun.flags[0].isoCode,
          },
          (res: SubmitAnswerResponse) => resolve(res),
        );
      });

      assert.equal(secondRes.success, false);
      assert.equal(secondRes.error, 'Bad request');
      assert.equal(secondRes.message, 'This flag has already been answered');

      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.ok(battleErrorEvent);
      assert.equal(battleErrorEvent.message, 'This flag has already been answered');
      assert.equal(opponentProgressEvents.length, 1);
    });

    it('rejects an answer submitted after server-side timer has elapsed with time expired result', async () => {
      const { battleId, challengerSocket, cStart } = await setupActiveBattle(95001, 95002);

      await db.collection<GameRun>('runs').updateOne(
        { runId: cStart.challengerRunId },
        { $set: { startedAt: new Date(Date.now() - 65000) } },
      );

      let battleErrorEvent: BattleErrorPayload | undefined;
      challengerSocket.once('battleError', (p) => {
        battleErrorEvent = p;
      });

      const res = await new Promise<SubmitAnswerResponse>((resolve) => {
        challengerSocket.emit(
          'submitAnswer',
          {
            battleId,
            flagIndex: 0,
            selectedIsoCode: 'FR',
          },
          (r: SubmitAnswerResponse) => resolve(r),
        );
      });

      assert.equal(res.success, false);
      assert.equal(res.timeExpired, true);
      assert.equal(res.error, 'Time expired');

      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.ok(battleErrorEvent);
      assert.equal(battleErrorEvent.timeExpired, true);
      assert.equal(battleErrorEvent.error, 'Time expired');

      const updatedRun = await db.collection<GameRun>('runs').findOne({ runId: cStart.challengerRunId });
      assert.equal(updatedRun?.status, 'expired');
    });
  });

  describe('battle completion, lazy finalization, and disconnects', () => {
    async function setupActiveBattleForCompletion(challengerId: number, opponentId: number) {
      await db.collection('profiles').deleteMany({ telegramUserId: { $in: [challengerId, opponentId] } });
      await db.collection('profiles').insertMany([
        {
          telegramUserId: challengerId,
          username: `challenger_${challengerId}`,
          displayName: `Challenger ${challengerId}`,
          xp: 0,
          coins: 0,
          level: 1,
          bestScore: 0,
          gamesPlayed: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          telegramUserId: opponentId,
          username: `opponent_${opponentId}`,
          displayName: `Opponent ${opponentId}`,
          xp: 0,
          coins: 0,
          level: 1,
          bestScore: 0,
          gamesPlayed: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const challengerToken = createSessionToken(challengerId, TEST_SECRET);
      const opponentToken = createSessionToken(opponentId, TEST_SECRET);

      const createRes = await fetch(`${baseUrl}/api/battles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${challengerToken}`,
        },
      });
      const created = (await createRes.json()) as CreateBattleResponse;
      const battleId = created.battleId;

      await fetch(`${baseUrl}/api/battles/${battleId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${opponentToken}` },
      });

      const challengerSocket = createClient(challengerToken);
      const opponentSocket = createClient(opponentToken);

      await Promise.all([
        new Promise<void>((resolve) => challengerSocket.on('connect', () => resolve())),
        new Promise<void>((resolve) => opponentSocket.on('connect', () => resolve())),
      ]);

      await Promise.all([
        new Promise<void>((resolve) => challengerSocket.emit('joinBattleRoom', { battleId }, () => resolve())),
        new Promise<void>((resolve) => opponentSocket.emit('joinBattleRoom', { battleId }, () => resolve())),
      ]);

      const startPromise = Promise.all([
        new Promise<BattleStartPayload>((resolve) => challengerSocket.once('battleStart', resolve)),
        new Promise<BattleStartPayload>((resolve) => opponentSocket.once('battleStart', resolve)),
      ]);

      await Promise.all([
        new Promise<void>((resolve) => challengerSocket.emit('playerReady', { battleId }, () => resolve())),
        new Promise<void>((resolve) => opponentSocket.emit('playerReady', { battleId }, () => resolve())),
      ]);

      const [cStart, oStart] = await startPromise;

      return {
        battleId,
        challengerId,
        opponentId,
        challengerToken,
        opponentToken,
        challengerSocket,
        opponentSocket,
        cStart,
        oStart,
      };
    }

    it('lazily finalizes an abandoned opponent run when the other participant finishes', async () => {
      const { battleId, challengerSocket, opponentSocket, challengerToken, cStart, oStart } =
        await setupActiveBattleForCompletion(96001, 96002);

      opponentSocket.disconnect();

      await db.collection('runs').updateOne(
        { runId: oStart.opponentRunId },
        { $set: { startedAt: new Date(Date.now() - 70000) } },
      );

      let finishedPayload: BattleFinishedPayload | undefined;
      challengerSocket.once('battleFinished', (payload) => {
        finishedPayload = payload;
      });

      const finishRes = await fetch(`${baseUrl}/api/runs/${cStart.challengerRunId}/finish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${challengerToken}` },
      });
      assert.equal(finishRes.status, 200);

      const deadline = Date.now() + 3000;
      while (!finishedPayload && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      assert.ok(finishedPayload);
      assert.equal(finishedPayload.battleId, battleId);

      const opponentRun = await db.collection<GameRun>('runs').findOne({ runId: oStart.opponentRunId });
      assert.ok(opponentRun);
      assert.equal(opponentRun.profileCredited, true);

      const battleDoc = await db.collection<BattleSession>('battles').findOne({ battleId });
      assert.equal(battleDoc?.status, 'completed');
      assert.ok(battleDoc?.winner);
      assert.equal(typeof battleDoc?.challengerScore, 'number');
      assert.equal(typeof battleDoc?.opponentScore, 'number');
    });

    it('correctly determines winner for win, lose, and tie outcomes', async () => {
      const battleA = await setupActiveBattleForCompletion(97001, 97002);
      await db.collection('runs').updateOne(
        { runId: battleA.cStart.challengerRunId },
        { $set: { runningTotal: 800, startedAt: new Date(Date.now() - 65000) } },
      );
      await db.collection('runs').updateOne(
        { runId: battleA.oStart.opponentRunId },
        { $set: { runningTotal: 400, startedAt: new Date(Date.now() - 65000) } },
      );
      await finishRun(battleA.cStart.challengerRunId, 97001, db, undefined, io);
      const docA = await db.collection<BattleSession>('battles').findOne({ battleId: battleA.battleId });
      assert.equal(docA?.status, 'completed');
      assert.equal(docA?.winner, 'challenger');

      const battleB = await setupActiveBattleForCompletion(97003, 97004);
      await db.collection('runs').updateOne(
        { runId: battleB.cStart.challengerRunId },
        { $set: { runningTotal: 300, startedAt: new Date(Date.now() - 65000) } },
      );
      await db.collection('runs').updateOne(
        { runId: battleB.oStart.opponentRunId },
        { $set: { runningTotal: 700, startedAt: new Date(Date.now() - 65000) } },
      );
      await finishRun(battleB.cStart.challengerRunId, 97003, db, undefined, io);
      const docB = await db.collection<BattleSession>('battles').findOne({ battleId: battleB.battleId });
      assert.equal(docB?.status, 'completed');
      assert.equal(docB?.winner, 'opponent');

      const battleC = await setupActiveBattleForCompletion(97005, 97006);
      await db.collection('runs').updateOne(
        { runId: battleC.cStart.challengerRunId },
        { $set: { runningTotal: 500, startedAt: new Date(Date.now() - 65000) } },
      );
      await db.collection('runs').updateOne(
        { runId: battleC.oStart.opponentRunId },
        { $set: { runningTotal: 500, startedAt: new Date(Date.now() - 65000) } },
      );
      await finishRun(battleC.cStart.challengerRunId, 97005, db, undefined, io);
      const docC = await db.collection<BattleSession>('battles').findOne({ battleId: battleC.battleId });
      assert.equal(docC?.status, 'completed');
      assert.equal(docC?.winner, 'tie');
    });

    it('returns full completion breakdown via GET /api/battles/:id for offline participant', async () => {
      const { battleId, opponentToken, oStart } = await setupActiveBattleForCompletion(98001, 98002);

      await db.collection('runs').updateOne(
        { runId: oStart.opponentRunId },
        { $set: { runningTotal: 650, startedAt: new Date(Date.now() - 65000) } },
      );
      await finishRun(oStart.challengerRunId, 98001, db, undefined, io);

      const getRes = await fetch(`${baseUrl}/api/battles/${battleId}`, {
        headers: { Authorization: `Bearer ${opponentToken}` },
      });
      assert.equal(getRes.status, 200);
      const data = (await getRes.json()) as BattleInfoResponse;

      assert.equal(data.status, 'completed');
      assert.ok(data.winner);
      assert.equal(typeof data.challengerScore, 'number');
      assert.equal(typeof data.opponentScore, 'number');
      assert.ok(data.completedAt);
      assert.ok(data.challengerResult);
      assert.equal(data.challengerResult.userId, 98001);
      assert.ok(data.opponentResult);
      assert.equal(data.opponentResult.userId, 98002);
    });

    it('live-battle finish awards progression without affecting bestScore or global leaderboard', async () => {
      const initialProfile: PlayerProfile = {
        telegramUserId: 99001,
        firstName: 'Progression',
        lastName: 'Player',
        username: 'progression_player',
        xp: 100,
        coins: 50,
        level: 1,
        currentStreak: 0,
        longestStreak: 0,
        bestScore: 500,
        gamesPlayed: 2,
        lastPlayedDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await db.collection('profiles').deleteMany({ telegramUserId: 99001 });
      await db.collection('profiles').insertOne(initialProfile);

      const run = await createRun(99001, db, {
        mode: 'live-battle',
        battleId: 'test-regression-battle-id',
      });

      const updatedFlags = run.flags.map((f, i) =>
        i < 5
          ? {
              ...f,
              answered: true,
              selectedIsoCode: f.isoCode,
              correct: true,
              points: 100,
              comboCount: 1,
              answeredAt: new Date(),
            }
          : f,
      );
      await db.collection('runs').updateOne(
        { runId: run.runId },
        { $set: { runningTotal: 1500, flags: updatedFlags } },
      );

      const finishRes = await finishRun(run.runId, 99001, db);
      assert.equal(finishRes.isNewBest, false);

      const updatedProfile = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: 99001 });
      assert.ok(updatedProfile);
      assert.equal(updatedProfile.bestScore, 500);
      assert.ok(updatedProfile.xp > 100);
      assert.ok(updatedProfile.coins > 50);
      assert.equal(updatedProfile.gamesPlayed, 3);
    });

    it('disconnect correctly clears presence tracking without corrupting bothPlayersPresent on reconnect', async () => {
      const challengerId = 99101;
      const opponentId = 99102;
      const challengerToken = createSessionToken(challengerId, TEST_SECRET);
      const opponentToken = createSessionToken(opponentId, TEST_SECRET);

      const createRes = await fetch(`${baseUrl}/api/battles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${challengerToken}`,
        },
      });
      const created = (await createRes.json()) as CreateBattleResponse;
      const battleId = created.battleId;

      await fetch(`${baseUrl}/api/battles/${battleId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${opponentToken}` },
      });

      const cSocket = createClient(challengerToken);
      let oSocket = createClient(opponentToken);

      await Promise.all([
        new Promise<void>((resolve) => cSocket.on('connect', () => resolve())),
        new Promise<void>((resolve) => oSocket.on('connect', () => resolve())),
      ]);

      let bothCount = 0;
      cSocket.on('bothPlayersPresent', () => {
        bothCount++;
      });

      await Promise.all([
        new Promise<void>((resolve) => cSocket.emit('joinBattleRoom', { battleId }, () => resolve())),
        new Promise<void>((resolve) => oSocket.emit('joinBattleRoom', { battleId }, () => resolve())),
      ]);

      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.equal(bothCount, 1);

      oSocket.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 80));

      const roomSockets = await io.in(`battle:${battleId}`).fetchSockets();
      assert.equal(roomSockets.length, 1);

      oSocket = createClient(opponentToken);
      await new Promise<void>((resolve) => oSocket.on('connect', () => resolve()));
      await new Promise<void>((resolve) => oSocket.emit('joinBattleRoom', { battleId }, () => resolve()));

      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.equal(bothCount, 2);
    });
  });
});
