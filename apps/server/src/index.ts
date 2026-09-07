import http from 'node:http';
import dotenv from 'dotenv';
import express from 'express';
import { initSocketServer } from './multiplayer/socketServer.js';
import { createTelegramAuthMiddleware } from './auth/middleware.js';
import type { AuthenticatedRequest } from './auth/types.js';
import { initDatabase } from './db/mongo.js';
import { initRedis } from './db/redis.js';
import { findOrCreatePlayerProfile, getPlayerProfileByUserId } from './profile/profileService.js';
import {
  createRequireSessionMiddleware,
  type AuthenticatedSessionRequest,
} from './session/requireSession.js';
import { createSessionToken } from './session/tokens.js';
import { createRun, submitAnswer, finishRun } from './game/runService.js';
import {
  getTopLeaderboard,
  getPlayerLeaderboardRank,
} from './leaderboard/leaderboardService.js';
import {
  RunNotFoundError,
  UnauthorizedRunAccessError,
  RunAlreadyFinishedError,
  FlagAlreadyAnsweredError,
  TimeExpiredError,
  InvalidFlagIndexError,
} from './game/runTypes.js';
import {
  startDailyChallenge,
  getDailyChallengeStatus,
  getDailyLeaderboard,
} from './daily/dailyService.js';
import { DailyChallengeAlreadyAttemptedError } from './daily/dailyTypes.js';
import {
  createChallenge,
  getChallengeInfo,
  acceptChallenge,
  rematchChallenge,
} from './challenge/challengeService.js';
import {
  ChallengeNotFoundError,
  ChallengeExpiredError,
  ChallengeAlreadyCompletedError,
  ChallengeNotCompletedError,
  SelfChallengeNotAllowedError,
  ChallengeAlreadyAcceptedError,
  UnauthorizedChallengeAccessError,
} from './challenge/challengeTypes.js';
import {
  createBattle,
  getBattleInfo,
  joinBattle,
} from './battle/battleService.js';
import {
  BattleNotFoundError,
  BattleExpiredError,
  SelfBattleNotAllowedError,
  BattleAlreadyJoinedError,
} from './battle/battleTypes.js';

dotenv.config();

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const mongoUri = process.env.MONGODB_URI;
const sessionSecret = process.env.SESSION_SECRET;
const redisUrl = process.env.REDIS_URL;

if (!botToken || !mongoUri || !sessionSecret || !redisUrl) {
  process.stderr.write(
    'Fatal: TELEGRAM_BOT_TOKEN, MONGODB_URI, SESSION_SECRET, and REDIS_URL environment variables are required.\n',
  );
  process.exit(1);
}

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Telegram-Init-Data');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

