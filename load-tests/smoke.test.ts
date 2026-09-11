import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import RedisMock from 'ioredis-mock';
import type { Redis as RedisClient } from 'ioredis';
import { initSocketServer } from '../apps/server/src/multiplayer/socketServer.js';
import { createRequireSessionMiddleware } from '../apps/server/src/session/requireSession.js';
import { createSessionToken } from '../apps/server/src/session/tokens.js';
import { createRun, submitAnswer, finishRun } from '../apps/server/src/game/runService.js';
import { seedFlags } from '../apps/server/src/game/seedFlags.js';
import { initFlagCache } from '../apps/server/src/game/flagCache.js';
import { createBattle, joinBattle } from '../apps/server/src/battle/battleService.js';
import { rateLimit } from '../apps/server/src/middleware/rateLimit.js';

const TEST_SECRET = 'smoke_test_session_secret_32_chars_ok';
const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

describe('k6 Load Testing Scripts Smoke Test', () => {
  let mongod: MongoMemoryServer;
  let mongoClient: MongoClient;
  let db: Db;
  let redis: RedisClient;
  let httpServer: http.Server;
  let baseUrl: string;
  let k6Path = 'k6';

  function runK6(script: string, extraArgs: string[] = []): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const args = ['run', ...extraArgs, script];
      const proc = spawn(k6Path, args, {
        cwd: repoRoot,
        env: {
          ...process.env,
          TARGET_URL: baseUrl,
          SESSION_SECRET: TEST_SECRET,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        resolve({ stdout, stderr, exitCode: code ?? 0 });
      });
    });
  }

  before(async () => {
    try {
      execSync('k6 version', { stdio: 'pipe' });
      k6Path = 'k6';
    } catch {
      k6Path = 'C:\\Program Files\\k6\\k6.exe';
    }

    mongod = await MongoMemoryServer.create();
    mongoClient = new MongoClient(mongod.getUri());
    await mongoClient.connect();
    db = mongoClient.db('smoke-load-test');

    await seedFlags(db);
    await initFlagCache(db);

    redis = new RedisMock() as unknown as RedisClient;

    const app = express();
    app.use(express.json());

    const sessionMiddleware = createRequireSessionMiddleware(TEST_SECRET);

    httpServer = http.createServer(app);
    const io = initSocketServer(httpServer, TEST_SECRET, db, { redis, countdownDelayMs: 20 });

    app.post('/api/runs/start', sessionMiddleware, rateLimit({ endpoint: 'run_start', limit: 500, windowSeconds: 60 }), async (req, res) => {
      try {
        const userId = (req as unknown as { sessionUser?: { telegramUserId: number } }).sessionUser?.telegramUserId || 100001;
        const run = await createRun(userId, db);
        res.status(200).json(run);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error';
        res.status(500).json({ error: message });
      }
    });

    app.post('/api/runs/:id/answer', sessionMiddleware, rateLimit({ endpoint: 'run_answer', limit: 1000, windowSeconds: 60 }), async (req, res) => {
      try {
        const userId = (req as unknown as { sessionUser?: { telegramUserId: number } }).sessionUser?.telegramUserId || 100001;
        const id = String(req.params.id);
        const { flagIndex, selectedIsoCode } = req.body;
        const result = await submitAnswer(id, userId, flagIndex, selectedIsoCode, db);
        res.status(200).json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error';
        res.status(500).json({ error: message });
      }
    });

    app.post('/api/runs/:id/finish', sessionMiddleware, rateLimit({ endpoint: 'run_finish', limit: 500, windowSeconds: 60 }), async (req, res) => {
      try {
        const userId = (req as unknown as { sessionUser?: { telegramUserId: number } }).sessionUser?.telegramUserId || 100001;
        const id = String(req.params.id);
        const result = await finishRun(id, userId, db, redis, io);
        res.status(200).json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error';
        res.status(500).json({ error: message });
      }
    });

    app.get('/api/leaderboard/top', async (_req, res) => {
      res.status(200).json([]);
    });

    app.get('/api/leaderboard/me', sessionMiddleware, async (req, res) => {
      const userId = (req as unknown as { sessionUser?: { telegramUserId: number } }).sessionUser?.telegramUserId || 100001;
      res.status(200).json({ rank: 1, score: 500, telegramUserId: userId });
    });

    app.get('/api/daily/leaderboard', async (_req, res) => {
      res.status(200).json({ entries: [], totalPlayers: 0, date: '2026-09-12' });
    });

    app.get('/api/daily/status', sessionMiddleware, async (_req, res) => {
      res.status(200).json({ attempted: false });
    });

    app.post('/api/rewards/bonus-coins/intent', sessionMiddleware, rateLimit({ endpoint: 'reward_intent', limit: 10, windowSeconds: 60 }), async (req, res) => {
      const userId = (req as unknown as { sessionUser?: { telegramUserId: number } }).sessionUser?.telegramUserId || 100001;
      res.status(200).json({ ok: true, token: createSessionToken(userId, TEST_SECRET), dailyCap: 5, usedCount: 1 });
    });

    app.post('/api/rewards/bonus-coins/redeem', sessionMiddleware, rateLimit({ endpoint: 'reward_redeem', limit: 10, windowSeconds: 60 }), async (_req, res) => {
      res.status(200).json({ ok: true, coinsAwarded: 50 });
    });

    app.get('/api/streak/status', sessionMiddleware, async (_req, res) => {
      res.status(200).json({ isAtRisk: false, currentStreak: 3 });
    });

    app.post('/api/rewards/streak-save/intent', sessionMiddleware, rateLimit({ endpoint: 'reward_intent', limit: 10, windowSeconds: 60 }), async (req, res) => {
      const userId = (req as unknown as { sessionUser?: { telegramUserId: number } }).sessionUser?.telegramUserId || 100001;
      res.status(200).json({ ok: true, token: createSessionToken(userId, TEST_SECRET), dailyCap: 1, usedCount: 0 });
    });

    app.post('/api/battles', sessionMiddleware, rateLimit({ endpoint: 'battle_create', limit: 500, windowSeconds: 60 }), async (req: Request, res) => {
      try {
        const userId = (req as unknown as { sessionUser?: { telegramUserId: number } }).sessionUser?.telegramUserId || 100001;
        const battle = await createBattle(userId, db);
        res.status(200).json(battle);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error';
        res.status(500).json({ error: message });
      }
    });

    app.post('/api/battles/:id/join', sessionMiddleware, rateLimit({ endpoint: 'battle_join', limit: 500, windowSeconds: 60 }), async (req: Request, res) => {
      try {
        const userId = (req as unknown as { sessionUser?: { telegramUserId: number } }).sessionUser?.telegramUserId || 100002;
        const id = String(req.params.id);
        const result = await joinBattle(id, userId, db, io, redis);
        res.status(200).json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error';
        res.status(500).json({ error: message });
      }
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const address = httpServer.address();
        if (typeof address === 'object' && address) {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
    if (mongoClient) {
      await mongoClient.close();
    }
    if (mongod) {
      await mongod.stop();
    }
  });

  it('executes leaderboard read load test script successfully with k6', async () => {
    const result = await runK6('load-tests/leaderboards.js', ['--vus', '2', '--duration', '2s']);
    assert.strictEqual(result.exitCode, 0, result.stderr);
    assert.ok(result.stdout.includes('http_req_duration'));
    assert.ok(result.stdout.includes('http_req_failed'));
  });

  it('executes reward flow load test script successfully with k6', async () => {
    const result = await runK6('load-tests/reward-flow.js', ['--vus', '2', '--duration', '2s']);
    assert.strictEqual(result.exitCode, 0, result.stderr);
    assert.ok(result.stdout.includes('http_req_duration'));
    assert.ok(result.stdout.includes('reward_intent') || result.stdout.includes('http_reqs'));
  });

  it('executes gameplay loop load test script successfully with k6', async () => {
    const result = await runK6('load-tests/gameplay-loop.js', ['--vus', '1', '--duration', '2s']);
    assert.strictEqual(result.exitCode, 0, result.stderr);
    assert.ok(result.stdout.includes('http_req_duration'));
    assert.ok(result.stdout.includes('run_start') || result.stdout.includes('http_reqs'));
  });

  it('executes battles websocket load test script successfully with k6', async () => {
    const result = await runK6('load-tests/battles.js', ['--vus', '1', '--iterations', '1']);
    assert.strictEqual(result.exitCode, 0, result.stderr);
    assert.ok(result.stdout.includes('ws_connecting') || result.stdout.includes('iterations'));
  });
});
