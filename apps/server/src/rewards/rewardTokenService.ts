import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Redis as RedisClient } from 'ioredis';
import { getUtcDateString } from '@flagora/shared';
import { getRedis } from '../db/redis.js';
import {
  type RewardType,
  isRewardType,
  getRewardConfig,
  getRewardResetAtUtc,
} from './rewardConfig.js';
import {
  RewardCapReachedError,
  InvalidRewardTypeError,
  InvalidRewardTokenError,
  ExpiredRewardTokenError,
  RewardTypeMismatchError,
  RewardTokenAlreadyRedeemedError,
} from './rewardErrors.js';

export const DEFAULT_REWARD_TOKEN_TTL_SECONDS = 120;
const CAP_KEY_TTL_SECONDS = 86400 * 2;

export interface RewardTokenServiceOptions {
  redis?: RedisClient;
  secret?: string;
  now?: Date;
  ttlSeconds?: number;
}

export interface RewardTokenPayload {
  jti: string;
  telegramUserId: number;
  rewardType: RewardType;
}

export interface RedeemRewardResult {
  telegramUserId: number;
}

export interface DailyCapUsage {
  rewardType: RewardType;
  used: number;
  dailyCap: number;
  remaining: number;
  isCapReached: boolean;
  resetAtUtc: string;
}

class RedeemRewardResultImpl implements RedeemRewardResult {
  readonly telegramUserId: number;

  constructor(telegramUserId: number) {
    this.telegramUserId = telegramUserId;
  }

  valueOf(): number {
    return this.telegramUserId;
  }

  toString(): string {
    return String(this.telegramUserId);
  }

  [Symbol.toPrimitive](hint: string): number | string {
    if (hint === 'string') {
      return String(this.telegramUserId);
    }
    return this.telegramUserId;
  }
}

function resolveSecret(options?: RewardTokenServiceOptions): string {
  if (options?.secret && options.secret.trim() !== '') {
    return options.secret.trim();
  }
  const envSecret = process.env.REWARD_TOKEN_SECRET;
  if (envSecret && envSecret.trim() !== '') {
    return envSecret.trim();
  }
  return 'flagora-reward-token-secret-default-dev-test-32bytes';
}

function resolveRedis(options?: RewardTokenServiceOptions): RedisClient {
  return options?.redis ?? getRedis();
}

function getCapRedisKey(telegramUserId: number, rewardType: string, dateStr: string): string {
  return `reward:cap:${telegramUserId}:${rewardType}:${dateStr}`;
}

function getPendingRedisKey(jti: string): string {
  return `reward:pending:${jti}`;
}

function logRewardEvent(message: string): void {
  process.stdout.write(`[Reward] ${message}\n`);
}

export async function getRewardDailyCapUsage(
  telegramUserId: number,
  rewardType: RewardType | string,
  options?: RewardTokenServiceOptions,
): Promise<DailyCapUsage> {
  if (!isRewardType(rewardType)) {
    throw new InvalidRewardTypeError(rewardType);
  }

  const config = getRewardConfig(rewardType);
  if (!config) {
    throw new InvalidRewardTypeError(rewardType);
  }

  const redis = resolveRedis(options);
  const now = options?.now ?? new Date();
  const dateStr = getUtcDateString(now);
  const capKey = getCapRedisKey(telegramUserId, rewardType, dateStr);

  const rawCount = await redis.get(capKey);
  const used = rawCount ? parseInt(rawCount, 10) : 0;
  const safeUsed = Number.isFinite(used) && used > 0 ? used : 0;
  const remaining = Math.max(0, config.dailyCap - safeUsed);

  return {
    rewardType,
    used: safeUsed,
    dailyCap: config.dailyCap,
    remaining,
    isCapReached: safeUsed >= config.dailyCap,
    resetAtUtc: getRewardResetAtUtc(now),
  };
}