async function bootstrap() {
  let db;
  try {
    db = await initDatabase(mongoUri!);
    process.stdout.write('Connected to MongoDB successfully\n');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown database error';
    process.stderr.write(`Fatal: Failed to connect to MongoDB: ${message}\n`);
    process.exit(1);
  }

  let redis;
  try {
    redis = await initRedis(redisUrl!);
    process.stdout.write('Connected to Redis successfully\n');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Redis error';
    process.stderr.write(`Fatal: Failed to connect to Redis: ${message}\n`);
    process.exit(1);
  }

  const authMiddleware = createTelegramAuthMiddleware(botToken!);
  const sessionMiddleware = createRequireSessionMiddleware(sessionSecret!);

  const httpServer = http.createServer(app);
  const io = initSocketServer(httpServer, sessionSecret!, db);

  app.post('/api/session', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.telegramUser;
      if (!user) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing authenticated user' });
        return;
      }

      const profile = await findOrCreatePlayerProfile(user, db);
      const sessionToken = createSessionToken(profile.telegramUserId, sessionSecret!);

      res.status(200).json({ sessionToken, profile });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Session creation failed';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.get('/api/profile/me', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
    try {
      const telegramUserId = req.sessionUser?.telegramUserId;
      if (!telegramUserId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
        return;
      }

      const profile = await getPlayerProfileByUserId(telegramUserId, db);
      if (!profile) {
        res.status(404).json({ error: 'Not found', message: 'Profile not found' });
        return;
      }

      res.status(200).json({ profile });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch profile';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.post('/api/runs/start', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
    try {
      const telegramUserId = req.sessionUser?.telegramUserId;
      if (!telegramUserId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
        return;
      }

      const run = await createRun(telegramUserId, db);
      res.status(200).json(run);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start run';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.post('/api/runs/:id/answer', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
    try {
      const telegramUserId = req.sessionUser?.telegramUserId;
      if (!telegramUserId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
        return;
      }

      const id = String(req.params.id);
      const { flagIndex, selectedIsoCode } = req.body;

      if (typeof flagIndex !== 'number' || typeof selectedIsoCode !== 'string') {
        res.status(400).json({
          error: 'Bad request',
          message: 'flagIndex (number) and selectedIsoCode (string) are required',
        });
        return;
      }

      const result = await submitAnswer(id, telegramUserId, flagIndex, selectedIsoCode, db);
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof RunNotFoundError) {
        res.status(404).json({ error: 'Not found', message: error.message });
        return;
      }
      if (error instanceof UnauthorizedRunAccessError) {
        res.status(403).json({ error: 'Forbidden', message: error.message });
        return;
      }
      if (error instanceof TimeExpiredError) {
        res.status(400).json({ error: 'Time expired', message: error.message, timeExpired: true });
        return;
      }
      if (
        error instanceof RunAlreadyFinishedError ||
        error instanceof FlagAlreadyAnsweredError ||
        error instanceof InvalidFlagIndexError
      ) {
        res.status(400).json({ error: 'Bad request', message: error.message });
        return;
      }

      const message = error instanceof Error ? error.message : 'Answer submission failed';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.post('/api/runs/:id/finish', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
    try {
      const telegramUserId = req.sessionUser?.telegramUserId;
      if (!telegramUserId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
        return;
      }

      const id = String(req.params.id);
      const result = await finishRun(id, telegramUserId, db, redis);
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof RunNotFoundError) {
        res.status(404).json({ error: 'Not found', message: error.message });
        return;
      }
      if (error instanceof UnauthorizedRunAccessError) {
        res.status(403).json({ error: 'Forbidden', message: error.message });
        return;
      }

      const message = error instanceof Error ? error.message : 'Failed to finish run';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.get('/api/leaderboard/top', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
    try {
      const rawLimit = Number(req.query.limit);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 50;
      const entries = await getTopLeaderboard(limit, db, redis);
      res.status(200).json(entries);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch leaderboard';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.get('/api/leaderboard/me', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
    try {
      const telegramUserId = req.sessionUser?.telegramUserId;
      if (!telegramUserId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
        return;
      }

      const rankInfo = await getPlayerLeaderboardRank(telegramUserId, redis);
      res.status(200).json(rankInfo);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch player rank';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.post('/api/daily/start', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
    try {
      const telegramUserId = req.sessionUser?.telegramUserId;
      if (!telegramUserId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
        return;
      }

      const run = await startDailyChallenge(telegramUserId, db);
      res.status(200).json(run);
    } catch (error) {
      if (error instanceof DailyChallengeAlreadyAttemptedError) {
        res.status(400).json({ error: 'Already attempted', message: error.message });
        return;
      }
      const message = error instanceof Error ? error.message : 'Failed to start daily challenge';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.get('/api/daily/status', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
    try {
      const telegramUserId = req.sessionUser?.telegramUserId;
      if (!telegramUserId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
        return;
      }

      const status = await getDailyChallengeStatus(telegramUserId, db);
      res.status(200).json(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get daily challenge status';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.get('/api/daily/leaderboard', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
    try {
      const telegramUserId = req.sessionUser?.telegramUserId;
      if (!telegramUserId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
        return;
      }

      const rawLimit = Number(req.query.limit);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 50;
      const result = await getDailyLeaderboard(telegramUserId, db, redis, undefined, limit);
      res.status(200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch daily leaderboard';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.post('/api/challenges', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
    try {
      const telegramUserId = req.sessionUser?.telegramUserId;
      if (!telegramUserId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
        return;
      }

      const challenge = await createChallenge(telegramUserId, db);
      res.status(200).json(challenge);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create challenge';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.get('/api/challenges/:id', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
    try {
      const telegramUserId = req.sessionUser?.telegramUserId;
      if (!telegramUserId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
        return;
      }

      const id = String(req.params.id);
      const info = await getChallengeInfo(id, telegramUserId, db);
      res.status(200).json(info);
    } catch (error) {
      if (error instanceof ChallengeNotFoundError) {
        res.status(404).json({ error: 'Not found', message: error.message });
        return;
      }
      const message = error instanceof Error ? error.message : 'Failed to fetch challenge info';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.post('/api/challenges/:id/accept', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
    try {
      const telegramUserId = req.sessionUser?.telegramUserId;
      if (!telegramUserId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
        return;
      }

      const id = String(req.params.id);
      const run = await acceptChallenge(id, telegramUserId, db);
      res.status(200).json(run);
    } catch (error) {
      if (error instanceof ChallengeNotFoundError) {
        res.status(404).json({ error: 'Not found', message: error.message });
        return;
      }
      if (error instanceof ChallengeExpiredError) {
        res.status(400).json({ error: 'Challenge expired', message: error.message });
        return;
      }
      if (error instanceof ChallengeAlreadyCompletedError) {
        res.status(400).json({ error: 'Challenge completed', message: error.message });
        return;
      }
      if (error instanceof SelfChallengeNotAllowedError) {
        res.status(400).json({ error: 'Self challenge not allowed', message: error.message });
        return;
      }
      if (error instanceof ChallengeAlreadyAcceptedError) {
        res.status(400).json({ error: 'Challenge already accepted', message: error.message });
        return;
      }
      const message = error instanceof Error ? error.message : 'Failed to accept challenge';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.post('/api/challenges/:id/rematch', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
    try {
      const telegramUserId = req.sessionUser?.telegramUserId;
      if (!telegramUserId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
        return;
      }

      const id = String(req.params.id);
      const challenge = await rematchChallenge(id, telegramUserId, db);
      res.status(200).json(challenge);
    } catch (error) {
      if (error instanceof ChallengeNotFoundError) {
        res.status(404).json({ error: 'Not found', message: error.message });
        return;
      }
      if (error instanceof ChallengeNotCompletedError) {
        res.status(400).json({ error: 'Challenge not completed', message: error.message });
        return;
      }
      if (error instanceof UnauthorizedChallengeAccessError) {
        res.status(403).json({ error: 'Forbidden', message: error.message });
        return;
      }
      const message = error instanceof Error ? error.message : 'Failed to create rematch';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.post('/api/battles', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
    try {
      const telegramUserId = req.sessionUser?.telegramUserId;
      if (!telegramUserId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
        return;
      }

      const battle = await createBattle(telegramUserId, db);
      res.status(200).json(battle);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create battle';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.get('/api/battles/:id', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
    try {
      const telegramUserId = req.sessionUser?.telegramUserId;
      if (!telegramUserId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
        return;
      }

      const id = String(req.params.id);
      const battleInfo = await getBattleInfo(id, telegramUserId, db);
      res.status(200).json(battleInfo);
    } catch (error) {
      if (error instanceof BattleNotFoundError) {
        res.status(404).json({ error: 'Not found', message: error.message });
        return;
      }
      const message = error instanceof Error ? error.message : 'Failed to get battle info';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.post('/api/battles/:id/join', sessionMiddleware, async (req: AuthenticatedSessionRequest, res) => {
    try {
      const telegramUserId = req.sessionUser?.telegramUserId;
      if (!telegramUserId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
        return;
      }

      const id = String(req.params.id);
      const result = await joinBattle(id, telegramUserId, db, io);
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof BattleNotFoundError) {
        res.status(404).json({ error: 'Not found', message: error.message });
        return;
      }
      if (error instanceof BattleExpiredError) {
        res.status(400).json({ error: 'Battle expired', message: error.message });
        return;
      }
      if (error instanceof SelfBattleNotAllowedError) {
        res.status(400).json({ error: 'Self battle not allowed', message: error.message });
        return;
      }
      if (error instanceof BattleAlreadyJoinedError) {
        res.status(400).json({ error: 'Battle already joined', message: error.message });
        return;
      }
      const message = error instanceof Error ? error.message : 'Failed to join battle';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  httpServer.listen(port, () => {
    process.stdout.write(`Server listening on port ${port}\n`);
  });
}

bootstrap().catch((error) => {
  const message = error instanceof Error ? error.message : 'Bootstrap error';
  process.stderr.write(`Fatal error during startup: ${message}\n`);
  process.exit(1);
});
