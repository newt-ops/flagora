import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express, { type Request, type Response } from 'express';
import {
  rateLimit,
  defaultRateLimitKey,
  clearRateLimiters,
} from './rateLimit.js';
import type { AuthenticatedSessionRequest } from '../session/requireSession.js';

describe('Rate Limiter Middleware', () => {
  let server: http.Server;
  let baseUrl: string;
  let businessLogicCalledCount = 0;

  before(async () => {
    const app = express();
    app.set('trust proxy', true);
    app.use(express.json());

    app.use((req, _res, next) => {
      const userHeader = req.headers['x-test-user-id'];
      if (userHeader) {
        (req as unknown as AuthenticatedSessionRequest).sessionUser = {
          telegramUserId: Number(userHeader),
        };
      }
      next();
    });

    app.post(
      '/test/limited',
      rateLimit({ endpoint: 'test_limited', limit: 3, windowSeconds: 60 }),
      (_req: Request, res: Response) => {
        businessLogicCalledCount += 1;
        res.status(200).json({ ok: true, count: businessLogicCalledCount });
      },
    );

    app.post(
      '/test/independent',
      rateLimit({ endpoint: 'test_independent', limit: 3, windowSeconds: 60 }),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true, endpoint: 'independent' });
      },
    );

    app.post(
      '/test/custom-key',
      rateLimit({
        endpoint: 'test_custom_key',
        limit: 2,
        windowSeconds: 60,
        keyFn: (req) => String(req.headers['x-custom-tenant'] || 'tenant-default'),
      }),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );

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
  });

  beforeEach(() => {
    businessLogicCalledCount = 0;
    clearRateLimiters();
  });

  describe('defaultRateLimitKey', () => {
    it('derives key from sessionUser telegramUserId when available', () => {
      const mockReq = {
        sessionUser: { telegramUserId: 998877 },
        headers: {},
      } as unknown as Request;

      const key = defaultRateLimitKey(mockReq);
      assert.equal(key, 'user:998877');
    });

    it('derives key from x-forwarded-for header when sessionUser is missing', () => {
      const mockReq = {
        headers: {
          'x-forwarded-for': '203.0.113.195, 70.41.3.18',
        },
      } as unknown as Request;

      const key = defaultRateLimitKey(mockReq);
      assert.equal(key, 'ip:203.0.113.195');
    });

    it('falls back to req.ip when x-forwarded-for is missing', () => {
      const mockReq = {
        headers: {},
        ip: '198.51.100.42',
      } as unknown as Request;

      const key = defaultRateLimitKey(mockReq);
      assert.equal(key, 'ip:198.51.100.42');
    });

    it('falls back to socket address or unknown when ip is absent', () => {
      const mockReq = {
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request;

      const key = defaultRateLimitKey(mockReq);
      assert.equal(key, 'ip:127.0.0.1');

      const mockUnknown = {
        headers: {},
        socket: {},
      } as unknown as Request;

      assert.equal(defaultRateLimitKey(mockUnknown), 'ip:unknown');
    });
  });

  describe('HTTP enforcement', () => {
    it('allows requests under the configured limit', async () => {
      for (let i = 1; i <= 3; i++) {
        const response = await fetch(`${baseUrl}/test/limited`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Test-User-Id': '1001',
          },
        });
        assert.equal(response.status, 200);
        const data = (await response.json()) as { ok: boolean; count: number };
        assert.equal(data.ok, true);
        assert.equal(data.count, i);
      }
      assert.equal(businessLogicCalledCount, 3);
    });

    it('returns 429 with retry headers and stops business logic when limit is exceeded', async () => {
      for (let i = 0; i < 3; i++) {
        const res = await fetch(`${baseUrl}/test/limited`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Test-User-Id': '1002',
          },
        });
        assert.equal(res.status, 200);
      }
      assert.equal(businessLogicCalledCount, 3);

      const blockedResponse = await fetch(`${baseUrl}/test/limited`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Test-User-Id': '1002',
        },
      });

      assert.equal(blockedResponse.status, 429);
      assert.equal(businessLogicCalledCount, 3);

      const retryHeader = blockedResponse.headers.get('Retry-After');
      assert.ok(retryHeader !== null);
      assert.ok(Number(retryHeader) >= 1);

      const body = (await blockedResponse.json()) as {
        error: string;
        message: string;
        retryAfter: number;
      };
      assert.equal(body.error, 'Too Many Requests');
      assert.ok(body.message.includes('test_limited'));
      assert.ok(body.retryAfter >= 1);
    });

    it('isolates rate limits between different users', async () => {
      for (let i = 0; i < 3; i++) {
        const res = await fetch(`${baseUrl}/test/limited`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Test-User-Id': '2001',
          },
        });
        assert.equal(res.status, 200);
      }

      const user1Blocked = await fetch(`${baseUrl}/test/limited`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Test-User-Id': '2001',
        },
      });
      assert.equal(user1Blocked.status, 429);

      const user2Response = await fetch(`${baseUrl}/test/limited`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Test-User-Id': '2002',
        },
      });
      assert.equal(user2Response.status, 200);
    });

    it('isolates limits across different endpoints for the same user', async () => {
      for (let i = 0; i < 3; i++) {
        const res = await fetch(`${baseUrl}/test/limited`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Test-User-Id': '3001',
          },
        });
        assert.equal(res.status, 200);
      }

      const blockedResponse = await fetch(`${baseUrl}/test/limited`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Test-User-Id': '3001',
        },
      });
      assert.equal(blockedResponse.status, 429);

      const otherEndpointResponse = await fetch(`${baseUrl}/test/independent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Test-User-Id': '3001',
        },
      });
      assert.equal(otherEndpointResponse.status, 200);
      const otherData = (await otherEndpointResponse.json()) as { ok: boolean; endpoint: string };
      assert.equal(otherData.ok, true);
      assert.equal(otherData.endpoint, 'independent');
    });

    it('enforces limits by IP for unauthenticated requests', async () => {
      for (let i = 0; i < 3; i++) {
        const res = await fetch(`${baseUrl}/test/limited`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': '198.51.100.1',
          },
        });
        assert.equal(res.status, 200);
      }

      const ip1Blocked = await fetch(`${baseUrl}/test/limited`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '198.51.100.1',
        },
      });
      assert.equal(ip1Blocked.status, 429);

      const ip2Response = await fetch(`${baseUrl}/test/limited`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '198.51.100.2',
        },
      });
      assert.equal(ip2Response.status, 200);
    });

    it('respects custom keyFn when provided', async () => {
      for (let i = 0; i < 2; i++) {
        const res = await fetch(`${baseUrl}/test/custom-key`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Custom-Tenant': 'tenant-alpha',
          },
        });
        assert.equal(res.status, 200);
      }

      const alphaBlocked = await fetch(`${baseUrl}/test/custom-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Custom-Tenant': 'tenant-alpha',
        },
      });
      assert.equal(alphaBlocked.status, 429);

      const betaResponse = await fetch(`${baseUrl}/test/custom-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Custom-Tenant': 'tenant-beta',
        },
      });
      assert.equal(betaResponse.status, 200);
    });
  });
});
