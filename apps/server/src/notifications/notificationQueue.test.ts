import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Redis as RedisClient } from 'ioredis';
import { initRedis, closeRedis } from '../db/redis.js';
import { ensureIndexes } from '../db/mongo.js';
import { submitAnswer, finishRun } from '../game/runService.js';
import { createChallenge, acceptChallenge } from '../challenge/challengeService.js';
import {
  initNotificationQueue,
  enqueueTelegramNotification,
  drainNotificationQueue,
  closeNotificationQueue,
} from './notificationQueue.js';

interface CapturedRequest {
  chatId: number | string;
  text: string;
  buttonText?: string;
  buttonUrl?: string;
  timestamp: number;
}

describe('async notification queue', () => {
  let mockTelegramServer: http.Server;
  let mockServerPort: number;
  let capturedRequests: CapturedRequest[] = [];
  let responseDelayMs = 0;
  let shouldFailRequests = false;
  let failureStatusCode = 500;
  let failAttemptLimit = 0;
  let requestAttemptCount = 0;

  let mongod: MongoMemoryServer;
  let mongoClient: MongoClient;
  let db: Db;
  let redis: RedisClient;

  before(async () => {
    mockTelegramServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        requestAttemptCount++;
        const now = Date.now();
        try {
          const parsed = JSON.parse(body);
          const button = parsed.reply_markup?.inline_keyboard?.[0]?.[0];
          capturedRequests.push({
            chatId: parsed.chat_id,
            text: parsed.text,
            buttonText: button?.text,
            buttonUrl: button?.url,
            timestamp: now,
          });
        } catch {
          void 0;
        }

        const respond = () => {
          if (shouldFailRequests || (failAttemptLimit > 0 && requestAttemptCount <= failAttemptLimit)) {
            res.writeHead(failureStatusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error_code: failureStatusCode, description: 'Simulated failure' }));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, result: { message_id: 12345 } }));
          }
        };

        if (responseDelayMs > 0) {
          setTimeout(respond, responseDelayMs);
        } else {
          respond();
        }
      });
    });

    await new Promise<void>((resolve) => {
      mockTelegramServer.listen(0, () => {
        const addr = mockTelegramServer.address();
        if (addr && typeof addr === 'object') {
          mockServerPort = addr.port;
          process.env.TELEGRAM_API_BASE_URL = `http://127.0.0.1:${mockServerPort}`;
          process.env.TELEGRAM_BOT_TOKEN = 'test_notification_queue_token';
          process.env.TELEGRAM_BOT_USERNAME = 'FlagoraBot';
        }
        resolve();
      });
    });

    mongod = await MongoMemoryServer.create();
    mongoClient = new MongoClient(mongod.getUri());
    await mongoClient.connect();
    db = mongoClient.db('test-notifications');
    await ensureIndexes(db);

    redis = await initRedis('memory');
  });

  after(async () => {
    await closeNotificationQueue();
    await closeRedis();
    if (mongoClient) {
      await mongoClient.close();
    }
    if (mongod) {
      await mongod.stop();
    }
    if (mockTelegramServer) {
      await new Promise<void>((resolve) => {
        mockTelegramServer.close(() => resolve());
      });
    }
  });

  beforeEach(async () => {
    capturedRequests = [];
    responseDelayMs = 0;
    shouldFailRequests = false;
    failureStatusCode = 500;
    failAttemptLimit = 0;
    requestAttemptCount = 0;
    await initNotificationQueue({ redisUrl: 'memory', attempts: 3, backoffDelayMs: 20 });
  });

  it('enqueues notification and returns immediately without blocking on a slow Telegram API', async () => {
    responseDelayMs = 400;

    const start = Date.now();
    const result = await enqueueTelegramNotification({
      chatId: 987654321,
      text: 'Test slow response message',
    });
    const elapsed = Date.now() - start;

    assert.ok(result.id);
    assert.ok(elapsed < 100, `Enqueue took ${elapsed}ms, should be non-blocking (<100ms)`);
    assert.equal(capturedRequests.length, 0);

    await drainNotificationQueue();
    assert.equal(capturedRequests.length, 1);
    assert.equal(capturedRequests[0].chatId, 987654321);
    assert.equal(capturedRequests[0].text, 'Test slow response message');
  });

  it('retries failing notification up to configured attempts with backoff and drops upon exhaustion', async () => {
    shouldFailRequests = true;
    failureStatusCode = 500;

    const stderrLogs: string[] = [];
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrLogs.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;

    try {
      await enqueueTelegramNotification({
        chatId: 555123456,
        text: 'Message that will fail',
      });

      await drainNotificationQueue();

      assert.equal(requestAttemptCount, 3);
      assert.equal(capturedRequests.length, 3);

      const retryInterval1 = capturedRequests[1].timestamp - capturedRequests[0].timestamp;
      const retryInterval2 = capturedRequests[2].timestamp - capturedRequests[1].timestamp;

      assert.ok(retryInterval1 >= 15, `First backoff interval should be >=15ms, was ${retryInterval1}ms`);
      assert.ok(retryInterval2 >= 30, `Second backoff interval should be >=30ms, was ${retryInterval2}ms`);

      const permanentLog = stderrLogs.find((log) =>
        log.includes('failed permanently') && log.includes('555123456') && log.includes('3 attempts'),
      );
      assert.ok(permanentLog, 'Should log permanent failure message with attempts count to stderr');

      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.equal(requestAttemptCount, 3);
    } finally {
      process.stderr.write = originalStderrWrite;
    }
  });

  it('completes finishRun gameplay request even when Telegram notification fails completely', async () => {
    shouldFailRequests = true;
    failureStatusCode = 500;

    const challengerId = 88001;
    const opponentId = 88002;

    await db.collection('profiles').insertMany([
      {
        telegramUserId: challengerId,
        username: 'challenger_user',
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
      },
      {
        telegramUserId: opponentId,
        username: 'opponent_user',
        firstName: 'Opponent',
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
      },
    ]);

    const challenge = await createChallenge(challengerId, db);
    const challengerRun = await db.collection('runs').findOne({ runId: challenge.runId });
    assert.ok(challengerRun);

    for (let i = 0; i < 3; i++) {
      await submitAnswer(challenge.runId, challengerId, i, challengerRun.flags[i].isoCode, db);
    }
    await finishRun(challenge.runId, challengerId, db, redis);

    const opponentRunData = await acceptChallenge(challenge.challengeId, opponentId, db);

    for (let i = 0; i < 2; i++) {
      await submitAnswer(opponentRunData.runId, opponentId, i, opponentRunData.flags[i].isoCode, db);
    }

    const finishStart = Date.now();
    const opponentFinishResult = await finishRun(opponentRunData.runId, opponentId, db, redis);
    const finishElapsed = Date.now() - finishStart;

    assert.ok(opponentFinishResult);
    assert.ok(opponentFinishResult.totalScore > 0);
    assert.ok(finishElapsed < 200, `finishRun should return promptly without waiting on retries, took ${finishElapsed}ms`);

    const updatedChallenge = await db.collection('challenges').findOne({ challengeId: challenge.challengeId });
    assert.ok(updatedChallenge);
    assert.equal(updatedChallenge.status, 'completed');
    assert.equal(updatedChallenge.winner, 'challenger');

    await drainNotificationQueue();
  });
});
