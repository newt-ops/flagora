import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import type { Redis as RedisClient } from 'ioredis';
import { initRedis, closeRedis } from '../db/redis.js';
import { REWARD_CONFIG } from './rewardConfig.js';
import {
  RewardCapReachedError,
  InvalidRewardTypeError,
  InvalidRewardTokenError,
  ExpiredRewardTokenError,
  RewardTypeMismatchError,
  RewardTokenAlreadyRedeemedError,
} from './rewardErrors.js';
import {
  issueRewardToken,
  redeemRewardToken,
  verifyRewardToken,
  getRewardDailyCapUsage,
} from './rewardTokenService.js';

describe('Phase 8 Prompt 01: Reward-Token Infrastructure', () => {
  let redis: RedisClient;
  const testSecret = 'test-reward-token-secret-32-chars-long';

  before(async () => {
    redis = await initRedis('memory');
  });

  after(async () => {
    await closeRedis();
  });

  beforeEach(async () => {
    await redis.flushall();
  });

  describe('Daily cap config & inspection', () => {
    it('has expected daily caps configured', () => {
      assert.equal(REWARD_CONFIG['bonus-coins'].dailyCap, 5);
      assert.equal(REWARD_CONFIG['streak-save'].dailyCap, 1);
    });

    it('getRewardDailyCapUsage returns correct initial state', async () => {
      const usage = await getRewardDailyCapUsage(1001, 'bonus-coins', { redis, secret: testSecret });
      assert.equal(usage.rewardType, 'bonus-coins');
      assert.equal(usage.dailyCap, 5);
      assert.equal(usage.used, 0);
      assert.equal(usage.remaining, 5);
      assert.equal(usage.isCapReached, false);
      assert.ok(usage.resetAtUtc);
    });

    it('rejects invalid reward types', async () => {
      await assert.rejects(
        async () => {
          await issueRewardToken(1001, 'unlimited-gems', { redis, secret: testSecret });
        },
        InvalidRewardTypeError,
      );
    });
  });

  describe('Issuance under and at cap', () => {
    it('issues a token when under cap and creates pending entry in Redis', async () => {
      const token = await issueRewardToken(1002, 'bonus-coins', { redis, secret: testSecret });
      assert.ok(typeof token === 'string' && token.length > 20);

      const payload = verifyRewardToken(token, { secret: testSecret });
      assert.equal(payload.telegramUserId, 1002);
      assert.equal(payload.rewardType, 'bonus-coins');
      assert.ok(payload.jti);

      const pendingKey = `reward:pending:${payload.jti}`;
      const pendingVal = await redis.get(pendingKey);
      assert.equal(pendingVal, '1');

      const ttl = await redis.ttl(pendingKey);
      assert.ok(ttl > 0 && ttl <= 120);
    });

    it('rejects issuance when daily cap is reached and creates NO pending entry', async () => {
      const now = new Date('2026-09-08T12:00:00.000Z');
      const userId = 1003;

      const capKey = `reward:cap:${userId}:bonus-coins:2026-09-08`;
      await redis.set(capKey, '5');

      const initialKeys = await redis.keys('reward:pending:*');

      await assert.rejects(
        async () => {
          await issueRewardToken(userId, 'bonus-coins', { redis, secret: testSecret, now });
        },
        (err: unknown) => {
          assert.ok(err instanceof RewardCapReachedError);
          assert.equal(err.telegramUserId, userId);
          assert.equal(err.rewardType, 'bonus-coins');
          assert.equal(err.dailyCap, 5);
          assert.equal(err.usedCount, 5);
          return true;
        },
      );

      const finalKeys = await redis.keys('reward:pending:*');
      assert.equal(finalKeys.length, initialKeys.length);
    });

    it('enforces streak-save daily cap of 1', async () => {
      const userId = 1004;
      const now = new Date('2026-09-08T12:00:00.000Z');
      const capKey = `reward:cap:${userId}:streak-save:2026-09-08`;
      await redis.set(capKey, '1');

      await assert.rejects(
        async () => {
          await issueRewardToken(userId, 'streak-save', { redis, secret: testSecret, now });
        },
        RewardCapReachedError,
      );
    });
  });

  describe('Single-use redemption semantics', () => {
    it('redeems a valid token successfully on first attempt and increments cap', async () => {
      const userId = 2001;
      const now = new Date('2026-09-08T10:00:00.000Z');
      const token = await issueRewardToken(userId, 'bonus-coins', { redis, secret: testSecret, now });

      const result = await redeemRewardToken(token, 'bonus-coins', { redis, secret: testSecret, now });
      assert.equal(result.telegramUserId, userId);

      const usage = await getRewardDailyCapUsage(userId, 'bonus-coins', { redis, secret: testSecret, now });
      assert.equal(usage.used, 1);
      assert.equal(usage.remaining, 4);

      const payload = verifyRewardToken(token, { secret: testSecret });
      const pendingVal = await redis.get(`reward:pending:${payload.jti}`);
      assert.equal(pendingVal, null);
    });

    it('rejects a second redemption attempt on the exact same token', async () => {
      const userId = 2002;
      const now = new Date('2026-09-08T10:00:00.000Z');
      const token = await issueRewardToken(userId, 'bonus-coins', { redis, secret: testSecret, now });

      const res1 = await redeemRewardToken(token, 'bonus-coins', { redis, secret: testSecret, now });
      assert.equal(res1.telegramUserId, userId);

      await assert.rejects(
        async () => {
          await redeemRewardToken(token, 'bonus-coins', { redis, secret: testSecret, now });
        },
        RewardTokenAlreadyRedeemedError,
      );

      const usage = await getRewardDailyCapUsage(userId, 'bonus-coins', { redis, secret: testSecret, now });
      assert.equal(usage.used, 1);
    });
  });

  describe('Expired and invalid token rejection', () => {
    it('rejects an expired token and does not increment cap', async () => {
      const userId = 3001;
      const jti = 'expired-jti-test';

      const expiredToken = jwt.sign(
        {
          jti,
          telegramUserId: userId,
          rewardType: 'bonus-coins',
        },
        testSecret,
        {
          expiresIn: '-10s',
          algorithm: 'HS256',
        },
      );

      await redis.set(`reward:pending:${jti}`, '1', 'EX', 120);

      await assert.rejects(
        async () => {
          await redeemRewardToken(expiredToken, 'bonus-coins', { redis, secret: testSecret });
        },
        ExpiredRewardTokenError,
      );

      const usage = await getRewardDailyCapUsage(userId, 'bonus-coins', { redis, secret: testSecret });
      assert.equal(usage.used, 0);
    });

    it('rejects malformed or tampered tokens', async () => {
      await assert.rejects(
        async () => {
          await redeemRewardToken('not-a-valid-token-format', 'bonus-coins', { redis, secret: testSecret });
        },
        InvalidRewardTokenError,
      );

      const forgedToken = jwt.sign(
        { jti: 'forged', telegramUserId: 3002, rewardType: 'bonus-coins' },
        'wrong-secret-signature',
        { expiresIn: '120s', algorithm: 'HS256' },
      );

      await assert.rejects(
        async () => {
          await redeemRewardToken(forgedToken, 'bonus-coins', { redis, secret: testSecret });
        },
        InvalidRewardTokenError,
      );
    });
  });

  describe('Reward type mismatch protection', () => {
    it('rejects redeeming a streak-save token as bonus-coins', async () => {
      const userId = 4001;
      const streakToken = await issueRewardToken(userId, 'streak-save', { redis, secret: testSecret });

      await assert.rejects(
        async () => {
          await redeemRewardToken(streakToken, 'bonus-coins', { redis, secret: testSecret });
        },
        (err: unknown) => {
          assert.ok(err instanceof RewardTypeMismatchError);
          assert.equal(err.expectedRewardType, 'bonus-coins');
          assert.equal(err.actualRewardType, 'streak-save');
          return true;
        },
      );

      const streakResult = await redeemRewardToken(streakToken, 'streak-save', { redis, secret: testSecret });
      assert.equal(streakResult.telegramUserId, userId);
    });
  });

  describe('Real Concurrency Race Condition Test', () => {
    it('allows exactly 1 redemption when two concurrent requests race for the same token', async () => {
      const userId = 5001;
      const token = await issueRewardToken(userId, 'bonus-coins', { redis, secret: testSecret });

      const [resA, resB] = await Promise.allSettled([
        redeemRewardToken(token, 'bonus-coins', { redis, secret: testSecret }),
        redeemRewardToken(token, 'bonus-coins', { redis, secret: testSecret }),
      ]);

      const fulfilled = [resA, resB].filter((r) => r.status === 'fulfilled');
      const rejected = [resA, resB].filter((r) => r.status === 'rejected');

      assert.equal(fulfilled.length, 1, 'Exactly one concurrent redemption attempt must succeed');
      assert.equal(rejected.length, 1, 'Exactly one concurrent redemption attempt must be rejected');

      if (fulfilled[0].status === 'fulfilled') {
        assert.equal(fulfilled[0].value.telegramUserId, userId);
      }

      if (rejected[0].status === 'rejected') {
        assert.ok(
          rejected[0].reason instanceof RewardTokenAlreadyRedeemedError,
          'Rejected attempt must throw RewardTokenAlreadyRedeemedError',
        );
      }

      const usage = await getRewardDailyCapUsage(userId, 'bonus-coins', { redis, secret: testSecret });
      assert.equal(usage.used, 1, 'Cap counter must only be incremented once');
    });

    it('handles 5 concurrent requests on the same token with exactly 1 winner', async () => {
      const userId = 5002;
      const token = await issueRewardToken(userId, 'bonus-coins', { redis, secret: testSecret });

      const results = await Promise.allSettled(
        Array.from({ length: 5 }).map(() =>
          redeemRewardToken(token, 'bonus-coins', { redis, secret: testSecret }),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      assert.equal(fulfilled.length, 1);
      assert.equal(rejected.length, 4);

      for (const rej of rejected) {
        if (rej.status === 'rejected') {
          assert.ok(rej.reason instanceof RewardTokenAlreadyRedeemedError);
        }
      }
    });
  });

  describe('Zero Raw Token Leakage in Logs', () => {
    it('never logs raw JWT token string during issuance, redemption, or failure', async () => {
      const capturedLogs: string[] = [];
      const originalWrite = process.stdout.write;

      process.stdout.write = function (
        chunk: string | Uint8Array,
        encodingOrCallback?: BufferEncoding | ((err?: Error) => void),
        callback?: (err?: Error) => void,
      ): boolean {
        capturedLogs.push(chunk.toString());
        if (typeof encodingOrCallback === 'function') {
          encodingOrCallback();
        } else if (typeof callback === 'function') {
          callback();
        }
        return true;
      };

      let issuedToken: string;
      try {
        issuedToken = await issueRewardToken(6001, 'bonus-coins', { redis, secret: testSecret });
        await redeemRewardToken(issuedToken, 'bonus-coins', { redis, secret: testSecret });

        try {
          await redeemRewardToken(issuedToken, 'bonus-coins', { redis, secret: testSecret });
        } catch {
          void 0;
        }

        const streakToken = await issueRewardToken(6001, 'streak-save', { redis, secret: testSecret });
        try {
          await redeemRewardToken(streakToken, 'bonus-coins', { redis, secret: testSecret });
        } catch {
          void 0;
        }
      } finally {
        process.stdout.write = originalWrite;
      }

      const allOutput = capturedLogs.join('');

      assert.ok(issuedToken, 'Must have issued a token');
      assert.equal(
        allOutput.includes(issuedToken),
        false,
        'Raw token string must NOT appear in log output',
      );

      assert.ok(allOutput.includes('[Reward] Issued token: user=6001, type=bonus-coins'));
      assert.ok(allOutput.includes('[Reward] Redeemed token: user=6001, type=bonus-coins'));
      assert.ok(allOutput.includes('already redeemed or expired'));
      assert.ok(allOutput.includes('type mismatch'));
    });
  });

  describe('UTC Day Boundary Reset', () => {
    it('resets daily cap count when date advances to next UTC day', async () => {
      const userId = 7001;
      const day1 = new Date('2026-09-08T23:59:00.000Z');
      const day2 = new Date('2026-09-09T00:01:00.000Z');

      for (let i = 0; i < 5; i++) {
        const token = await issueRewardToken(userId, 'bonus-coins', { redis, secret: testSecret, now: day1 });
        await redeemRewardToken(token, 'bonus-coins', { redis, secret: testSecret, now: day1 });
      }

      await assert.rejects(
        async () => {
          await issueRewardToken(userId, 'bonus-coins', { redis, secret: testSecret, now: day1 });
        },
        RewardCapReachedError,
      );

      const day2Token = await issueRewardToken(userId, 'bonus-coins', { redis, secret: testSecret, now: day2 });
      const day2Result = await redeemRewardToken(day2Token, 'bonus-coins', { redis, secret: testSecret, now: day2 });
      assert.equal(day2Result.telegramUserId, userId);

      const day2Usage = await getRewardDailyCapUsage(userId, 'bonus-coins', { redis, secret: testSecret, now: day2 });
      assert.equal(day2Usage.used, 1);
      assert.equal(day2Usage.remaining, 4);
    });
  });
});
