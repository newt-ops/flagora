import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import http from 'node:http';
import { handleTelegramUpdate } from './botUpdateHandler.js';
import { initReferralCollection } from '../referral/referralService.js';

describe('Telegram Bot Update Handler', () => {
  let mongod: MongoMemoryServer;
  let mongoClient: MongoClient;
  let db: Db;
  let mockServer: http.Server;
  let mockServerUrl: string;
  let receivedRequests: Array<{ url?: string; body?: any }> = [];

  before(async () => {
    mongod = await MongoMemoryServer.create();
    mongoClient = new MongoClient(mongod.getUri());
    await mongoClient.connect();
    db = mongoClient.db('flagora_test_bot');
    await initReferralCollection(db);

    await new Promise<void>((resolve) => {
      mockServer = http.createServer((req, res) => {
        let bodyStr = '';
        req.on('data', (chunk) => {
          bodyStr += chunk;
        });
        req.on('end', () => {
          let parsedBody = {};
          try {
            parsedBody = JSON.parse(bodyStr);
          } catch {
            // ignore
          }
          receivedRequests.push({ url: req.url, body: parsedBody });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, result: true }));
        });
      });
      mockServer.listen(0, () => {
        const addr = mockServer.address() as { port: number };
        mockServerUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    mockServer.close();
    await mongoClient.close();
    await mongod.stop();
  });

  beforeEach(() => {
    receivedRequests = [];
  });

  it('handles /start command and sends welcome message with inline keyboard', async () => {
    const update = {
      update_id: 101,
      message: {
        message_id: 1,
        from: { id: 777, first_name: 'Alex' },
        chat: { id: 777, type: 'private' },
        text: '/start',
      },
    };

    const res = await handleTelegramUpdate(update, db, {
      botToken: 'mock-bot-token',
      apiBaseUrl: mockServerUrl,
      frontendUrl: 'https://test-flagora.app',
    });

    assert.equal(res.handled, true);
    assert.equal(res.action, 'command_start');
    assert.equal(receivedRequests.length, 1);
    assert.ok(receivedRequests[0].url?.includes('/sendMessage'));
    assert.equal(receivedRequests[0].body.chat_id, 777);
    assert.ok(receivedRequests[0].body.text.includes('Welcome to Flagora'));
    assert.ok(Array.isArray(receivedRequests[0].body.reply_markup.inline_keyboard));
  });

  it('normalizes command when username is appended (/start@FlagoraBot)', async () => {
    const update = {
      update_id: 102,
      message: {
        message_id: 2,
        from: { id: 888, first_name: 'Elena' },
        chat: { id: 888, type: 'private' },
        text: '/start@FlagoraBot',
      },
    };

    const res = await handleTelegramUpdate(update, db, {
      botToken: 'mock-bot-token',
      apiBaseUrl: mockServerUrl,
    });

    assert.equal(res.handled, true);
    assert.equal(res.action, 'command_start');
    assert.equal(receivedRequests.length, 1);
    assert.equal(receivedRequests[0].body.chat_id, 888);
  });

  it('registers referral on /start ref_<id>', async () => {
    const update = {
      update_id: 103,
      message: {
        message_id: 3,
        from: { id: 999, first_name: 'Charlie' },
        chat: { id: 999, type: 'private' },
        text: '/start ref_555',
      },
    };

    const res = await handleTelegramUpdate(update, db, {
      botToken: 'mock-bot-token',
      apiBaseUrl: mockServerUrl,
    });

    assert.equal(res.handled, true);
    assert.equal(res.action, 'command_start');

    const referralDoc = await db.collection('referrals').findOne({ newPlayerTelegramUserId: 999 });
    assert.ok(referralDoc);
    assert.equal(referralDoc.inviterTelegramUserId, 555);
  });

  it('handles /help, /play, /stats, /leaderboard, /invite commands', async () => {
    const commands = ['/help', '/play', '/stats', '/leaderboard', '/invite'];
    for (const cmd of commands) {
      const update = {
        update_id: 200,
        message: {
          message_id: 10,
          from: { id: 111, first_name: 'User' },
          chat: { id: 111, type: 'private' },
          text: cmd,
        },
      };

      const res = await handleTelegramUpdate(update, db, {
        botToken: 'mock-bot-token',
        apiBaseUrl: mockServerUrl,
      });

      assert.equal(res.handled, true);
      assert.equal(res.action, `command_${cmd.replace('/', '')}`);
    }
  });

  it('handles callback query navigation', async () => {
    const update = {
      update_id: 301,
      callback_query: {
        id: 'cb_query_999',
        data: 'menu_help',
        message: {
          message_id: 42,
          chat: { id: 777 },
        },
        from: { id: 777, first_name: 'Alex' },
      },
    };

    const res = await handleTelegramUpdate(update, db, {
      botToken: 'mock-bot-token',
      apiBaseUrl: mockServerUrl,
    });

    assert.equal(res.handled, true);
    assert.equal(res.action, 'callback_query_menu_help');
    // answers callback query and edits message
    const editReq = receivedRequests.find((r) => r.url?.includes('/editMessageText'));
    assert.ok(editReq);
    assert.ok(editReq.body.text.includes('How to Play'));
  });

  it('handles pre_checkout_query approval for Stars', async () => {
    const update = {
      update_id: 401,
      pre_checkout_query: {
        id: 'pcq_123',
        currency: 'XTR',
        invoice_payload: 'pro_sub_30d',
      },
    };

    const res = await handleTelegramUpdate(update, db, {
      botToken: 'mock-bot-token',
      apiBaseUrl: mockServerUrl,
    });

    assert.equal(res.handled, true);
    assert.equal(res.action, 'pre_checkout_query');
    const answerReq = receivedRequests.find((r) => r.url?.includes('/answerPreCheckoutQuery'));
    assert.ok(answerReq);
    assert.equal(answerReq.body.ok, true);
  });
});
