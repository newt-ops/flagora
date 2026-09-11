import type { Request, Response, NextFunction, RequestHandler } from 'express';
import {
  RateLimiterRedis,
  RateLimiterMemory,
  RateLimiterRes,
  type RateLimiterAbstract,
} from 'rate-limiter-flexible';
import type { AuthenticatedSessionRequest } from '../session/requireSession.js';
import { getRedis } from '../db/redis.js';

export interface RateLimitOptions {
  endpoint: string;
  limit: number;
  windowSeconds: number;
  keyFn?: (req: Request) => string;
}

const limiterRegistry = new Map<string, RateLimiterAbstract>();

function isMemoryRedis(client: unknown): boolean {
  if (!client) {
    return true;
  }
  if (process.env.REDIS_URL === 'memory') {
    return true;
  }
  const name = (client as { constructor?: { name?: string } }).constructor?.name;
  return name === 'RedisMock';
}

function createLimiterInstance(options: RateLimitOptions): RateLimiterAbstract {
  const registryKey = `${options.endpoint}:${options.limit}:${options.windowSeconds}`;
  const existing = limiterRegistry.get(registryKey);
  if (existing) {
    return existing;
  }

  let client: unknown = null;
  try {
    client = getRedis();
  } catch {
    client = null;
  }

  let limiter: RateLimiterAbstract;

  if (client && !isMemoryRedis(client)) {
    const memoryInsurance = new RateLimiterMemory({
      keyPrefix: `rl:${options.endpoint}:mem`,
      points: options.limit,
      duration: options.windowSeconds,
    });

    limiter = new RateLimiterRedis({
      storeClient: client as unknown as ConstructorParameters<typeof RateLimiterRedis>[0]['storeClient'],
      keyPrefix: `rl:${options.endpoint}`,
      points: options.limit,
      duration: options.windowSeconds,
      insuranceLimiter: memoryInsurance,
    });
  } else {
    limiter = new RateLimiterMemory({
      keyPrefix: `rl:${options.endpoint}`,
      points: options.limit,
      duration: options.windowSeconds,
    });
  }

  limiterRegistry.set(registryKey, limiter);
  return limiter;
}

export function defaultRateLimitKey(req: Request): string {
  const sessionReq = req as Partial<AuthenticatedSessionRequest>;
  if (sessionReq.sessionUser?.telegramUserId) {
    return `user:${sessionReq.sessionUser.telegramUserId}`;
  }

  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
    const firstIp = forwarded.split(',')[0].trim();
    if (firstIp) {
      return `ip:${firstIp}`;
    }
  }

  return `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
}

export function rateLimit(options: RateLimitOptions): RequestHandler {
  let limiter: RateLimiterAbstract | null = null;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!limiter) {
      limiter = createLimiterInstance(options);
    }

    const key = options.keyFn ? options.keyFn(req) : defaultRateLimitKey(req);

    try {
      await limiter.consume(key);
      next();
    } catch (error) {
      if (error instanceof RateLimiterRes) {
        const retryAfterSeconds = Math.max(1, Math.ceil(error.msBeforeNext / 1000));
        res.setHeader('Retry-After', String(retryAfterSeconds));
        res.status(429).json({
          error: 'Too Many Requests',
          message: `Rate limit exceeded for ${options.endpoint}. Try again in ${retryAfterSeconds} seconds.`,
          retryAfter: retryAfterSeconds,
        });
        return;
      }
      next();
    }
  };
}

export function clearRateLimiters(): void {
  limiterRegistry.clear();
}
