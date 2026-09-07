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
import { createSessionToken } from '../session/tokens.js';
import { initSocketServer } from '../multiplayer/socketServer.js';
import type {
  TypedSocketServer,
  JoinBattleRoomResponse,
  OpponentJoinedPayload,
  BattleErrorPayload,
} from '../multiplayer/socketTypes.js';
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

    await db.collection('profiles').createIndex({ telegramUserId: 1 }, { unique: true });
    await db.collection('battles').createIndex({ battleId: 1 }, { unique: true });
    await db.collection('battles').createIndex({ expiresAt: 1 });

    const app = express();
    app.use(express.json());

    const sessionMiddleware = createRequireSessionMiddleware(TEST_SECRET);

    httpServer = http.createServer(app);
    io = initSocketServer(httpServer, TEST_SECRET, db);

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
});
