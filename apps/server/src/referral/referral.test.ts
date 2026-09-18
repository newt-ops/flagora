import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Db } from 'mongodb';
import type { Redis as RedisClient } from 'ioredis';
import type { PlayerProfile, Referral } from '@flagora/shared';
import type { GameRun } from '../game/runTypes.js';
import { initRedis, closeRedis } from '../db/redis.js';
import {
  initNotificationQueue,
  closeNotificationQueue,
} from '../notifications/notificationQueue.js';
import {
  initReferralCollection,
  registerReferralSignup,
  processReferralOnFirstRun,
  REFERRAL_INVITER_COIN_REWARD,
  REFERRAL_NEW_PLAYER_COIN_REWARD,
  REFERRAL_DAILY_INVITER_CAP,
} from './referralService.js';
import { finishRun } from '../game/runService.js';

describe('Phase 11 Prompt 04: Referral Abuse Hardening', () => {
  let db: Db;
  let redis: RedisClient;
  const profilesMap = new Map<number, PlayerProfile>();
  const referralsMap = new Map<number, Referral>();
  const runsMap = new Map<string, GameRun>();
  const sentNotifications: { chatId: string | number; text: string }[] = [];

  const originalFetch = globalThis.fetch;

  function createMockDb(): Db {
    const mockProfiles = {
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
        filter: { telegramUserId: number; referredBy?: unknown },
        update: {
          $set?: Record<string, unknown>;
          $inc?: { coins?: number; referralCount?: number };
        },
      ) => {
        const existing = profilesMap.get(filter.telegramUserId);
        if (!existing) {
          return { matchedCount: 0, modifiedCount: 0 };
        }
        if (filter.referredBy !== undefined && existing.referredBy !== filter.referredBy) {
          return { matchedCount: 0, modifiedCount: 0 };
        }
        const updated = { ...existing };
        if (update.$set) {
          Object.assign(updated, update.$set);
        }
        if (update.$inc) {
          if (update.$inc.coins) {
            updated.coins = (updated.coins || 0) + update.$inc.coins;
          }
          if (update.$inc.referralCount) {
            updated.referralCount = (updated.referralCount || 0) + update.$inc.referralCount;
          }
        }
        profilesMap.set(filter.telegramUserId, updated);
        return { matchedCount: 1, modifiedCount: 1 };
      },
      findOneAndUpdate: async (
        filter: { telegramUserId: number },
        update: {
          $inc?: Record<string, number>;
          $set?: Record<string, unknown>;
          $max?: Record<string, unknown>;
        },
      ) => {
        const existing = profilesMap.get(filter.telegramUserId);
        if (!existing) {
          return null;
        }
        const updated = { ...existing };
        if (update.$inc) {
          for (const [k, v] of Object.entries(update.$inc)) {
            (updated as unknown as Record<string, number>)[k] =
              ((updated as unknown as Record<string, number>)[k] || 0) + v;
          }
        }
        if (update.$set) {
          Object.assign(updated, update.$set);
        }
        profilesMap.set(filter.telegramUserId, updated);
        return updated;
      },
    };

    const mockReferrals = {
      createIndex: async () => 'index_created',
      deleteMany: async () => {
        referralsMap.clear();
        return { deletedCount: 0 };
      },
      insertOne: async (doc: Referral) => {
        if (referralsMap.has(doc.newPlayerTelegramUserId)) {
          const err = new Error('E11000 duplicate key error collection: referrals index: newPlayerTelegramUserId_1');
          (err as unknown as { code: number }).code = 11000;
          throw err;
        }
        referralsMap.set(doc.newPlayerTelegramUserId, { ...doc });
        return { insertedId: doc.newPlayerTelegramUserId };
      },
      findOne: async (query: { newPlayerTelegramUserId: number; status?: string }) => {
        const found = referralsMap.get(query.newPlayerTelegramUserId);
        if (!found) return null;
        if (query.status && found.status !== query.status) return null;
        return { ...found };
      },
      findOneAndUpdate: async (
        filter: { newPlayerTelegramUserId: number; status: string },
        update: { $set: Partial<Referral> },
      ) => {
        const found = referralsMap.get(filter.newPlayerTelegramUserId);
        if (!found || found.status !== filter.status) {
          return null;
        }
        const updated = { ...found, ...update.$set };
        referralsMap.set(filter.newPlayerTelegramUserId, updated);
        return updated;
      },
    };

    const mockRuns = {
      findOne: async (query: { runId: string }) => {
        const found = runsMap.get(query.runId);
        return found ? { ...found } : null;
      },
      findOneAndUpdate: async (
        filter: { runId: string; telegramUserId: number; profileCredited?: unknown },
        update: { $set: Record<string, unknown> },
      ) => {
        const found = runsMap.get(filter.runId);
        if (!found || found.telegramUserId !== filter.telegramUserId) {
          return null;
        }
        if (found.profileCredited) {
          return null;
        }
        const updated = { ...found, ...update.$set };
        runsMap.set(filter.runId, updated as GameRun);
        return updated;
      },
      updateOne: async (filter: { runId: string }, update: { $set: Record<string, unknown> }) => {
        const found = runsMap.get(filter.runId);
        if (!found) return { matchedCount: 0, modifiedCount: 0 };
        const updated = { ...found, ...update.$set };
        runsMap.set(filter.runId, updated as GameRun);
        return { matchedCount: 1, modifiedCount: 1 };
      },
    };

    return {
      collection: (name: string) => {
        if (name === 'profiles') return mockProfiles as unknown;
        if (name === 'referrals') return mockReferrals as unknown;
        if (name === 'runs') return mockRuns as unknown;
        throw new Error(`Unexpected collection: ${name}`);
      },
    } as unknown as Db;
  }

  function createTestPlayer(id: number, coins = 0, gamesPlayed = 0): PlayerProfile {
    return {
      telegramUserId: id,
      username: `user_${id}`,
      firstName: `Player ${id}`,
      lastName: null,
      photoUrl: null,
      coins,
      xp: 0,
      level: 1,
      currentStreak: 0,
      longestStreak: 0,
      gamesPlayed,
      bestScore: 0,
      lastPlayedDate: null,
      referredBy: null,
      referralCount: 0,
      ownedItemIds: [],
      equipped: { avatarFrame: null, flagTheme: null, profileBanner: null },
      battleRating: 0,
      currentSeason: null,
      tier4CorrectCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  function createTestRun(runId: string, telegramUserId: number): GameRun {
    const now = Date.now();
    return {
      runId,
      telegramUserId,
      mode: 'practice',
      status: 'active',
      runningTotal: 100,
      comboCount: 2,
      maxCombo: 2,
      profileCredited: false,
      runDurationMs: 5000,
      flags: [
        {
          flagIndex: 0,
          isoCode: 'fr',
          name: 'France',
          tier: 1,
          choices: ['fr', 'de', 'es', 'it'],
          answered: true,
          correct: true,
          selectedIsoCode: 'fr',
          points: 50,
          answeredAt: new Date(now - 3000),
        },
        {
          flagIndex: 1,
          isoCode: 'de',
          name: 'Germany',
          tier: 1,
          choices: ['fr', 'de', 'es', 'it'],
          answered: true,
          correct: true,
          selectedIsoCode: 'de',
          points: 50,
          answeredAt: new Date(now - 1000),
        },
      ],
      startedAt: new Date(now - 5000),
      createdAt: new Date(now - 5000),
      updatedAt: new Date(now - 1000),
    };
  }

  before(async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'mock-bot-token-ref-test';
    redis = await initRedis('memory');
    db = createMockDb();
    await initReferralCollection(db);
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
          sentNotifications.push({
            chatId: payload.chat_id as string | number,
            text: String(payload.text || ''),
          });
        }
      }
      return new Response(JSON.stringify({ ok: true, result: { message_id: 111 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
  });

  after(async () => {
    globalThis.fetch = originalFetch;
    await closeNotificationQueue();
    await closeRedis();
  });

  beforeEach(async () => {
    profilesMap.clear();
    referralsMap.clear();
    runsMap.clear();
    sentNotifications.length = 0;
    const keys = await redis.keys('referral:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  it('signup alone creates pending-first-run referral record and credits zero coins to both parties', async () => {
    const inviterId = 1001;
    const newPlayerId = 2001;

    profilesMap.set(inviterId, createTestPlayer(inviterId, 250));
    profilesMap.set(newPlayerId, createTestPlayer(newPlayerId, 0));

    const referral = await registerReferralSignup(inviterId, newPlayerId, db);
    assert.ok(referral);
    assert.equal(referral.inviterTelegramUserId, inviterId);
    assert.equal(referral.newPlayerTelegramUserId, newPlayerId);
    assert.equal(referral.status, 'pending-first-run');
    assert.equal(referral.completedAt, null);

    const inviterProfile = profilesMap.get(inviterId);
    assert.equal(inviterProfile?.coins, 250);
    assert.equal(inviterProfile?.referralCount, 0);

    const newPlayerProfile = profilesMap.get(newPlayerId);
    assert.equal(newPlayerProfile?.coins, 0);
    assert.equal(newPlayerProfile?.referredBy, inviterId);

    assert.equal(sentNotifications.length, 0);
  });

  it('completing a first run credits inviter (+100) and new player (+50) exactly once', async () => {
    const inviterId = 1002;
    const newPlayerId = 2002;

    profilesMap.set(inviterId, createTestPlayer(inviterId, 100));
    profilesMap.set(newPlayerId, createTestPlayer(newPlayerId, 0));

    await registerReferralSignup(inviterId, newPlayerId, db);

    const runId = 'run_ref_first_001';
    runsMap.set(runId, createTestRun(runId, newPlayerId));

    const finishResult = await finishRun(runId, newPlayerId, db, redis);
    assert.ok(finishResult);

    const newPlayerProfile = profilesMap.get(newPlayerId);
    assert.ok(newPlayerProfile);
    assert.equal(newPlayerProfile.coins, finishResult.coinsEarned + REFERRAL_NEW_PLAYER_COIN_REWARD);

    const inviterProfile = profilesMap.get(inviterId);
    assert.ok(inviterProfile);
    assert.equal(inviterProfile.coins, 100 + REFERRAL_INVITER_COIN_REWARD);
    assert.equal(inviterProfile.referralCount, 1);

    const savedReferral = referralsMap.get(newPlayerId);
    assert.ok(savedReferral);
    assert.equal(savedReferral.status, 'completed');
    assert.ok(savedReferral.completedAt);

    await new Promise((r) => setTimeout(r, 60));
    assert.equal(sentNotifications.length, 1);
    assert.equal(sentNotifications[0].chatId, inviterId);
    assert.ok(sentNotifications[0].text.includes('+100 Coins'));
  });

  it('subsequent runs by the referred player do not award duplicate referral coins', async () => {
    const inviterId = 1003;
    const newPlayerId = 2003;

    profilesMap.set(inviterId, createTestPlayer(inviterId, 0));
    profilesMap.set(newPlayerId, createTestPlayer(newPlayerId, 0));

    await registerReferralSignup(inviterId, newPlayerId, db);

    const run1 = 'run_subsequent_001';
    runsMap.set(run1, createTestRun(run1, newPlayerId));
    await finishRun(run1, newPlayerId, db, redis);

    const inviterCoinsAfterRun1 = profilesMap.get(inviterId)?.coins ?? 0;
    const newPlayerCoinsAfterRun1 = profilesMap.get(newPlayerId)?.coins ?? 0;
    assert.equal(inviterCoinsAfterRun1, 100);

    const run2 = 'run_subsequent_002';
    runsMap.set(run2, createTestRun(run2, newPlayerId));
    const finish2 = await finishRun(run2, newPlayerId, db, redis);

    const inviterCoinsAfterRun2 = profilesMap.get(inviterId)?.coins ?? 0;
    const newPlayerCoinsAfterRun2 = profilesMap.get(newPlayerId)?.coins ?? 0;

    assert.equal(inviterCoinsAfterRun2, 100);
    assert.equal(newPlayerCoinsAfterRun2, newPlayerCoinsAfterRun1 + finish2.coinsEarned);
  });

  it('enforces per-inviter daily cap of 10: 11th referral awards only new player welcome bonus', async () => {
    const inviterId = 1004;
    profilesMap.set(inviterId, createTestPlayer(inviterId, 0));

    for (let i = 1; i <= REFERRAL_DAILY_INVITER_CAP; i++) {
      const playerId = 2100 + i;
      profilesMap.set(playerId, createTestPlayer(playerId, 0));
      await registerReferralSignup(inviterId, playerId, db);
      const runId = `run_cap_test_${i}`;
      runsMap.set(runId, createTestRun(runId, playerId));
      await finishRun(runId, playerId, db, redis);
    }

    const inviterAtCap = profilesMap.get(inviterId);
    assert.ok(inviterAtCap);
    assert.equal(inviterAtCap.coins, REFERRAL_DAILY_INVITER_CAP * REFERRAL_INVITER_COIN_REWARD);
    assert.equal(inviterAtCap.referralCount, REFERRAL_DAILY_INVITER_CAP);

    const player11Id = 2111;
    profilesMap.set(player11Id, createTestPlayer(player11Id, 0));
    await registerReferralSignup(inviterId, player11Id, db);
    const run11 = 'run_cap_test_11';
    runsMap.set(run11, createTestRun(run11, player11Id));
    const finish11 = await finishRun(run11, player11Id, db, redis);

    const player11 = profilesMap.get(player11Id);
    assert.ok(player11);
    assert.equal(player11.coins, finish11.coinsEarned + REFERRAL_NEW_PLAYER_COIN_REWARD);

    const inviterAfter11 = profilesMap.get(inviterId);
    assert.ok(inviterAfter11);
    assert.equal(inviterAfter11.coins, REFERRAL_DAILY_INVITER_CAP * REFERRAL_INVITER_COIN_REWARD);
    assert.equal(inviterAfter11.referralCount, REFERRAL_DAILY_INVITER_CAP);

    const referral11 = referralsMap.get(player11Id);
    assert.ok(referral11);
    assert.equal(referral11.status, 'completed');
  });

  it('resets inviter daily cap when advancing to next UTC day', async () => {
    const inviterId = 1005;
    profilesMap.set(inviterId, createTestPlayer(inviterId, 0));

    const day1 = new Date('2026-09-17T12:00:00Z');
    const day2 = new Date('2026-09-18T12:00:00Z');

    for (let i = 1; i <= REFERRAL_DAILY_INVITER_CAP; i++) {
      const playerId = 2200 + i;
      profilesMap.set(playerId, createTestPlayer(playerId, 0));
      await registerReferralSignup(inviterId, playerId, db);
      await processReferralOnFirstRun(playerId, db, redis, { now: day1 });
    }

    assert.equal(profilesMap.get(inviterId)?.coins, 1000);

    const nextDayPlayerId = 2211;
    profilesMap.set(nextDayPlayerId, createTestPlayer(nextDayPlayerId, 0));
    await registerReferralSignup(inviterId, nextDayPlayerId, db);
    const resultNextDay = await processReferralOnFirstRun(nextDayPlayerId, db, redis, { now: day2 });

    assert.ok(resultNextDay);
    assert.equal(resultNextDay.creditedNewPlayer, true);
    assert.equal(resultNextDay.creditedInviter, true);
    assert.equal(resultNextDay.inviterCapped, false);
    assert.equal(profilesMap.get(inviterId)?.coins, 1100);
  });

  it('rejects re-attribution to a second inviter enforcing first-touch-wins', async () => {
    const firstInviterId = 1006;
    const secondInviterId = 1007;
    const newPlayerId = 2006;

    profilesMap.set(firstInviterId, createTestPlayer(firstInviterId, 0));
    profilesMap.set(secondInviterId, createTestPlayer(secondInviterId, 0));
    profilesMap.set(newPlayerId, createTestPlayer(newPlayerId, 0));

    const firstRegistration = await registerReferralSignup(firstInviterId, newPlayerId, db);
    assert.ok(firstRegistration);
    assert.equal(firstRegistration.inviterTelegramUserId, firstInviterId);

    const secondRegistration = await registerReferralSignup(secondInviterId, newPlayerId, db);
    assert.equal(secondRegistration, null);

    const finalReferral = referralsMap.get(newPlayerId);
    assert.ok(finalReferral);
    assert.equal(finalReferral.inviterTelegramUserId, firstInviterId);
  });

  it('a referred player who never finishes a run never triggers rewards for either party', async () => {
    const inviterId = 1008;
    const idlePlayerId = 2008;

    profilesMap.set(inviterId, createTestPlayer(inviterId, 500));
    profilesMap.set(idlePlayerId, createTestPlayer(idlePlayerId, 0));

    await registerReferralSignup(inviterId, idlePlayerId, db);

    const referral = referralsMap.get(idlePlayerId);
    assert.ok(referral);
    assert.equal(referral.status, 'pending-first-run');
    assert.equal(referral.completedAt, null);

    assert.equal(profilesMap.get(inviterId)?.coins, 500);
    assert.equal(profilesMap.get(idlePlayerId)?.coins, 0);
    assert.equal(sentNotifications.length, 0);
  });

  it('rejects self-referral where inviter and new player have the same ID', async () => {
    const userId = 1009;
    profilesMap.set(userId, createTestPlayer(userId, 0));

    const result = await registerReferralSignup(userId, userId, db);
    assert.equal(result, null);
    assert.equal(referralsMap.has(userId), false);
  });
});