export async function issueRewardToken(
  telegramUserId: number,
  rewardType: RewardType | string,
  options?: RewardTokenServiceOptions,
): Promise<string> {
  if (!isRewardType(rewardType)) {
    logRewardEvent(`Issuance rejected: invalid reward type '${rewardType}' for user ${telegramUserId}`);
    throw new InvalidRewardTypeError(rewardType);
  }

  const config = getRewardConfig(rewardType);
  if (!config) {
    logRewardEvent(`Issuance rejected: invalid reward type '${rewardType}' for user ${telegramUserId}`);
    throw new InvalidRewardTypeError(rewardType);
  }

  const redis = resolveRedis(options);
  const now = options?.now ?? new Date();
  const dateStr = getUtcDateString(now);
  const capKey = getCapRedisKey(telegramUserId, rewardType, dateStr);

  const rawCount = await redis.get(capKey);
  const currentUsed = rawCount ? parseInt(rawCount, 10) : 0;
  const safeUsed = Number.isFinite(currentUsed) && currentUsed > 0 ? currentUsed : 0;

  if (safeUsed >= config.dailyCap) {
    logRewardEvent(
      `Issuance rejected: daily cap reached (${safeUsed}/${config.dailyCap}) for user ${telegramUserId}, type ${rewardType}`,
    );
    throw new RewardCapReachedError(
      telegramUserId,
      rewardType,
      config.dailyCap,
      safeUsed,
      getRewardResetAtUtc(now),
    );
  }

  const jti = crypto.randomUUID();
  const secret = resolveSecret(options);
  const ttlSeconds = options?.ttlSeconds ?? DEFAULT_REWARD_TOKEN_TTL_SECONDS;

  const token = jwt.sign(
    {
      jti,
      telegramUserId,
      rewardType,
    },
    secret,
    {
      expiresIn: `${ttlSeconds}s`,
      algorithm: 'HS256',
    },
  );

  const pendingKey = getPendingRedisKey(jti);
  await redis.set(pendingKey, '1', 'EX', ttlSeconds);

  logRewardEvent(`Issued token: user=${telegramUserId}, type=${rewardType}, jti=${jti}`);

  return token;
}

export function verifyRewardToken(
  token: string,
  options?: RewardTokenServiceOptions,
): RewardTokenPayload {
  if (!token || typeof token !== 'string' || token.trim() === '') {
    logRewardEvent('Verification rejected: missing or empty token');
    throw new InvalidRewardTokenError('Reward token is missing');
  }

  const secret = resolveSecret(options);

  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (typeof decoded !== 'object' || decoded === null) {
      logRewardEvent('Verification rejected: token payload is not an object');
      throw new InvalidRewardTokenError('Reward token payload is invalid');
    }

    const payload = decoded as Partial<RewardTokenPayload>;
    if (
      typeof payload.jti !== 'string' ||
      payload.jti.trim() === '' ||
      typeof payload.telegramUserId !== 'number' ||
      !Number.isFinite(payload.telegramUserId) ||
      typeof payload.rewardType !== 'string' ||
      !isRewardType(payload.rewardType)
    ) {
      logRewardEvent('Verification rejected: token payload missing required fields');
      throw new InvalidRewardTokenError('Reward token payload is malformed');
    }

    return {
      jti: payload.jti,
      telegramUserId: payload.telegramUserId,
      rewardType: payload.rewardType,
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logRewardEvent('Verification rejected: token expired');
      throw new ExpiredRewardTokenError();
    }
    if (error instanceof InvalidRewardTokenError) {
      throw error;
    }
    logRewardEvent('Verification rejected: invalid token signature or format');
    throw new InvalidRewardTokenError();
  }
}

export async function redeemRewardToken(
  token: string,
  expectedRewardType: RewardType | string,
  options?: RewardTokenServiceOptions,
): Promise<RedeemRewardResult> {
  const payload = verifyRewardToken(token, options);

  if (payload.rewardType !== expectedRewardType) {
    logRewardEvent(
      `Redemption rejected: type mismatch (expected '${expectedRewardType}', received '${payload.rewardType}') for user ${payload.telegramUserId}, jti=${payload.jti}`,
    );
    throw new RewardTypeMismatchError(expectedRewardType, payload.rewardType);
  }

  const redis = resolveRedis(options);
  const pendingKey = getPendingRedisKey(payload.jti);

  const deletedCount = await redis.del(pendingKey);
  if (deletedCount !== 1) {
    logRewardEvent(
      `Redemption rejected: token not pending (already redeemed or expired) for user ${payload.telegramUserId}, jti=${payload.jti}`,
    );
    throw new RewardTokenAlreadyRedeemedError();
  }

  const now = options?.now ?? new Date();
  const dateStr = getUtcDateString(now);
  const capKey = getCapRedisKey(payload.telegramUserId, payload.rewardType, dateStr);

  const used = await redis.incr(capKey);
  if (used === 1) {
    await redis.expire(capKey, CAP_KEY_TTL_SECONDS);
  }

  logRewardEvent(
    `Redeemed token: user=${payload.telegramUserId}, type=${payload.rewardType}, jti=${payload.jti}, usedToday=${used}`,
  );

  return new RedeemRewardResultImpl(payload.telegramUserId);
}
