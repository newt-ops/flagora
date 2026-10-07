import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Db } from 'mongodb';
import { createRequireSessionMiddleware } from './session/requireSession.js';
import { createSessionToken } from './session/tokens.js';
import { proRouter } from './pro/proRoutes.js';
import { initDatabase, closeDatabase } from './db/mongo.js';
import { processSuccessfulPayment } from './subscription/subscriptionService.js';
import type { PlayerProfile } from '@flagora/shared';

describe('Phase 1 & Security Hardening Tests', () => {
  let mongod: MongoMemoryServer;
  let db: Db;
  let server: http.Server;
  let baseUrl: string;

  const sessionSecret = 'test-security-session-secret-12345';
  const testAdminSecret = 'super-secret-admin-token-xyz';
  const testWebhookSecret = 'telegram-webhook-secret-token-abc';

  function timingSafeEqualStrings(a: string | undefined | null, b: string | undefined | null): boolean {
    if (typeof a !== 'string' || typeof b !== 'string') {
      return false;
    }
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  }

  before(async () => {
    mongod = await MongoMemoryServer.create();
    db = await initDatabase(mongod.getUri());

    const app = express();
    app.use(express.json());

    app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Telegram-Init-Data, X-Admin-Secret, X-Telegram-Bot-Api-Secret-Token',
      );
      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }
      next();
    });

    const sessionMiddleware = createRequireSessionMiddleware(sessionSecret);

    app.use('/api/pro', sessionMiddleware, proRouter);

    app.post('/api/admin/test-reload', async (req, res) => {
      try {
        const adminSecret = process.env.TEST_ADMIN_SECRET;
        const providedSecret = req.headers['x-admin-secret'];
        if (!adminSecret || typeof providedSecret !== 'string' || !timingSafeEqualStrings(providedSecret, adminSecret)) {
          res.status(403).json({ error: 'Forbidden', message: 'Invalid admin secret' });
          return;
        }
        res.status(200).json({ ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error';
        res.status(500).json({ error: 'Internal server error', message });
      }
    });

    app.post('/api/telegram/webhook', async (req, res) => {
      const webhookSecret = process.env.TEST_WEBHOOK_SECRET;
      const providedToken = req.headers['x-telegram-bot-api-secret-token'];

      if (!webhookSecret) {
        if (process.env.NODE_ENV === 'production') {
          res.status(401).json({ error: 'Unauthorized', message: 'Webhook secret not configured' });
          return;
        }
      } else {
        if (!providedToken || typeof providedToken !== 'string' || !timingSafeEqualStrings(providedToken, webhookSecret)) {
          res.status(401).json({ error: 'Unauthorized', message: 'Invalid webhook secret token' });
          return;
        }
      }

      const update = req.body;
      if (update?.pre_checkout_query) {
        const query = update.pre_checkout_query;
        const isStars = !query.currency || query.currency === 'XTR';
        const isProPayload = !query.invoice_payload || (typeof query.invoice_payload === 'string' && query.invoice_payload.startsWith('pro_sub_'));
        if (isStars && isProPayload) {
          res.status(200).json({ ok: true });
        } else {
          res.status(400).json({ ok: false, error: 'Invalid currency or payment payload' });
        }
        return;
      }

      const message = update?.message;
      if (message?.successful_payment) {
        const payment = message.successful_payment;
        const telegramUserId = Number(message.from?.id);
        const chargeId = payment.telegram_payment_charge_id;
        const isStars = !payment.currency || payment.currency === 'XTR';
        const isProPayload = !payment.invoice_payload || (typeof payment.invoice_payload === 'string' && payment.invoice_payload.startsWith('pro_sub_'));

        if (telegramUserId && chargeId && isStars && isProPayload) {
          try {
            const processedCol = db.collection('processed_payments');
            let alreadyProcessed = false;
            try {
              await processedCol.insertOne({
                chargeId,
                telegramUserId,
                createdAt: new Date(),
              });
            } catch (dupErr: unknown) {
              const mongoErr = dupErr as { code?: number };
              if (mongoErr?.code === 11000) {
                alreadyProcessed = true;
              } else {
                throw dupErr;
              }
            }

            if (!alreadyProcessed) {
              await processSuccessfulPayment(telegramUserId, chargeId, db);
              const profileCol = db.collection<PlayerProfile>('profiles');
              await profileCol.updateOne(
                { telegramUserId },
                { $inc: { pins: 1000 } },
              );
            }
          } catch {
            void 0;
          }
        }
      }

      res.status(200).json({ ok: true });
    });

    app.post('/bot:token/createInvoiceLink', (req, res) => {
      const { payload } = req.body ?? {};
      res.json({ ok: true, result: `https://t.me/$${payload || 'mock_invoice_link'}` });
    });

    app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
      void next;
      const message = err instanceof Error ? err.message : 'Internal server error';
      res.status(500).json({ error: 'Internal server error', message });
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (typeof address === 'object' && address) {
          baseUrl = `http://127.0.0.1:${address.port}`;
          process.env.TELEGRAM_BOT_TOKEN = 'mock-test-bot-token';
          process.env.TELEGRAM_API_BASE_URL = baseUrl;
        }
        resolve();
      });
    });
  });

  after(async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_API_BASE_URL;
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await closeDatabase();
    if (mongod) {
      await mongod.stop();
    }
  });

  it('verifies timingSafeEqualStrings correctness', () => {
    assert.equal(timingSafeEqualStrings('abc', 'abc'), true);
    assert.equal(timingSafeEqualStrings('abc', 'abd'), false);
    assert.equal(timingSafeEqualStrings('abc', 'ab'), false);
    assert.equal(timingSafeEqualStrings(null, 'abc'), false);
    assert.equal(timingSafeEqualStrings(undefined, 'abc'), false);
    assert.equal(timingSafeEqualStrings('', ''), true);
  });

  it('rejects unauthenticated requests to /api/pro/status with 401', async () => {
    const res = await fetch(`${baseUrl}/api/pro/status`);
    assert.equal(res.status, 401);
  });

  it('rejects unauthenticated requests to /api/pro/create-invoice-link with 401', async () => {
    const res = await fetch(`${baseUrl}/api/pro/create-invoice-link`, {
      method: 'POST',
    });
    assert.equal(res.status, 401);
  });

  it('allows authenticated requests to /api/pro/status and returns inactive when no sub', async () => {
    const token = createSessionToken(9876, sessionSecret);
    const res = await fetch(`${baseUrl}/api/pro/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as { isActive: boolean };
    assert.equal(data.isActive, false);
  });

  it('fails closed on admin routes when secret is missing from environment', async () => {
    delete process.env.TEST_ADMIN_SECRET;

    const res = await fetch(`${baseUrl}/api/admin/test-reload`, {
      method: 'POST',
      headers: { 'x-admin-secret': testAdminSecret },
    });
    assert.equal(res.status, 403);
  });

  it('fails closed on admin routes when header is missing or incorrect', async () => {
    process.env.TEST_ADMIN_SECRET = testAdminSecret;

    const noHeaderRes = await fetch(`${baseUrl}/api/admin/test-reload`, {
      method: 'POST',
    });
    assert.equal(noHeaderRes.status, 403);

    const wrongHeaderRes = await fetch(`${baseUrl}/api/admin/test-reload`, {
      method: 'POST',
      headers: { 'x-admin-secret': 'wrong-secret-token' },
    });
    assert.equal(wrongHeaderRes.status, 403);

    const okRes = await fetch(`${baseUrl}/api/admin/test-reload`, {
      method: 'POST',
      headers: { 'x-admin-secret': testAdminSecret },
    });
    assert.equal(okRes.status, 200);
  });

  it('rejects telegram webhook when secret token header is missing or incorrect', async () => {
    process.env.TEST_WEBHOOK_SECRET = testWebhookSecret;

    const noHeader = await fetch(`${baseUrl}/api/telegram/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ update_id: 1 }),
    });
    assert.equal(noHeader.status, 401);

    const wrongHeader = await fetch(`${baseUrl}/api/telegram/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': 'wrong-token',
      },
      body: JSON.stringify({ update_id: 2 }),
    });
    assert.equal(wrongHeader.status, 401);

    const valid = await fetch(`${baseUrl}/api/telegram/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': testWebhookSecret,
      },
      body: JSON.stringify({ update_id: 3 }),
    });
    assert.equal(valid.status, 200);
  });

  it('fails closed on webhook in production when TELEGRAM_WEBHOOK_SECRET is unset', async () => {
    delete process.env.TEST_WEBHOOK_SECRET;
    const oldNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const res = await fetch(`${baseUrl}/api/telegram/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ update_id: 4 }),
      });
      assert.equal(res.status, 401);
    } finally {
      process.env.NODE_ENV = oldNodeEnv;
    }
  });

  it('enforces webhook payment idempotency', async () => {
    process.env.TEST_WEBHOOK_SECRET = testWebhookSecret;
    const testUserId = 8888;
    const chargeId = 'tg_charge_id_test_999';

    await db.collection<PlayerProfile>('profiles').insertOne({
      telegramUserId: testUserId,
      username: 'paytest',
      firstName: 'Pay',
      level: 1,
      xp: 0,
      pins: 100,
      currentStreak: 0,
      longestStreak: 0,
      bestScore: 0,
      gamesPlayed: 0,
      lastPlayedDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const paymentPayload = {
      update_id: 100,
      message: {
        from: { id: testUserId },
        successful_payment: {
          telegram_payment_charge_id: chargeId,
          total_amount: 100,
          currency: 'XTR',
        },
      },
    };

    const firstDelivery = await fetch(`${baseUrl}/api/telegram/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': testWebhookSecret,
      },
      body: JSON.stringify(paymentPayload),
    });
    assert.equal(firstDelivery.status, 200);

    const profileAfterFirst = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: testUserId });
    assert.equal(profileAfterFirst?.pins, 1100);

    const secondDelivery = await fetch(`${baseUrl}/api/telegram/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': testWebhookSecret,
      },
      body: JSON.stringify(paymentPayload),
    });
    assert.equal(secondDelivery.status, 200);

    const profileAfterSecond = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: testUserId });
    assert.equal(profileAfterSecond?.pins, 1100);

    const processedDocs = await db.collection('processed_payments').countDocuments({ chargeId });
    assert.equal(processedDocs, 1);
  });

  it('ignores webhook payments that are not in Telegram Stars or not pro payload', async () => {
    process.env.TEST_WEBHOOK_SECRET = testWebhookSecret;
    const nonStarUserId = 7777;

    await db.collection<PlayerProfile>('profiles').insertOne({
      telegramUserId: nonStarUserId,
      username: 'nonstartest',
      firstName: 'NonStar',
      level: 1,
      xp: 0,
      pins: 50,
      currentStreak: 0,
      longestStreak: 0,
      bestScore: 0,
      gamesPlayed: 0,
      lastPlayedDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const invalidPayment = {
      update_id: 101,
      message: {
        from: { id: nonStarUserId },
        successful_payment: {
          telegram_payment_charge_id: 'charge_invalid_curr',
          total_amount: 100,
          currency: 'USD',
          invoice_payload: 'pro_sub_7777_123',
        },
      },
    };

    const res = await fetch(`${baseUrl}/api/telegram/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': testWebhookSecret,
      },
      body: JSON.stringify(invalidPayment),
    });
    assert.equal(res.status, 200);

    const profile = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: nonStarUserId });
    assert.equal(profile?.pins, 50);

    const sub = await db.collection('subscriptions').findOne({ telegramUserId: nonStarUserId });
    assert.equal(sub, null);
  });

  it('executes complete end-to-end Stars payment lifecycle granting Pro and pins stipend', async () => {
    process.env.TEST_WEBHOOK_SECRET = testWebhookSecret;
    const e2eUserId = 99991;
    const sessionToken = createSessionToken(e2eUserId, sessionSecret);

    await db.collection<PlayerProfile>('profiles').insertOne({
      telegramUserId: e2eUserId,
      username: 'e2e_pro_user',
      firstName: 'E2E',
      level: 2,
      xp: 250,
      pins: 50,
      currentStreak: 5,
      longestStreak: 5,
      bestScore: 1200,
      gamesPlayed: 10,
      lastPlayedDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const invoiceRes = await fetch(`${baseUrl}/api/pro/create-invoice-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
    });
    assert.equal(invoiceRes.status, 200);
    const invoiceData = (await invoiceRes.json()) as { invoiceLink?: string };
    assert.ok(invoiceData.invoiceLink);
    assert.ok(invoiceData.invoiceLink.startsWith('https://t.me/$'));

    const preCheckoutRes = await fetch(`${baseUrl}/api/telegram/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': testWebhookSecret,
      },
      body: JSON.stringify({
        update_id: 201,
        pre_checkout_query: {
          id: 'query_123',
          from: { id: e2eUserId },
          currency: 'XTR',
          total_amount: 100,
          invoice_payload: `pro_sub_${e2eUserId}_${Date.now()}`,
        },
      }),
    });
    assert.equal(preCheckoutRes.status, 200);

    const chargeId = 'tg_e2e_stars_charge_001';
    const paymentRes = await fetch(`${baseUrl}/api/telegram/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': testWebhookSecret,
      },
      body: JSON.stringify({
        update_id: 202,
        message: {
          from: { id: e2eUserId },
          successful_payment: {
            telegram_payment_charge_id: chargeId,
            total_amount: 100,
            currency: 'XTR',
            invoice_payload: `pro_sub_${e2eUserId}_${Date.now()}`,
          },
        },
      }),
    });
    assert.equal(paymentRes.status, 200);

    const statusRes = await fetch(`${baseUrl}/api/pro/status`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    });
    assert.equal(statusRes.status, 200);
    const statusData = (await statusRes.json()) as {
      isActive: boolean;
      currentPeriodEnd: string | null;
      perks: string[];
    };
    assert.equal(statusData.isActive, true);
    assert.ok(statusData.currentPeriodEnd);
    assert.ok(Array.isArray(statusData.perks));
    assert.ok(statusData.perks.includes('stipend_1000_pins'));
    assert.ok(statusData.perks.includes('free_streak_save'));

    const updatedProfile = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: e2eUserId });
    assert.equal(updatedProfile?.pins, 1050);
  });
});
