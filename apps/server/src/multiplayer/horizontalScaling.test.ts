import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import RedisMock from 'ioredis-mock';
import type { Redis as RedisClient } from 'ioredis';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { initSocketServer, type SocketServerOptions } from './socketServer.js';
import type { TypedSocketServer } from './socketTypes.js';
import { createRequireSessionMiddleware } from '../session/requireSession.js';
import { createSessionToken } from '../session/tokens.js';
import { createBattle, joinBattle } from '../battle/battleService.js';
import { seedFlags } from '../game/seedFlags.js';
import { initFlagCache, getCachedFlagByIso, getCachedFlags } from '../game/flagCache.js';
import type {
  CreateBattleResponse,
  JoinBattleRoomResponse,
  PlayerReadyResponse,
  BothPlayersPresentPayload,
  PlayerReadyBroadcastPayload,
  BattleStartPayload,
  OpponentProgressPayload,
  BattleFinishedPayload,
  SubmitAnswerResponse,
} from '@flagora/shared';

const TEST_SECRET = 'horizontal_scaling_test_secret_32_chars';

describe('Horizontal Scaling Readiness', () => {
  let mongod: MongoMemoryServer;
  let mongoClient: MongoClient;
  let db: Db;
  let sharedRedis: RedisClient;

  let server1: http.Server;
  let io1: TypedSocketServer;
  let baseUrl1: string;

  let server2: http.Server;
  let io2: TypedSocketServer;
  let baseUrl2: string;

  const activeSockets: ClientSocket[] = [];

  function createClient(baseUrl: string, token: string): ClientSocket {
    const socket = ioClient(baseUrl, {
      autoConnect: true,
      transports: ['websocket'],
      reconnection: false,
      auth: { token },
    });
    activeSockets.push(socket);
    return socket;
  }

  before(async () => {
    mongod = await MongoMemoryServer.create();
    mongoClient = new MongoClient(mongod.getUri());
    await mongoClient.connect();
    db = mongoClient.db('test-scaling');

    await seedFlags(db);
    await initFlagCache(db);

    sharedRedis = new RedisMock() as unknown as RedisClient;

    const sessionMiddleware = createRequireSessionMiddleware(TEST_SECRET);

    const createApp = (ioInstanceGetter: () => TypedSocketServer) => {
      const app = express();
      app.use(express.json());

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

      app.post('/api/battles/:id/join', sessionMiddleware, async (req, res) => {
        try {
          const userId = (req as unknown as { sessionUser?: { telegramUserId: number } }).sessionUser?.telegramUserId;
          if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
          }
          const id = String(req.params.id);
          const result = await joinBattle(id, userId, db, ioInstanceGetter(), sharedRedis);
          res.status(200).json(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Error';
          res.status(500).json({ error: message });
        }
      });

      return app;
    };

    const serverOptions: SocketServerOptions = {
      countdownDelayMs: 40,
      redis: sharedRedis,
    };

    const app1 = createApp(() => io1);
    server1 = http.createServer(app1);
    io1 = initSocketServer(server1, TEST_SECRET, db, serverOptions);

    await new Promise<void>((resolve) => {
      server1.listen(0, () => {
        const addr = server1.address();
        if (typeof addr === 'object' && addr) {
          baseUrl1 = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });

    const app2 = createApp(() => io2);
    server2 = http.createServer(app2);
    io2 = initSocketServer(server2, TEST_SECRET, db, serverOptions);

    await new Promise<void>((resolve) => {
      server2.listen(0, () => {
        const addr = server2.address();
        if (typeof addr === 'object' && addr) {
          baseUrl2 = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    for (const socket of activeSockets) {
      if (socket.connected) {
        socket.disconnect();
      }
    }
    if (server1) {
      await new Promise<void>((resolve) => server1.close(() => resolve()));
    }
    if (server2) {
      await new Promise<void>((resolve) => server2.close(() => resolve()));
    }
    if (mongoClient) {
      await mongoClient.close();
    }
    if (mongod) {
      await mongod.stop();
    }
  });

  it('coordinates full battle across two distinct Socket.IO server instances sharing Redis', async () => {
    const challengerId = 9101;
    const opponentId = 9102;

    const challengerToken = createSessionToken(challengerId, TEST_SECRET);
    const opponentToken = createSessionToken(opponentId, TEST_SECRET);

    const createRes = await fetch(`${baseUrl1}/api/battles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${challengerToken}`,
      },
    });
    assert.equal(createRes.status, 200);
    const created = (await createRes.json()) as CreateBattleResponse;
    const battleId = created.battleId;

    const joinRes = await fetch(`${baseUrl2}/api/battles/${battleId}/join`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opponentToken}` },
    });
    assert.equal(joinRes.status, 200);

    const challengerSocket = createClient(baseUrl1, challengerToken);
    const opponentSocket = createClient(baseUrl2, opponentToken);

    await Promise.all([
      new Promise<void>((resolve) => challengerSocket.on('connect', () => resolve())),
      new Promise<void>((resolve) => opponentSocket.on('connect', () => resolve())),
    ]);

    const challengerBothPresentPromise = new Promise<BothPlayersPresentPayload>((resolve) => {
      challengerSocket.once('bothPlayersPresent', resolve);
    });
    const opponentBothPresentPromise = new Promise<BothPlayersPresentPayload>((resolve) => {
      opponentSocket.once('bothPlayersPresent', resolve);
    });

    const challengerJoinRes = await new Promise<JoinBattleRoomResponse>((resolve) => {
      challengerSocket.emit('joinBattleRoom', { battleId }, resolve);
    });
    assert.equal(challengerJoinRes.success, true);

    const opponentJoinRes = await new Promise<JoinBattleRoomResponse>((resolve) => {
      opponentSocket.emit('joinBattleRoom', { battleId }, resolve);
    });
    assert.equal(opponentJoinRes.success, true);

    const [challengerBothPresent, opponentBothPresent] = await Promise.all([
      challengerBothPresentPromise,
      opponentBothPresentPromise,
    ]);
    assert.equal(challengerBothPresent.battleId, battleId);
    assert.equal(opponentBothPresent.battleId, battleId);

    const opponentSeesChallengerReadyPromise = new Promise<PlayerReadyBroadcastPayload>((resolve) => {
      opponentSocket.once('battlePlayerReady', resolve);
    });

    const challengerReadyRes = await new Promise<PlayerReadyResponse>((resolve) => {
      challengerSocket.emit('playerReady', { battleId }, resolve);
    });
    assert.equal(challengerReadyRes.success, true);
    assert.equal(challengerReadyRes.readyCount, 1);

    const opponentObservedReady = await opponentSeesChallengerReadyPromise;
    assert.equal(opponentObservedReady.userId, challengerId);
    assert.equal(opponentObservedReady.readyCount, 1);
    assert.equal(opponentObservedReady.challengerReady, true);
    assert.equal(opponentObservedReady.opponentReady, false);

    const challengerStartPromise = new Promise<BattleStartPayload>((resolve) => {
      challengerSocket.once('battleStart', resolve);
    });
    const opponentStartPromise = new Promise<BattleStartPayload>((resolve) => {
      opponentSocket.once('battleStart', resolve);
    });

    const opponentReadyRes = await new Promise<PlayerReadyResponse>((resolve) => {
      opponentSocket.emit('playerReady', { battleId }, resolve);
    });
    assert.equal(opponentReadyRes.success, true);
    assert.equal(opponentReadyRes.readyCount, 2);

    const [challengerBattleStart, opponentBattleStart] = await Promise.all([
      challengerStartPromise,
      opponentStartPromise,
    ]);

    assert.equal(challengerBattleStart.battleId, battleId);
    assert.equal(opponentBattleStart.battleId, battleId);
    assert.equal(challengerBattleStart.flags.length, 10);
    assert.equal(opponentBattleStart.flags.length, 10);
    assert.equal(
      challengerBattleStart.flags[0].isoCode,
      opponentBattleStart.flags[0].isoCode,
    );

    const opponentProgressPromise = new Promise<OpponentProgressPayload>((resolve) => {
      opponentSocket.once('opponentProgress', resolve);
    });

    const answerRes = await new Promise<SubmitAnswerResponse>((resolve) => {
      challengerSocket.emit(
        'submitAnswer',
        {
          battleId,
          flagIndex: 0,
          selectedIsoCode: challengerBattleStart.flags[0].isoCode,
        },
        resolve,
      );
    });
    assert.equal(answerRes.success, true);

    const progress = await opponentProgressPromise;
    assert.equal(progress.flagIndex, 0);
    assert.equal(typeof progress.correct, 'boolean');
    assert.ok(progress.runningTotal >= 0);

    const challengerFinishedPromise = new Promise<BattleFinishedPayload>((resolve) => {
      challengerSocket.once('battleFinished', resolve);
    });
    const opponentFinishedPromise = new Promise<BattleFinishedPayload>((resolve) => {
      opponentSocket.once('battleFinished', resolve);
    });

    for (let i = 1; i < 10; i++) {
      await new Promise<SubmitAnswerResponse>((resolve) => {
        challengerSocket.emit(
          'submitAnswer',
          {
            battleId,
            flagIndex: i,
            selectedIsoCode: challengerBattleStart.flags[i].isoCode,
          },
          resolve,
        );
      });
    }

    for (let i = 0; i < 10; i++) {
      await new Promise<SubmitAnswerResponse>((resolve) => {
        opponentSocket.emit(
          'submitAnswer',
          {
            battleId,
            flagIndex: i,
            selectedIsoCode: opponentBattleStart.flags[i].isoCode,
          },
          resolve,
        );
      });
    }

    const [challengerFinished, opponentFinished] = await Promise.all([
      challengerFinishedPromise,
      opponentFinishedPromise,
    ]);

    assert.equal(challengerFinished.battleId, battleId);
    assert.equal(opponentFinished.battleId, battleId);
    assert.ok(challengerFinished.winner !== undefined);
    assert.equal(challengerFinished.winner, opponentFinished.winner);
  });

  it('cleans up Redis presence when a player socket disconnects from an instance', async () => {
    const battleId = 'presence_cleanup_test_battle';
    const userId = 9991;
    const token = createSessionToken(userId, TEST_SECRET);

    await db.collection('battles').insertOne({
      battleId,
      challengerUserId: userId,
      opponentUserId: null,
      status: 'pending',
      createdAt: new Date(),
    });

    const socket = createClient(baseUrl1, token);
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));

    const joinRes = await new Promise<JoinBattleRoomResponse>((resolve) => {
      socket.emit('joinBattleRoom', { battleId }, resolve);
    });
    assert.equal(joinRes.success, true);

    const isPresentBefore = await sharedRedis.sismember(`battle:${battleId}:presence`, String(userId));
    assert.equal(isPresentBefore, 1);

    socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const isPresentAfter = await sharedRedis.sismember(`battle:${battleId}:presence`, String(userId));
    assert.equal(isPresentAfter, 0);
  });

  it('ensures static flag cache behaves identically and consistently across multiple instances', async () => {
    assert.equal(getCachedFlags().length, 194);
    const france = getCachedFlagByIso('fr');
    assert.ok(france);
    assert.equal(france.name, 'France');

    await initFlagCache(db);

    assert.equal(getCachedFlags().length, 194);
    const franceReloaded = getCachedFlagByIso('fr');
    assert.ok(franceReloaded);
    assert.equal(franceReloaded.name, 'France');
    assert.equal(franceReloaded.isoCode, 'fr');
  });
});
