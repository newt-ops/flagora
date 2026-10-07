import http from 'node:http';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import express from 'express';
import { initSocketServer } from './multiplayer/socketServer.js';
import { createTelegramAuthMiddleware } from './auth/middleware.js';
import type { AuthenticatedRequest } from './auth/types.js';
import { initDatabase, closeDatabase } from './db/mongo.js';
import { initRedis, closeRedis } from './db/redis.js';
import { initNotificationQueue, closeNotificationQueue } from './notifications/notificationQueue.js';
import { findOrCreatePlayerProfile, getPlayerProfileByUserId, updatePinnedFlags } from './profile/profileService.js';
import {
  createRequireSessionMiddleware,
  type AuthenticatedSessionRequest,
} from './session/requireSession.js';
import { createSessionToken } from './session/tokens.js';
import { createRun, submitAnswer, finishRun, getRunHistory } from './game/runService.js';
import { hasActiveSubscription } from './subscription/subscriptionService.js';
import { seedFlags } from './game/seedFlags.js';
import { initFlagCache, reloadFlagCache } from './game/flagCache.js';
import { initCosmeticCache, reloadCosmeticCache } from './shop/cosmeticCache.js';
import { seedCosmetics } from './shop/seedCosmetics.js';
import {
  getShopCatalog,
  purchaseCosmeticItem,
  equipCosmeticItem,
} from './shop/shopService.js';
import {
  CosmeticItemNotFoundError,
  ItemAlreadyOwnedError,
  InsufficientPinsError,
  ItemNotOwnedError,
  RequiresProSubscriptionError,
} from './shop/shopTypes.js';
import { getRankStatus, getRankedLeaderboard } from './rank/rankService.js';
import { getPlayerBadges, initBadgeCollection } from './badge/badgeService.js';
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
  type InlineKeyboardButton,
} from './telegram/telegramService.js';
import {
  getStreakStatus,
  saveStreak,
  StreakNotAtRiskError,
  RewardCapReachedError,
  InsufficientPinsError as StreakInsufficientPinsError,
} from './rewards/index.js';
import { getDisplayName, type PlayerProfile } from '@flagora/shared';
import { rateLimit } from './middleware/rateLimit.js';
import {
  initReferralCollection,
  registerReferralSignup,
} from './referral/referralService.js';
import { proRouter } from './pro/proRoutes.js';
import { answerPreCheckoutQuery } from './telegram/telegramService.js';
import { processSuccessfulPayment } from './subscription/subscriptionService.js';

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

