import type { Response, NextFunction } from 'express';
import { validateInitData } from './validateInitData.js';
import { InitDataError, type AuthenticatedRequest } from './types.js';

export function createTelegramAuthMiddleware(botToken: string, maxAgeSeconds = 900) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const rawHeader = req.header('X-Telegram-Init-Data');

    if (!rawHeader) {
      process.stdout.write('[Auth] Validation failed: Missing X-Telegram-Init-Data header\n');
      res.status(401).json({ error: 'Unauthorized', message: 'Missing initData header' });
      return;
    }

    try {
      const validated = validateInitData(rawHeader, botToken, maxAgeSeconds);
      req.telegramUser = validated.user;
      process.stdout.write(`[Auth] Validated Telegram user ID: ${validated.user.id}\n`);
      next();
    } catch (error) {
      const message = error instanceof InitDataError ? error.message : 'Invalid initData';
      process.stdout.write(`[Auth] Validation failed: ${message}\n`);
      res.status(401).json({ error: 'Unauthorized', message });
    }
  };
}
