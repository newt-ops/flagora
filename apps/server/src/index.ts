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
import { seedFlags } from './game/seedFlags.js';
import {
  getTopLeaderboard,
  getPlayerLeaderboardRank,
  reconcileLeaderboard,
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
import {
  sendTelegramMessage,
  editTelegramMessage,
  answerCallbackQuery,
  notifyReferralReward,
  type InlineKeyboardButton,
} from './telegram/telegramService.js';
import {
  requestBonusCoinsIntent,
  redeemBonusCoins,
  getStreakStatus,
  requestStreakSaveIntent,
  redeemStreakSave,
  StreakNotAtRiskError,
  RewardCapReachedError,
  RewardTokenError,
  UnauthorizedTokenRedemptionError,
  ExpiredRewardTokenError,
  RewardTokenAlreadyRedeemedError,
  RewardTypeMismatchError,
  InvalidRewardTokenError,
} from './rewards/index.js';
import { getDisplayName, type PlayerProfile } from '@flagora/shared';

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
    const seedResult = await seedFlags(db);
    process.stdout.write(`Seeded flags collection (${seedResult.total} total flags)\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown database error';
    process.stderr.write(`Fatal: Failed to connect or initialize MongoDB: ${message}\n`);
    process.exit(1);
  }

  let redis;
  try {
    redis = await initRedis(redisUrl!);
    process.stdout.write('Redis initialized successfully\n');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Redis error';
    process.stderr.write(`Fatal: Failed to connect to Redis: ${message}\n`);
    process.exit(1);
  }

  reconcileLeaderboard(db, redis).catch((error) => {
    const message = error instanceof Error ? error.message : 'Reconciliation error';
    process.stderr.write(`Warning: Failed to reconcile leaderboard: ${message}\n`);
  });

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

      const { continent, flagCount, durationSeconds } = req.body ?? {};
      const parsedFlagCount = typeof flagCount === 'number' && flagCount > 0 ? flagCount : undefined;
      const parsedDuration = typeof durationSeconds === 'number' && durationSeconds > 0 ? durationSeconds : undefined;
      const run = await createRun(telegramUserId, db, {
        continent,
        flagCount: parsedFlagCount,
        durationSeconds: parsedDuration,
        mode: continent || parsedFlagCount || parsedDuration ? 'custom' : 'practice',
      });
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
      const result = await finishRun(id, telegramUserId, db, redis, io);
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

      const rankInfo = await getPlayerLeaderboardRank(telegramUserId, redis, undefined, db);
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

  app.post(
    '/api/rewards/bonus-coins/intent',
    sessionMiddleware,
    async (req: AuthenticatedSessionRequest, res) => {
      try {
        const telegramUserId = req.sessionUser?.telegramUserId;
        if (!telegramUserId) {
          res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
          return;
        }

        const result = await requestBonusCoinsIntent(telegramUserId, { redis });
        res.status(200).json(result);
      } catch (error) {
        if (error instanceof RewardCapReachedError) {
          res.status(429).json({
            ok: false,
            error: 'Daily cap reached',
            message: error.message,
            dailyCap: error.dailyCap,
            usedCount: error.usedCount,
            resetAtUtc: error.resetAtUtc,
          });
          return;
        }
        const message = error instanceof Error ? error.message : 'Failed to create reward intent';
        res.status(500).json({ error: 'Internal server error', message });
      }
    },
  );

  app.post(
    '/api/rewards/bonus-coins/redeem',
    sessionMiddleware,
    async (req: AuthenticatedSessionRequest, res) => {
      try {
        const telegramUserId = req.sessionUser?.telegramUserId;
        if (!telegramUserId) {
          res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
          return;
        }

        const { token } = req.body || {};
        if (!token || typeof token !== 'string' || token.trim() === '') {
          res.status(400).json({ error: 'Missing token', message: 'Reward token is required' });
          return;
        }

        const result = await redeemBonusCoins(token, telegramUserId, db, { redis });
        res.status(200).json(result);
      } catch (error) {
        if (error instanceof UnauthorizedTokenRedemptionError) {
          res.status(403).json({ error: 'Forbidden', message: error.message });
          return;
        }
        if (error instanceof ExpiredRewardTokenError) {
          res.status(400).json({ error: 'Token expired', message: error.message });
          return;
        }
        if (error instanceof RewardTokenAlreadyRedeemedError) {
          res.status(400).json({ error: 'Token already redeemed', message: error.message });
          return;
        }
        if (error instanceof RewardTypeMismatchError) {
          res.status(400).json({ error: 'Type mismatch', message: error.message });
          return;
        }
        if (error instanceof InvalidRewardTokenError) {
          res.status(400).json({ error: 'Invalid token', message: error.message });
          return;
        }
        if (error instanceof RewardTokenError) {
          res.status(400).json({ error: 'Invalid reward token', message: error.message });
          return;
        }
        const message = error instanceof Error ? error.message : 'Failed to redeem reward token';
        res.status(500).json({ error: 'Internal server error', message });
      }
    },
  );

  app.get(
    '/api/streak/status',
    sessionMiddleware,
    async (req: AuthenticatedSessionRequest, res) => {
      try {
        const telegramUserId = req.sessionUser?.telegramUserId;
        if (!telegramUserId) {
          res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
          return;
        }

        const result = await getStreakStatus(telegramUserId, db);
        res.status(200).json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch streak status';
        res.status(500).json({ error: 'Internal server error', message });
      }
    },
  );

  app.post(
    '/api/rewards/streak-save/intent',
    sessionMiddleware,
    async (req: AuthenticatedSessionRequest, res) => {
      try {
        const telegramUserId = req.sessionUser?.telegramUserId;
        if (!telegramUserId) {
          res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
          return;
        }

        const result = await requestStreakSaveIntent(telegramUserId, db, { redis });
        res.status(200).json(result);
      } catch (error) {
        if (error instanceof StreakNotAtRiskError) {
          res.status(400).json({ error: 'Streak not at risk', message: error.message });
          return;
        }
        if (error instanceof RewardCapReachedError) {
          res.status(429).json({
            ok: false,
            error: 'Daily cap reached',
            message: error.message,
            dailyCap: error.dailyCap,
            usedCount: error.usedCount,
            resetAtUtc: error.resetAtUtc,
          });
          return;
        }
        const message = error instanceof Error ? error.message : 'Failed to create streak save intent';
        res.status(500).json({ error: 'Internal server error', message });
      }
    },
  );

  app.post(
    '/api/rewards/streak-save/redeem',
    sessionMiddleware,
    async (req: AuthenticatedSessionRequest, res) => {
      try {
        const telegramUserId = req.sessionUser?.telegramUserId;
        if (!telegramUserId) {
          res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
          return;
        }

        const { token } = req.body || {};
        if (!token || typeof token !== 'string' || token.trim() === '') {
          res.status(400).json({ error: 'Missing token', message: 'Reward token is required' });
          return;
        }

        const result = await redeemStreakSave(token, telegramUserId, db, { redis });
        res.status(200).json(result);
      } catch (error) {
        if (error instanceof StreakNotAtRiskError) {
          res.status(400).json({ error: 'Streak not at risk', message: error.message });
          return;
        }
        if (error instanceof UnauthorizedTokenRedemptionError) {
          res.status(403).json({ error: 'Forbidden', message: error.message });
          return;
        }
        if (error instanceof ExpiredRewardTokenError) {
          res.status(400).json({ error: 'Token expired', message: error.message });
          return;
        }
        if (error instanceof RewardTokenAlreadyRedeemedError) {
          res.status(400).json({ error: 'Token already redeemed', message: error.message });
          return;
        }
        if (error instanceof RewardTypeMismatchError) {
          res.status(400).json({ error: 'Type mismatch', message: error.message });
          return;
        }
        if (error instanceof InvalidRewardTokenError) {
          res.status(400).json({ error: 'Invalid token', message: error.message });
          return;
        }
        if (error instanceof RewardTokenError) {
          res.status(400).json({ error: 'Invalid reward token', message: error.message });
          return;
        }
        const message = error instanceof Error ? error.message : 'Failed to redeem streak save';
        res.status(500).json({ error: 'Internal server error', message });
      }
    },
  );

  app.post('/api/telegram/webhook', async (req, res) => {
    res.status(200).json({ ok: true });
    try {
      const update = req.body;
      const rawUsername =
        process.env.TELEGRAM_BOT_USERNAME || process.env.BOT_USERNAME || 'flagora_bot';
      const cleanUsername = rawUsername.replace(/^@/, '');
      const frontendUrl =
        process.env.CLIENT_URL ||
        process.env.FRONTEND_URL ||
        'https://flagora-delta.vercel.app';

      if (update?.callback_query) {
        const callbackQuery = update.callback_query;
        const data = callbackQuery.data;
        const msg = callbackQuery.message;
        const fromUser = callbackQuery.from;
        const chatId = msg?.chat?.id;
        const messageId = msg?.message_id;

        if (callbackQuery.id) {
          void answerCallbackQuery(callbackQuery.id);
        }

        if (!chatId || !messageId) {
          return;
        }

        const mainMenuKeyboard: InlineKeyboardButton[][] = [
          [{ text: '🚀 Launch Flagora', web_app: { url: frontendUrl } }],
          [
            { text: '🎮 Game Modes', callback_data: 'menu_play' },
            { text: '📊 My Stats', callback_data: 'menu_stats' },
          ],
          [
            { text: '🏆 Leaderboard', callback_data: 'menu_leaderboard' },
            { text: '🎁 Invite (+100 🪙)', callback_data: 'menu_invite' },
          ],
          [{ text: '❓ How to Play', callback_data: 'menu_help' }],
        ];

        if (data === 'menu_main') {
          const welcomeText = `🌍 <b>Welcome to Flagora!</b> 🚩\n\nTest your geography knowledge across 194 flags! Guess countries, beat streaks, and battle live opponents.\n\nChoose an option below:`;
          await editTelegramMessage({
            chatId,
            messageId,
            text: welcomeText,
            parseMode: 'HTML',
            inlineKeyboard: mainMenuKeyboard,
          });
        } else if (data === 'menu_play') {
          const playText = `🎮 <b>Flagora Game Modes:</b>\n\n• <b>Solo Run:</b> 10 flags, 60s timer, combo multipliers\n• <b>Daily Challenge:</b> Same flag set for all players daily\n• <b>Live Battle:</b> Real-time 1v1 flag duel with live score syncing\n• <b>Custom Mode:</b> Pick your continent, flag count & custom time!\n\nTap below to play:`;
          await editTelegramMessage({
            chatId,
            messageId,
            text: playText,
            parseMode: 'HTML',
            inlineKeyboard: [
              [{ text: '🚀 Play Now', web_app: { url: frontendUrl } }],
              [{ text: '« Back to Menu', callback_data: 'menu_main' }],
            ],
          });
        } else if (data === 'menu_stats') {
          const profile = await db
            .collection<PlayerProfile>('profiles')
            .findOne({ telegramUserId: Number(fromUser.id) });
          const statsText = profile
            ? `📊 <b>Your Flagora Stats:</b>\n\n👤 <b>Name:</b> ${getDisplayName(profile)}\n⭐ <b>Level:</b> ${profile.level}\n✨ <b>XP:</b> ${profile.xp}\n🪙 <b>Coins:</b> ${profile.coins}\n🔥 <b>Current Streak:</b> ${profile.currentStreak} days\n🏆 <b>Best Score:</b> ${profile.bestScore}\n🎮 <b>Games Played:</b> ${profile.gamesPlayed}\n👥 <b>Friends Invited:</b> ${profile.referralCount ?? 0}`
            : `📊 <b>Your Flagora Stats:</b>\n\nYou haven't played yet! Tap Launch Flagora to start your journey.`;
          await editTelegramMessage({
            chatId,
            messageId,
            text: statsText,
            parseMode: 'HTML',
            inlineKeyboard: [
              [{ text: '🚀 Open Flagora', web_app: { url: frontendUrl } }],
              [{ text: '« Back to Menu', callback_data: 'menu_main' }],
            ],
          });
        } else if (data === 'menu_leaderboard') {
          const topPlayers = await db
            .collection<PlayerProfile>('profiles')
            .find()
            .sort({ bestScore: -1 })
            .limit(5)
            .toArray();
          let lbText = `🏆 <b>Flagora Top Players:</b>\n\n`;
          if (topPlayers.length === 0) {
            lbText += `No records yet. Be the first to reach the top!\n`;
          } else {
            topPlayers.forEach((p, i) => {
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
              lbText += `${medal} <b>${getDisplayName(p)}</b> — ${p.bestScore} pts (Lvl ${p.level})\n`;
            });
          }
          lbText += `\nClimb the ranks in Daily Challenges and Solo Runs!`;
          await editTelegramMessage({
            chatId,
            messageId,
            text: lbText,
            parseMode: 'HTML',
            inlineKeyboard: [
              [
                {
                  text: '🚀 View Full Leaderboard',
                  web_app: { url: `${frontendUrl}#leaderboard` },
                },
              ],
              [{ text: '« Back to Menu', callback_data: 'menu_main' }],
            ],
          });
        } else if (data === 'menu_invite') {
          const inviteLink = `https://t.me/${cleanUsername}?start=ref_${fromUser.id}`;
          const shareText = encodeURIComponent(
            'Join me on Flagora and test your flag knowledge in live battles! 🚩🌍',
          );
          const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${shareText}`;
          const inviteText = `🎁 <b>Invite Friends & Earn Rewards!</b>\n\nInvite your friends to Flagora and earn <b>+100 Coins</b> 🪙 for each friend who joins!\nYour friend also gets a <b>+50 Coin</b> welcome bonus.\n\n🔗 <b>Your Personal Invite Link:</b>\n<code>${inviteLink}</code>`;
          await editTelegramMessage({
            chatId,
            messageId,
            text: inviteText,
            parseMode: 'HTML',
            inlineKeyboard: [
              [{ text: '📤 Share to Telegram', url: shareUrl }],
              [{ text: '« Back to Menu', callback_data: 'menu_main' }],
            ],
          });
        } else if (data === 'menu_help') {
          const helpText = `❓ <b>How to Play Flagora:</b>\n\n1. <b>Identify the Flag:</b> Look at the country flag shown.\n2. <b>Select Country:</b> Pick the correct name among 4 options.\n3. <b>Build Combos:</b> Fast consecutive correct answers earn multiplier points!\n4. <b>Live Battles:</b> 1v1 real-time flag duel against friends or random opponents.\n\nHave fun and explore the world! 🚩`;
          await editTelegramMessage({
            chatId,
            messageId,
            text: helpText,
            parseMode: 'HTML',
            inlineKeyboard: [
              [{ text: '🚀 Start Playing', web_app: { url: frontendUrl } }],
              [{ text: '« Back to Menu', callback_data: 'menu_main' }],
            ],
          });
        }
        return;
      }

      const message = update?.message;
      if (message?.text && typeof message.text === 'string') {
        const chatId = Number(message.chat.id);
        const text = message.text.trim();
        const parts = text.split(/\s+/);
        const command = parts[0];
        const startParam = parts[1];

        if (command === '/start') {
          if (startParam && startParam.startsWith('ref_')) {
            const refUserId = Number(startParam.replace(/^ref_/, ''));
            if (refUserId && refUserId !== chatId) {
              const existingProfile = await db
                .collection<PlayerProfile>('profiles')
                .findOne({ telegramUserId: chatId });
              if (!existingProfile || !existingProfile.referredBy) {
                await db
                  .collection<PlayerProfile>('profiles')
                  .updateOne(
                    { telegramUserId: refUserId },
                    { $inc: { coins: 100, referralCount: 1 } },
                  );
                void notifyReferralReward(
                  refUserId,
                  message.from?.first_name || 'A friend',
                  db,
                );
                if (existingProfile) {
                  await db
                    .collection<PlayerProfile>('profiles')
                    .updateOne(
                      { telegramUserId: chatId },
                      { $set: { referredBy: refUserId }, $inc: { coins: 50 } },
                    );
                }
              }
            }
          }

          const webAppUrl = startParam
            ? `${frontendUrl}?startapp=${encodeURIComponent(startParam)}`
            : frontendUrl;

          const welcomeText = `🌍 <b>Welcome to Flagora!</b> 🚩\n\nTest your geography knowledge across 194 flags! Guess countries, beat streaks, and battle live opponents.\n\nChoose an option below:`;

          const startKeyboard: InlineKeyboardButton[][] = [
            [{ text: '🚀 Launch Flagora', web_app: { url: webAppUrl } }],
            [
              { text: '🎮 Game Modes', callback_data: 'menu_play' },
              { text: '📊 My Stats', callback_data: 'menu_stats' },
            ],
            [
              { text: '🏆 Leaderboard', callback_data: 'menu_leaderboard' },
              { text: '🎁 Invite (+100 🪙)', callback_data: 'menu_invite' },
            ],
            [{ text: '❓ How to Play', callback_data: 'menu_help' }],
          ];

          await sendTelegramMessage({
            chatId,
            text: welcomeText,
            parseMode: 'HTML',
            inlineKeyboard: startKeyboard,
          });
        }
      }
    } catch {
      void 0;
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
