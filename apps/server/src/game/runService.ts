import crypto from 'node:crypto';
import type { Db } from 'mongodb';
import type { Redis as RedisClient } from 'ioredis';
import { updateLeaderboardScore, getDailyLeaderboardKey } from '../leaderboard/leaderboardService.js';
import {
  COUNTRIES,
  DEFAULT_RUN_TIER_MIX,
  SCORING_CONFIG,
  calculateFlagPoints,
  calculateLeftoverBonus,
  calculateXpEarned,
  calculateCoinsEarned,
  calculateLevel,
  getUtcDateString,
  calculateStreak,
  type StartRunResponse,
  type AnswerRunResponse,
  type FinishRunResponse,
  type PlayerProfile,
} from '@flagora/shared';
import { selectRunFlags, generateChoices } from './flagSelection.js';
import {
  type GameRun,
  type RunFlagItem,
  RunNotFoundError,
  UnauthorizedRunAccessError,
  RunAlreadyFinishedError,
  FlagAlreadyAnsweredError,
  TimeExpiredError,
  InvalidFlagIndexError,
} from './runTypes.js';

export interface CreateRunOptions {
  runId?: string;
  mode?: 'practice' | 'daily';
  dailyDate?: string;
  flags?: RunFlagItem[];
}

export async function createRun(
  telegramUserId: number,
  db: Db,
  options?: CreateRunOptions,
): Promise<StartRunResponse> {
  const collection = db.collection<GameRun>('runs');
  await collection.createIndex({ runId: 1 }, { unique: true });
  await collection.createIndex({ telegramUserId: 1 });

  const mode = options?.mode ?? 'practice';

  const flags: RunFlagItem[] =
    options?.flags ??
    selectRunFlags(DEFAULT_RUN_TIER_MIX, [], COUNTRIES).map((flag, index) => {
      const tierPeers = COUNTRIES.filter((f) => f.tier === flag.tier);
      const choices = generateChoices(flag, tierPeers);
      return {
        flagIndex: index,
        isoCode: flag.isoCode,
        name: flag.name,
        tier: flag.tier,
        choices,
        answered: false,
      };
    });

  const now = new Date();
  const runId = options?.runId ?? crypto.randomUUID();

  const runDocument: GameRun = {
    runId,
    telegramUserId,
    flags,
    comboCount: 0,
    maxCombo: 0,
    runningTotal: 0,
    startedAt: now,
    status: 'active',
    mode,
    dailyDate: options?.dailyDate,
    profileCredited: false,
    runDurationMs: SCORING_CONFIG.runDurationMs,
    createdAt: now,
    updatedAt: now,
  };

  await collection.insertOne({ ...runDocument });

  return {
    runId,
    flags: flags.map((f) => ({
      flagIndex: f.flagIndex,
      isoCode: f.isoCode,
      choices: f.choices,
    })),
    runDurationMs: SCORING_CONFIG.runDurationMs,
  };
}

export async function submitAnswer(
  runId: string,
  telegramUserId: number,
  flagIndex: number,
  selectedIsoCode: string,
  db: Db,
): Promise<AnswerRunResponse> {
  const collection = db.collection<GameRun>('runs');
  const run = await collection.findOne({ runId });

  if (!run) {
    throw new RunNotFoundError();
  }

  if (run.telegramUserId !== telegramUserId) {
    throw new UnauthorizedRunAccessError();
  }

  if (run.status !== 'active') {
    throw new RunAlreadyFinishedError();
  }

  if (flagIndex < 0 || flagIndex >= run.flags.length) {
    throw new InvalidFlagIndexError();
  }

  const now = Date.now();
  const elapsedMs = now - new Date(run.startedAt).getTime();

  if (elapsedMs > run.runDurationMs) {
    await collection.updateOne(
      { runId },
      {
        $set: {
          status: 'expired',
          finishedAt: new Date(now),
          updatedAt: new Date(now),
        },
      },
    );
    throw new TimeExpiredError();
  }

  const flag = run.flags[flagIndex];
  if (flag.answered) {
    throw new FlagAlreadyAnsweredError();
  }

  const isCorrect =
    Boolean(selectedIsoCode) &&
    (selectedIsoCode.trim().toLowerCase() === flag.isoCode.toLowerCase() ||
      selectedIsoCode.trim().toLowerCase() === flag.name.toLowerCase());

  const newCombo = isCorrect ? run.comboCount + 1 : 0;
  const pointsThisFlag = isCorrect ? calculateFlagPoints(flag.tier, newCombo) : 0;
  const newRunningTotal = run.runningTotal + pointsThisFlag;
  const newMaxCombo = Math.max(run.maxCombo, newCombo);

  const updatedFlags = [...run.flags];
  updatedFlags[flagIndex] = {
    ...flag,
    answered: true,
    selectedIsoCode,
    correct: isCorrect,
    points: pointsThisFlag,
    comboCount: newCombo,
    answeredAt: new Date(now),
  };

  await collection.updateOne(
    { runId },
    {
      $set: {
        flags: updatedFlags,
        comboCount: newCombo,
        maxCombo: newMaxCombo,
        runningTotal: newRunningTotal,
        updatedAt: new Date(now),
      },
    },
  );

  return {
    correct: isCorrect,
    comboCount: newCombo,
    pointsThisFlag,
    runningTotal: newRunningTotal,
  };
}