function timingSafeEqualStrings(a: string | undefined | null, b: string | undefined | null): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  const origin = req.headers.origin;
  const configuredClient = process.env.CLIENT_URL || process.env.FRONTEND_URL || 'https://flagora-delta.vercel.app';
  const allowedOrigins = new Set([
    configuredClient,
    'https://flagora-delta.vercel.app',
    'https://web.telegram.org',
    'https://webk.telegram.org',
    'https://webz.telegram.org',
  ]);

  if (origin) {
    const isLocalhost =
      process.env.NODE_ENV !== 'production' &&
      (/^https?:\/\/localhost(:\d+)?$/.test(origin) || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin));

    if (allowedOrigins.has(origin) || isLocalhost) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Telegram-Init-Data, X-Admin-Secret, X-Telegram-Bot-Api-Secret-Token',
  );

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
    await initFlagCache(db);
    const cosmeticSeedResult = await seedCosmetics(db);
    process.stdout.write(`Seeded cosmetics collection (${cosmeticSeedResult.total} total cosmetics)\n`);
    await initCosmeticCache(db);
    await initBadgeCollection(db);
    await initReferralCollection(db);
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

  try {
    await initNotificationQueue({ redisUrl: redisUrl! });
    process.stdout.write('Notification queue initialized successfully\n');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Queue error';
    process.stderr.write(`Warning: Failed to initialize notification queue: ${message}\n`);
  }

  reconcileLeaderboard(db, redis).catch((error) => {
    const message = error instanceof Error ? error.message : 'Reconciliation error';
    process.stderr.write(`Warning: Failed to reconcile leaderboard: ${message}\n`);
  });

  const authMiddleware = createTelegramAuthMiddleware(botToken!);
  const sessionMiddleware = createRequireSessionMiddleware(sessionSecret!);

  const httpServer = http.createServer(app);
  const io = initSocketServer(httpServer, sessionSecret!, db, { redis });

  app.use('/api/pro', sessionMiddleware, rateLimit({ endpoint: 'pro_routes', limit: 60, windowSeconds: 60 }), proRouter);

  app.post('/api/session', rateLimit({ endpoint: 'session', limit: 30, windowSeconds: 60 }), authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.telegramUser;
      if (!user) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing authenticated user' });
        return;
      }

      const profile = await findOrCreatePlayerProfile(user, db);
      const startParam =
        req.startParam ||
        (typeof req.query.startapp === 'string' ? req.query.startapp : undefined);
      if (startParam && startParam.startsWith('ref_')) {
        const inviterUserId = Number(startParam.replace(/^ref_/, ''));
        if (inviterUserId && inviterUserId !== profile.telegramUserId) {
          await registerReferralSignup(inviterUserId, profile.telegramUserId, db);
        }
      }
      const sessionToken = createSessionToken(profile.telegramUserId, sessionSecret!);

      res.status(200).json({ sessionToken, profile });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Session creation failed';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.get('/api/profile/me', sessionMiddleware, rateLimit({ endpoint: 'profile_me', limit: 120, windowSeconds: 60 }), async (req: AuthenticatedSessionRequest, res) => {
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

  app.post('/api/profile/pinned-flags', sessionMiddleware, rateLimit({ endpoint: 'profile_pinned_flags', limit: 30, windowSeconds: 60 }), async (req: AuthenticatedSessionRequest, res) => {
    try {
      const telegramUserId = req.sessionUser?.telegramUserId;
      if (!telegramUserId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
        return;
      }

      const { pinnedIsoCodes } = req.body ?? {};
      if (
        !Array.isArray(pinnedIsoCodes) ||
        pinnedIsoCodes.length > 10 ||
        pinnedIsoCodes.some((code) => typeof code !== 'string' || code.length !== 2)
      ) {
        res.status(400).json({ error: 'Bad request', message: 'pinnedIsoCodes must be an array of at most 10 2-letter country codes' });
        return;
      }

      const isPro = await hasActiveSubscription(telegramUserId, db);
      if (!isPro) {
        res.status(403).json({ error: 'Forbidden', message: 'Active Pro subscription required to pin flags' });
        return;
      }

      const updated = await updatePinnedFlags(telegramUserId, pinnedIsoCodes, db);
      res.status(200).json({ success: true, pinnedIsoCodes: updated.pinnedIsoCodes ?? [], profile: updated });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update pinned flags';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.get('/api/runs/history', sessionMiddleware, rateLimit({ endpoint: 'runs_history', limit: 60, windowSeconds: 60 }), async (req: AuthenticatedSessionRequest, res) => {
    try {
      const telegramUserId = req.sessionUser?.telegramUserId;
      if (!telegramUserId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
        return;
      }

      const rawPage = Number(req.query.page);
      const rawLimit = Number(req.query.limit);
      const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
      const limit = Math.min(Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 10, 50);

      const history = await getRunHistory(telegramUserId, db, { page, limit });
      res.status(200).json(history);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch run history';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.post('/api/runs/start', sessionMiddleware, rateLimit({ endpoint: 'run_start', limit: 30, windowSeconds: 60 }), async (req: AuthenticatedSessionRequest, res) => {
    try {
      const telegramUserId = req.sessionUser?.telegramUserId;
      if (!telegramUserId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
        return;
      }

      const { continent, flagCount, durationSeconds } = req.body ?? {};
      const parsedFlagCount =
        typeof flagCount === 'number' && flagCount > 0 ? Math.min(Math.floor(flagCount), 50) : undefined;
      const parsedDuration =
        typeof durationSeconds === 'number' && durationSeconds > 0
          ? Math.min(Math.floor(durationSeconds), 300)
          : undefined;
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

  app.post('/api/runs/:id/answer', sessionMiddleware, rateLimit({ endpoint: 'run_answer', limit: 60, windowSeconds: 60 }), async (req: AuthenticatedSessionRequest, res) => {
    try {
      const telegramUserId = req.sessionUser?.telegramUserId;
      if (!telegramUserId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
        return;
      }

      const id = String(req.params.id);
      const { flagIndex, selectedIsoCode } = req.body ?? {};

      if (
        typeof flagIndex !== 'number' ||
        !Number.isInteger(flagIndex) ||
        flagIndex < 0 ||
        flagIndex > 50 ||
        typeof selectedIsoCode !== 'string' ||
        selectedIsoCode.length !== 2
      ) {
        res.status(400).json({
          error: 'Bad request',
          message: 'flagIndex (integer 0-50) and selectedIsoCode (2-letter string) are required',
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

  app.post('/api/runs/:id/finish', sessionMiddleware, rateLimit({ endpoint: 'run_finish', limit: 30, windowSeconds: 60 }), async (req: AuthenticatedSessionRequest, res) => {
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

  app.get('/api/leaderboard/top', sessionMiddleware, rateLimit({ endpoint: 'leaderboard_top', limit: 60, windowSeconds: 60 }), async (req: AuthenticatedSessionRequest, res) => {
    try {
      const rawLimit = Number(req.query.limit);
      const limit = Math.min(Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 50, 100);
      const entries = await getTopLeaderboard(limit, db, redis);
      res.status(200).json(entries);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch leaderboard';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.get('/api/leaderboard/me', sessionMiddleware, rateLimit({ endpoint: 'leaderboard_me', limit: 60, windowSeconds: 60 }), async (req: AuthenticatedSessionRequest, res) => {
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

  app.post('/api/daily/start', sessionMiddleware, rateLimit({ endpoint: 'daily_start', limit: 30, windowSeconds: 60 }), async (req: AuthenticatedSessionRequest, res) => {
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

  app.get('/api/daily/status', sessionMiddleware, rateLimit({ endpoint: 'daily_status', limit: 60, windowSeconds: 60 }), async (req: AuthenticatedSessionRequest, res) => {
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

  app.get('/api/daily/leaderboard', sessionMiddleware, rateLimit({ endpoint: 'daily_leaderboard', limit: 60, windowSeconds: 60 }), async (req: AuthenticatedSessionRequest, res) => {
    try {
      const telegramUserId = req.sessionUser?.telegramUserId;
      if (!telegramUserId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
        return;
      }

      const rawLimit = Number(req.query.limit);
      const limit = Math.min(Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 50, 100);
      const result = await getDailyLeaderboard(telegramUserId, db, redis, undefined, limit);
      res.status(200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch daily leaderboard';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.post('/api/challenges', sessionMiddleware, rateLimit({ endpoint: 'challenge_create', limit: 30, windowSeconds: 60 }), async (req: AuthenticatedSessionRequest, res) => {
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

  app.get('/api/challenges/:id', sessionMiddleware, rateLimit({ endpoint: 'challenge_get', limit: 60, windowSeconds: 60 }), async (req: AuthenticatedSessionRequest, res) => {
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

  app.post('/api/challenges/:id/accept', sessionMiddleware, rateLimit({ endpoint: 'challenge_accept', limit: 30, windowSeconds: 60 }), async (req: AuthenticatedSessionRequest, res) => {
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

  app.post('/api/challenges/:id/rematch', sessionMiddleware, rateLimit({ endpoint: 'challenge_rematch', limit: 30, windowSeconds: 60 }), async (req: AuthenticatedSessionRequest, res) => {
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

  app.post('/api/battles', sessionMiddleware, rateLimit({ endpoint: 'battle_create', limit: 30, windowSeconds: 60 }), async (req: AuthenticatedSessionRequest, res) => {
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

  app.get('/api/battles/:id', sessionMiddleware, rateLimit({ endpoint: 'battle_get', limit: 60, windowSeconds: 60 }), async (req: AuthenticatedSessionRequest, res) => {
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

  app.post('/api/battles/:id/join', sessionMiddleware, rateLimit({ endpoint: 'battle_join', limit: 30, windowSeconds: 60 }), async (req: AuthenticatedSessionRequest, res) => {
    try {
      const telegramUserId = req.sessionUser?.telegramUserId;
      if (!telegramUserId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
        return;
      }

      const id = String(req.params.id);
      const result = await joinBattle(id, telegramUserId, db, io, redis);
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


  app.get(
    '/api/streak/status',
    sessionMiddleware,
    rateLimit({ endpoint: 'streak_status', limit: 60, windowSeconds: 60 }),
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
    '/api/streak/save',
    sessionMiddleware,
    rateLimit({ endpoint: 'streak_save', limit: 10, windowSeconds: 60 }),
    async (req: AuthenticatedSessionRequest, res) => {
      try {
        const telegramUserId = req.sessionUser?.telegramUserId;
        if (!telegramUserId) {
          res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
          return;
        }

        const result = await saveStreak(telegramUserId, db, { redis });
        res.status(200).json(result);
      } catch (error) {
        if (error instanceof StreakNotAtRiskError) {
          res.status(400).json({ error: 'Streak not at risk', message: error.message });
          return;
        }
        if (error instanceof StreakInsufficientPinsError) {
          res.status(400).json({ error: 'Insufficient pins', message: error.message });
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
        const message = error instanceof Error ? error.message : 'Failed to save streak';
        res.status(500).json({ error: 'Internal server error', message });
      }
    },
  );


  app.post('/api/admin/flags/reload', rateLimit({ endpoint: 'admin_flags_reload', limit: 10, windowSeconds: 60 }), async (req, res) => {
    try {
      const adminSecret = process.env.ADMIN_SECRET;
      const providedSecret = req.headers['x-admin-secret'];
      if (!adminSecret || typeof providedSecret !== 'string' || !timingSafeEqualStrings(providedSecret, adminSecret)) {
        res.status(403).json({ error: 'Forbidden', message: 'Invalid admin secret' });
        return;
      }
      const result = await reloadFlagCache(db);
      res.status(200).json({ ok: true, count: result.count });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reload flag cache';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.get('/api/shop/catalog', sessionMiddleware, rateLimit({ endpoint: 'shop_catalog', limit: 120, windowSeconds: 60 }), async (req: AuthenticatedSessionRequest, res) => {
    try {
      const telegramUserId = req.sessionUser?.telegramUserId;
      if (!telegramUserId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
        return;
      }

      const catalog = await getShopCatalog(telegramUserId, db);
      res.status(200).json(catalog);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch shop catalog';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.post('/api/shop/purchase', sessionMiddleware, rateLimit({ endpoint: 'shop_purchase', limit: 30, windowSeconds: 60 }), async (req: AuthenticatedSessionRequest, res) => {
    try {
      const telegramUserId = req.sessionUser?.telegramUserId;
      if (!telegramUserId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
        return;
      }

      const { itemId } = req.body ?? {};
      if (!itemId || typeof itemId !== 'string') {
        res.status(400).json({ error: 'Bad request', message: 'itemId (string) is required' });
        return;
      }

      const result = await purchaseCosmeticItem(telegramUserId, itemId, db);
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof CosmeticItemNotFoundError) {
        res.status(400).json({ error: 'Bad request', message: error.message });
        return;
      }
      if (error instanceof ItemAlreadyOwnedError) {
        res.status(400).json({ error: 'Already owned', message: error.message });
        return;
      }
      if (error instanceof InsufficientPinsError) {
        res.status(400).json({
          error: 'Insufficient pins',
          message: error.message,
          required: error.required,
          available: error.available,
        });
        return;
      }
      if (error instanceof RequiresProSubscriptionError) {
        res.status(403).json({ error: 'Requires Pro', message: error.message });
        return;
      }
      const message = error instanceof Error ? error.message : 'Failed to purchase cosmetic item';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.post('/api/shop/equip', sessionMiddleware, rateLimit({ endpoint: 'shop_equip', limit: 60, windowSeconds: 60 }), async (req: AuthenticatedSessionRequest, res) => {
    try {
      const telegramUserId = req.sessionUser?.telegramUserId;
      if (!telegramUserId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
        return;
      }

      const { itemId } = req.body ?? {};
      if (!itemId || typeof itemId !== 'string') {
        res.status(400).json({ error: 'Bad request', message: 'itemId (string) is required' });
        return;
      }

      const result = await equipCosmeticItem(telegramUserId, itemId, db);
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof CosmeticItemNotFoundError) {
        res.status(400).json({ error: 'Bad request', message: error.message });
        return;
      }
      if (error instanceof ItemNotOwnedError) {
        res.status(400).json({ error: 'Not owned', message: error.message });
        return;
      }
      if (error instanceof RequiresProSubscriptionError) {
        res.status(403).json({ error: 'Requires Pro', message: error.message });
        return;
      }
      const message = error instanceof Error ? error.message : 'Failed to equip cosmetic item';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.get('/api/rank/status', sessionMiddleware, rateLimit({ endpoint: 'rank_status', limit: 120, windowSeconds: 60 }), async (req: AuthenticatedSessionRequest, res) => {
    try {
      const telegramUserId = req.sessionUser?.telegramUserId;
      if (!telegramUserId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
        return;
      }

      const status = await getRankStatus(telegramUserId, db, redis);
      res.status(200).json(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch rank status';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.get('/api/rank/leaderboard', sessionMiddleware, rateLimit({ endpoint: 'rank_leaderboard', limit: 60, windowSeconds: 60 }), async (req: AuthenticatedSessionRequest, res) => {
    try {
      const telegramUserId = req.sessionUser?.telegramUserId;
      if (!telegramUserId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
        return;
      }

      const rawLimit = Number(req.query.limit);
      const limit = Math.min(Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 50, 100);
      const result = await getRankedLeaderboard(telegramUserId, db, redis, limit);
      res.status(200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch ranked leaderboard';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.get('/api/badges/me', sessionMiddleware, rateLimit({ endpoint: 'badges_me', limit: 120, windowSeconds: 60 }), async (req: AuthenticatedSessionRequest, res) => {
    try {
      const telegramUserId = req.sessionUser?.telegramUserId;
      if (!telegramUserId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
        return;
      }

      const badges = await getPlayerBadges(telegramUserId, db);
      res.status(200).json({ badges });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch badges';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.post('/api/admin/shop/reload', rateLimit({ endpoint: 'admin_shop_reload', limit: 10, windowSeconds: 60 }), async (req, res) => {
    try {
      const adminSecret = process.env.ADMIN_SECRET;
      const providedSecret = req.headers['x-admin-secret'];
      if (!adminSecret || typeof providedSecret !== 'string' || !timingSafeEqualStrings(providedSecret, adminSecret)) {
        res.status(403).json({ error: 'Forbidden', message: 'Invalid admin secret' });
        return;
      }
      const result = await reloadCosmeticCache(db);
      res.status(200).json({ ok: true, count: result.count });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reload cosmetic cache';
      res.status(500).json({ error: 'Internal server error', message });
    }
  });

  app.post(
    '/api/telegram/webhook',
    rateLimit({ endpoint: 'telegram_webhook', limit: 120, windowSeconds: 60 }),
    async (req, res) => {
      const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
      const providedToken = req.headers['x-telegram-bot-api-secret-token'];

      if (!webhookSecret) {
        if (process.env.NODE_ENV === 'production') {
          res.status(401).json({ error: 'Unauthorized', message: 'Webhook secret not configured' });
          return;
        }
      } else {
        if (!providedToken || typeof providedToken !== 'string' || !timingSafeEqualStrings(providedToken, webhookSecret)) {
          res.status(401).json({ error: 'Unauthorized', message: 'Invalid webhook secret token' });
          return;
        }
      }

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
            ? `📊 <b>Your Flagora Stats:</b>\n\n👤 <b>Name:</b> ${getDisplayName(profile)}\n⭐ <b>Level:</b> ${profile.level}\n✨ <b>XP:</b> ${profile.xp}\n🪙 <b>Pins:</b> ${profile.pins}\n🔥 <b>Current Streak:</b> ${profile.currentStreak} days\n🏆 <b>Best Score:</b> ${profile.bestScore}\n🎮 <b>Games Played:</b> ${profile.gamesPlayed}\n👥 <b>Friends Invited:</b> ${profile.referralCount ?? 0}`
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
          const inviteText = `🎁 <b>Invite Friends & Earn Rewards!</b>\n\nInvite your friends to Flagora and earn <b>+100 Pins</b> 🪙 for each friend who joins!\nYour friend also gets a <b>+50 Pin</b> welcome bonus.\n\n🔗 <b>Your Personal Invite Link:</b>\n<code>${inviteLink}</code>`;
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
        if (!res.headersSent) {
          res.status(200).json({ ok: true });
        }
        return;
      }

      if (update?.pre_checkout_query) {
        const query = update.pre_checkout_query;
        const isStars = !query.currency || query.currency === 'XTR';
        const isProPayload = !query.invoice_payload || (typeof query.invoice_payload === 'string' && query.invoice_payload.startsWith('pro_sub_'));
        if (isStars && isProPayload) {
          void answerPreCheckoutQuery(query.id, true);
        } else {
          void answerPreCheckoutQuery(query.id, false, 'Invalid currency or payment payload');
        }
        if (!res.headersSent) {
          res.status(200).json({ ok: true });
        }
        return;
      }

      const message = update?.message;

      if (message?.successful_payment) {
        const payment = message.successful_payment;
        const telegramUserId = Number(message.from?.id);
        const chargeId = payment.telegram_payment_charge_id;
        const isStars = !payment.currency || payment.currency === 'XTR';
        const isProPayload = !payment.invoice_payload || (typeof payment.invoice_payload === 'string' && payment.invoice_payload.startsWith('pro_sub_'));

        if (telegramUserId && chargeId && isStars && isProPayload) {
          try {
            const processedCol = db.collection('processed_payments');
            let alreadyProcessed = false;
            try {
              await processedCol.insertOne({
                chargeId,
                telegramUserId,
                createdAt: new Date(),
              });
            } catch (dupErr: unknown) {
              const mongoErr = dupErr as { code?: number };
              if (mongoErr?.code === 11000) {
                alreadyProcessed = true;
              } else {
                throw dupErr;
              }
            }

            if (!alreadyProcessed) {
              await processSuccessfulPayment(telegramUserId, chargeId, db);
              const profileCol = db.collection<PlayerProfile>('profiles');
              await profileCol.updateOne(
                { telegramUserId },
                { $inc: { pins: 1000 } }
              );
              void sendTelegramMessage({
                chatId: telegramUserId,
                text: '⭐ Welcome to Flagora Pro! Your perks and 1,000 Pins stipend are active.',
              });
            }
          } catch (e) {
            const errMessage = e instanceof Error ? e.message : String(e);
            process.stderr.write(`Warning: Failed to process successful payment: ${errMessage}\n`);
          }
        }
        if (!res.headersSent) {
          res.status(200).json({ ok: true });
        }
        return;
      }

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
              await registerReferralSignup(refUserId, chatId, db);
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

      if (!res.headersSent) {
        res.status(200).json({ ok: true });
      }
    } catch {
      if (!res.headersSent) {
        res.status(200).json({ ok: true });
      }
    }
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    void next;
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = typeof (err as { status?: number }).status === 'number' ? (err as { status?: number }).status! : 500;
    res.status(status).json({
      error:
        status === 400
          ? 'Bad request'
          : status === 401
            ? 'Unauthorized'
            : status === 403
              ? 'Forbidden'
              : status === 404
                ? 'Not found'
                : 'Internal server error',
      message: status === 500 && process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : message,
    });
  });

  httpServer.listen(port, () => {
    process.stdout.write(`Server listening on port ${port}\n`);
  });

  const shutdown = async () => {
    try {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      io.close();
      await closeNotificationQueue();
      await closeRedis();
      await closeDatabase();
    } catch {
      void 0;
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((error) => {
  const message = error instanceof Error ? error.message : 'Bootstrap error';
  process.stderr.write(`Fatal error during startup: ${message}\n`);
  process.exit(1);
});
