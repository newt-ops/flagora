import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import {
  createRequireSessionMiddleware,
  type AuthenticatedSessionRequest,
} from '../session/requireSession.js';
import { createSessionToken } from '../session/tokens.js';
import { createRun, submitAnswer, finishRun } from './runService.js';
import {
  RunNotFoundError,
  UnauthorizedRunAccessError,
  RunAlreadyFinishedError,
  FlagAlreadyAnsweredError,
  TimeExpiredError,
  InvalidFlagIndexError,
  type GameRun,
} from './runTypes.js';

describe('run HTTP endpoints', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  let server: http.Server;
  let baseUrl: string;
  const sessionSecret = 'test-session-secret-for-http-endpoints';

  before(async () => {
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri());
    await client.connect();
    db = client.db('test-http-runs');

    const app = express();
    app.use(express.json());
    const sessionMiddleware = createRequireSessionMiddleware(sessionSecret);

    app.post('/api/runs/start', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
      try {
        const telegramUserId = req.sessionUser?.telegramUserId;
        if (!telegramUserId) {
          res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
          return;
        }
        const run = await createRun(telegramUserId, db);
        res.status(200).json(run);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to start run';
        res.status(500).json({ error: 'Internal server error', message });
      }
    });

    app.post('/api/runs/:id/answer', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
      try {
        const telegramUserId = req.sessionUser?.telegramUserId;
        if (!telegramUserId) {
          res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
          return;
        }
        const id = String(req.params.id);
        const { flagIndex, selectedIsoCode } = req.body;

        if (typeof flagIndex !== 'number' || typeof selectedIsoCode !== 'string') {
          res.status(400).json({
            error: 'Bad request',
            message: 'flagIndex (number) and selectedIsoCode (string) are required',
          });
          return;
        }

        const result = await submitAnswer(id, telegramUserId, flagIndex, selectedIsoCode, db);
        res.status(200).json(result);
      } catch (error) {
        if (error instanceof RunNotFoundError) {
          res.status(404).json({ error: 'Not found', message: error.message });
          return;
        }
        if (error instanceof UnauthorizedRunAccessError) {
          res.status(403).json({ error: 'Forbidden', message: error.message });
          return;
        }
        if (error instanceof TimeExpiredError) {
          res.status(400).json({ error: 'Time expired', message: error.message, timeExpired: true });
          return;
        }
        if (
          error instanceof RunAlreadyFinishedError ||
          error instanceof FlagAlreadyAnsweredError ||
          error instanceof InvalidFlagIndexError
        ) {
          res.status(400).json({ error: 'Bad request', message: error.message });
          return;
        }
        const message = error instanceof Error ? error.message : 'Answer submission failed';
        res.status(500).json({ error: 'Internal server error', message });
      }
    });

    app.post('/api/runs/:id/finish', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
      try {
        const telegramUserId = req.sessionUser?.telegramUserId;
        if (!telegramUserId) {
          res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
          return;
        }
        const id = String(req.params.id);
        const result = await finishRun(id, telegramUserId, db);
        res.status(200).json(result);
      } catch (error) {
        if (error instanceof RunNotFoundError) {
          res.status(404).json({ error: 'Not found', message: error.message });
          return;
        }
        if (error instanceof UnauthorizedRunAccessError) {
          res.status(403).json({ error: 'Forbidden', message: error.message });
          return;
        }
        const message = error instanceof Error ? error.message : 'Failed to finish run';
        res.status(500).json({ error: 'Internal server error', message });
      }
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (typeof address === 'object' && address) {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (client) {
      await client.close();
    }
    if (mongod) {
      await mongod.stop();
    }
  });

  it('rejects unauthenticated requests to start run with 401', async () => {
    const res = await fetch(`${baseUrl}/api/runs/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    assert.equal(res.status, 401);
  });

  it('starts a run successfully with valid session token', async () => {
    const token = createSessionToken(2001, sessionSecret);
    const res = await fetch(`${baseUrl}/api/runs/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.runId);
    assert.equal(body.flags.length, 10);
  });

  it('handles answer submission and returns 400 for already answered flag', async () => {
    const userId = 2002;
    const token = createSessionToken(userId, sessionSecret);
    const startRes = await fetch(`${baseUrl}/api/runs/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    const startBody = await startRes.json();
    const runId = startBody.runId;

    const runDoc = await db.collection<GameRun>('runs').findOne({ runId });
    assert.ok(runDoc);

    const firstAnswer = await fetch(`${baseUrl}/api/runs/${runId}/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        flagIndex: 0,
        selectedIsoCode: runDoc.flags[0].isoCode,
      }),
    });
    assert.equal(firstAnswer.status, 200);
    const firstBody = await firstAnswer.json();
    assert.equal(firstBody.correct, true);

    const duplicateAnswer = await fetch(`${baseUrl}/api/runs/${runId}/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        flagIndex: 0,
        selectedIsoCode: runDoc.flags[0].isoCode,
      }),
    });
    assert.equal(duplicateAnswer.status, 400);
    const duplicateBody = await duplicateAnswer.json();
    assert.equal(duplicateBody.error, 'Bad request');
    assert.equal(duplicateBody.message, 'This flag has already been answered');
  });

  it('returns 403 when answering another user run', async () => {
    const ownerToken = createSessionToken(2003, sessionSecret);
    const otherToken = createSessionToken(2004, sessionSecret);

    const startRes = await fetch(`${baseUrl}/api/runs/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
    });
    const { runId } = await startRes.json();

    const answerRes = await fetch(`${baseUrl}/api/runs/${runId}/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${otherToken}`,
      },
      body: JSON.stringify({
        flagIndex: 0,
        selectedIsoCode: 'FR',
      }),
    });
    assert.equal(answerRes.status, 403);
  });

  it('returns 400 with timeExpired when answering after duration has elapsed', async () => {
    const token = createSessionToken(2005, sessionSecret);
    const startRes = await fetch(`${baseUrl}/api/runs/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    const { runId } = await startRes.json();

    await db.collection<GameRun>('runs').updateOne(
      { runId },
      { $set: { startedAt: new Date(Date.now() - 70_000) } },
    );

    const answerRes = await fetch(`${baseUrl}/api/runs/${runId}/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        flagIndex: 0,
        selectedIsoCode: 'FR',
      }),
    });

    assert.equal(answerRes.status, 400);
    const body = await answerRes.json();
    assert.equal(body.timeExpired, true);
  });

  it('finishes a run and rejects subsequent answers with 400', async () => {
    const token = createSessionToken(2006, sessionSecret);
    const startRes = await fetch(`${baseUrl}/api/runs/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    const { runId } = await startRes.json();

    const finishRes = await fetch(`${baseUrl}/api/runs/${runId}/finish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    assert.equal(finishRes.status, 200);
    const finishBody = await finishRes.json();
    assert.equal(typeof finishBody.totalScore, 'number');

    const subsequentAnswer = await fetch(`${baseUrl}/api/runs/${runId}/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        flagIndex: 0,
        selectedIsoCode: 'FR',
      }),
    });
    assert.equal(subsequentAnswer.status, 400);
  });
});