export async function finishRun(
  runId: string,
  telegramUserId: number,
  db: Db,
  redis?: RedisClient,
): Promise<FinishRunResponse> {
  const collection = db.collection<GameRun>('runs');
  const run = await collection.findOne({ runId });

  if (!run) {
    throw new RunNotFoundError();
  }

  if (run.telegramUserId !== telegramUserId) {
    throw new UnauthorizedRunAccessError();
  }

  if (run.status === 'finished' && run.profileCredited && run.finalScore) {
    return run.finalScore;
  }

  const now = Date.now();
  const elapsedMs = Math.max(0, now - new Date(run.startedAt).getTime());
  const timeUsedMs = Math.min(elapsedMs, run.runDurationMs);
  const leftoverMs = Math.max(0, run.runDurationMs - elapsedMs);
  const leftoverBonus = calculateLeftoverBonus(leftoverMs);
  const correctCount = run.flags.filter((f) => f.correct).length;
  const totalScore = run.runningTotal + leftoverBonus;

  const xpEarned = calculateXpEarned(totalScore);
  const coinsEarned = calculateCoinsEarned(correctCount);

  const claimResult = await collection.findOneAndUpdate(
    { runId, telegramUserId, profileCredited: { $ne: true } },
    {
      $set: {
        status: 'finished',
        profileCredited: true,
        finishedAt: new Date(now),
        updatedAt: new Date(now),
      },
    },
    { returnDocument: 'after' },
  );

  if (!claimResult) {
    const refreshed = await collection.findOne({ runId });
    if (refreshed?.finalScore) {
      return refreshed.finalScore;
    }
  }

  const isDaily = run.mode === 'daily';
  const profilesCollection = db.collection<PlayerProfile>('profiles');
  const existingProfile = await profilesCollection.findOne({ telegramUserId });
  const previousBest = existingProfile?.bestScore ?? 0;
  const isNewBest = isDaily ? false : totalScore > previousBest;

  const todayStr = getUtcDateString(new Date(now));
  const streakResult = calculateStreak(
    existingProfile?.lastPlayedDate ?? null,
    existingProfile?.currentStreak ?? 0,
    existingProfile?.longestStreak ?? 0,
    todayStr,
  );

  const updateFields: Record<string, unknown> = {
    $inc: {
      xp: xpEarned,
      coins: coinsEarned,
      gamesPlayed: 1,
    },
    $set: {
      currentStreak: streakResult.currentStreak,
      longestStreak: streakResult.longestStreak,
      lastPlayedDate: todayStr,
      updatedAt: new Date(now),
    },
  };

  if (!isDaily) {
    updateFields.$max = {
      bestScore: totalScore,
    };
  }

  const profileUpdate = await profilesCollection.findOneAndUpdate(
    { telegramUserId },
    updateFields,
    { returnDocument: 'after' },
  );

  let newXp = xpEarned;
  let newCoins = coinsEarned;
  let newLevel = calculateLevel(xpEarned);
  let leveledUp = false;
  let bestScore = isDaily ? previousBest : totalScore;

  if (profileUpdate) {
    newXp = profileUpdate.xp;
    newCoins = profileUpdate.coins;
    bestScore = profileUpdate.bestScore;
    newLevel = calculateLevel(newXp);
    const previousLevel = profileUpdate.level;
    leveledUp = newLevel > previousLevel;

    if (leveledUp) {
      await profilesCollection.updateOne(
        { telegramUserId },
        {
          $set: {
            level: newLevel,
            updatedAt: new Date(now),
          },
        },
      );
    }
  }

  if (redis) {
    try {
      if (isDaily) {
        const targetDate = run.dailyDate ?? todayStr;
        const dailyKey = getDailyLeaderboardKey(targetDate);
        await updateLeaderboardScore(telegramUserId, totalScore, redis, dailyKey);
      } else if (isNewBest) {
        await updateLeaderboardScore(telegramUserId, bestScore, redis);
      }
    } catch (err) {
      process.stderr.write(`Warning: Failed to update Redis leaderboard for user ${telegramUserId}: ${err}\n`);
    }
  }

  const finalScore: FinishRunResponse = {
    correctCount,
    timeUsedMs,
    maxCombo: run.maxCombo,
    leftoverBonus,
    totalScore,
    xpEarned,
    coinsEarned,
    newXp,
    newCoins,
    newLevel,
    leveledUp,
    bestScore,
    isNewBest,
    currentStreak: streakResult.currentStreak,
    longestStreak: streakResult.longestStreak,
    streakChange: streakResult.streakChange,
  };

  await collection.updateOne(
    { runId },
    {
      $set: {
        finalScore,
        updatedAt: new Date(now),
      },
    },
  );

  return finalScore;
}
