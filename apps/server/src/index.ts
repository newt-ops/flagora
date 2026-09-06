import dotenv from 'dotenv';
import express from 'express';
import { createTelegramAuthMiddleware } from './auth/middleware.js';
import type { AuthenticatedRequest } from './auth/types.js';

dotenv.config();

const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
  process.stderr.write('Fatal: TELEGRAM_BOT_TOKEN environment variable is not set.\n');
  process.exit(1);
}

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

const authMiddleware = createTelegramAuthMiddleware(botToken);

app.get('/api/me', authMiddleware, (req: AuthenticatedRequest, res) => {
  res.status(200).json({ user: req.telegramUser });
});

app.listen(port, () => {
  process.stdout.write(`Server listening on port ${port}\n`);
});
