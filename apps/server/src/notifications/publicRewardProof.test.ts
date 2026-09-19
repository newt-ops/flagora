import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Db } from 'mongodb';
import type { Redis as RedisClient } from 'ioredis';
import type { PlayerProfile } from '@flagora/shared';
import { initRedis, closeRedis } from '../db/redis.js';
import {
  initNotificationQueue,
  closeNotificationQueue,
  type TelegramNotificationJobData,
} from './notificationQueue.js';
import {
  notifyPublicRewardPayout,
} from '../telegram/telegramService.js';
import {
  requestBonusPinsIntent,
  redeemBonusPins,
  requestStreakSaveIntent,
  redeemStreakSave,
  RewardTokenAlreadyRedeemedError,
} from '../rewards/index.js';

describe('Phase 11 Prompt 02: Public Reward-Payout Proof', () => {
  let db: Db;
  let redis: RedisClient;
  const profilesMap = new Map<number, PlayerProfile>();
  const rewardSecret = 'test-secret-public-reward-proof-key';
  const testChannelId = '@flagora_test_payouts';

  const originalFetch = globalThis.fetch;
  const originalChannelId = process.env.PUBLIC_REWARD_CHANNEL_ID;
  const sentMessages: TelegramNotificationJobData[] = [];

  function createMockDb(): Db {
    const mockCollection = {
      createIndex: async () => 'telegramUserId_1',
      deleteMany: async () => {
        profilesMap.clear();
        return { deletedCount: 0 };
      },
      insertOne: async (doc: PlayerProfile) => {
        profilesMap.set(doc.telegramUserId, { ...doc });
        return { insertedId: doc.telegramUserId };
      },
      findOne: async (query: { telegramUserId: number }) => {
        const found = profilesMap.get(query.telegramUserId);
        return found ? { ...found } : null;
      },
      updateOne: async (
        filter: { telegramUserId: number },
        update: { $set?: Record<string, unknown> },
      ) => {
        const existing = profilesMap.get(filter.telegramUserId);
        if (!existing) {
          return { matchedCount: 0, modifiedCount: 0 };
        }
        const updated = { ...existing };
        if (update.$set) {
          Object.assign(updated, update.$set);
        }
        profilesMap.set(filter.telegramUserId, updated);
        return { matchedCount: 1, modifiedCount: 1 };
      },
      findOneAndUpdate: async (
        filter: { telegramUserId: number },
        update: { $inc?: { pins?: number }; $set?: Record<string, unknown> },
      ) => {
        const existing = profilesMap.get(filter.telegramUserId);
        if (!existing) {
          return null;
        }
        const updated = { ...existing };
        if (update.$inc?.pins) {
          updated.pins = (updated.pins || 0) + update.$inc.pins;
        }
        if (update.$set) {
          Object.assign(updated, update.$set);
        }
        profilesMap.set(filter.telegramUserId, updated);
        return updated;
      },
    };

    return {
      collection: (name: string) => {
        if (name === 'profiles') {
          return mockCollection as unknown;
        }
        throw new Error(`Unexpected collection: ${name}`);
      },
    } as unknown as Db;
  }

  before(async () => {
    process.env.REWARD_TOKEN_SECRET = rewardSecret;
    process.env.TELEGRAM_BOT_TOKEN = 'mock-bot-token-12345';
    process.env.PUBLIC_REWARD_CHANNEL_ID = testChannelId;
    redis = await initRedis('memory');
    db = createMockDb();
    await initNotificationQueue({ redisUrl: 'memory' });

    globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      let bodyData: unknown;
      if (init?.body && typeof init.body === 'string') {
        try {
          bodyData = JSON.parse(init.body);
        } catch {
          bodyData = init.body;
        }
      }
      if (bodyData && typeof bodyData === 'object') {
        const payload = bodyData as Record<string, unknown>;
        if (payload.chat_id) {
          sentMessages.push({
            chatId: payload.chat_id as string | number,
            text: String(payload.text || ''),
          });
        }
      }
      return new Response(JSON.stringify({ ok: true, result: { message_id: 999 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
  });

  after(async () => {
    globalThis.fetch = originalFetch;
    if (originalChannelId !== undefined) {
      process.env.PUBLIC_REWARD_CHANNEL_ID = originalChannelId;
    } else {
      delete process.env.PUBLIC_REWARD_CHANNEL_ID;
    }
    await closeNotificationQueue();
    await closeRedis();
  });

  beforeEach(async () => {
    profilesMap.clear();
    sentMessages.length = 0;
    const keys = await redis.keys('reward:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    profilesMap.set(3001, {
      telegramUserId: 3001,
      firstName: 'Bob',
      pins: 200,
      xp: 0,
      level: 1,
      currentStreak: 4,
      longestStreak: 4,
      gamesPlayed: 10,
      bestScore: 400,
      lastPlayedDate: '2026-09-10',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('notifyPublicRewardPayout sends anonymized confirmation without user details', async () => {
    await notifyPublicRewardPayout('bonus-pins', { channelId: testChannelId });
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(sentMessages.length, 1);
    const msg = sentMessages[0];
    assert.equal(msg.chatId, testChannelId);
    assert.ok(msg.text.includes('50 bonus pins'));
    assert.ok(!msg.text.includes('3001'));
    assert.ok(!msg.text.includes('Bob'));
  });

  it('notifyPublicRewardPayout for streak-save contains streak confirmation text', async () => {
    await notifyPublicRewardPayout('streak-save', { channelId: testChannelId });
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(sentMessages.length, 1);
    const msg = sentMessages[0];
    assert.equal(msg.chatId, testChannelId);
    assert.ok(msg.text.includes('rescued their daily streak'));
    assert.ok(!msg.text.includes('3001'));
  });

  it('notifyPublicRewardPayout gracefully skips when channel is not configured', async () => {
    delete process.env.PUBLIC_REWARD_CHANNEL_ID;
    delete process.env.REWARD_CONFIRMATION_CHANNEL_ID;

    await notifyPublicRewardPayout('bonus-pins');
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(sentMessages.length, 0);

    process.env.PUBLIC_REWARD_CHANNEL_ID = testChannelId;
  });

  it('redeemBonusPins triggers exactly one public notification on success', async () => {
    const userId = 3001;
    const intent = await requestBonusPinsIntent(userId, { redis, secret: rewardSecret });
    assert.ok(intent.token);

    const result = await redeemBonusPins(intent.token, userId, db, {
      redis,
      secret: rewardSecret,
    });
    assert.equal(result.ok, true);
    assert.equal(result.pins, 250);

    await new Promise((r) => setTimeout(r, 50));

    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0].chatId, testChannelId);
    assert.ok(sentMessages[0].text.includes('50 bonus pins'));
  });

  it('redeemStreakSave triggers exactly one public notification on success', async () => {
    const userId = 3001;
    const testNow = new Date('2026-09-15T12:00:00Z');
    const intent = await requestStreakSaveIntent(userId, db, {
      redis,
      secret: rewardSecret,
      now: testNow,
    });
    assert.ok(intent.token);

    const result = await redeemStreakSave(intent.token, userId, db, {
      redis,
      secret: rewardSecret,
      now: testNow,
    });
    assert.equal(result.ok, true);
    assert.equal(result.saved, true);

    await new Promise((r) => setTimeout(r, 50));

    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0].chatId, testChannelId);
    assert.ok(sentMessages[0].text.includes('rescued their daily streak'));
  });

  it('replay redemption throws and does not enqueue duplicate public notification', async () => {
    const userId = 3001;
    const intent = await requestBonusPinsIntent(userId, { redis, secret: rewardSecret });
    assert.ok(intent.token);

    await redeemBonusPins(intent.token, userId, db, { redis, secret: rewardSecret });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(sentMessages.length, 1);

    await assert.rejects(
      async () => {
        await redeemBonusPins(intent.token, userId, db, { redis, secret: rewardSecret });
      },
      (err) => err instanceof RewardTokenAlreadyRedeemedError,
    );

    await new Promise((r) => setTimeout(r, 50));
    assert.equal(sentMessages.length, 1);
  });
});
