import type { Request, Response, NextFunction } from 'express';
import { SessionError, verifySessionToken, type SessionPayload } from './tokens.js';

export interface AuthenticatedSessionRequest extends Request {
  sessionUser?: SessionPayload;
}

export function createRequireSessionMiddleware(sessionSecret: string) {
  return (req: AuthenticatedSessionRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.header('Authorization');

    if (!authHeader) {
      process.stdout.write('[Session] Authentication failed: Missing Authorization header\n');
      res.status(401).json({ error: 'Unauthorized', message: 'Missing Authorization header' });
      return;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      process.stdout.write(
        '[Session] Authentication failed: Invalid Authorization header format\n',
      );
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid token format' });
      return;
    }

    const token = parts[1];

    try {
      const payload = verifySessionToken(token, sessionSecret);
      req.sessionUser = payload;
      process.stdout.write(`[Session] Authenticated user ID: ${payload.telegramUserId}\n`);
      next();
    } catch (error) {
      const message = error instanceof SessionError ? error.message : 'Invalid session token';
      process.stdout.write(`[Session] Authentication failed: ${message}\n`);
      res.status(401).json({ error: 'Unauthorized', message });
    }
  };
}
