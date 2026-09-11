import crypto from 'node:crypto';
import type { Db } from 'mongodb';
import type { Redis as RedisClient } from 'ioredis';
import { updateLeaderboardScore, getDailyLeaderboardKey } from '../leaderboard/leaderboardService.js';
import { notifyChallengeCompletion } from '../telegram/telegramService.js';
import {
  DEFAULT_RUN_TIER_MIX,
  SCORING_CONFIG,
  calculateLevel,
  getUtcDateString,
  calculateStreak,
  type StartRunResponse,
  type AnswerRunResponse,
  type FinishRunResponse,
  type PlayerProfile,
  type Challenge,
  type ChallengeWinner,
  type Continent,
} from '@flagora/shared';
import { selectRunFlags, generateChoices } from './flagSelection.js';
import { getCachedFlags, getCachedFlagsByContinent } from './flagCache.js';
import { scoreAnswer, finalizeRun } from './runScoringService.js';
import type { TypedSocketServer } from '../multiplayer/socketTypes.js';
import { checkAndFinalizeBattle } from '../battle/battleService.js';
import { evaluateBadges } from '../badge/badgeService.js';
import {
  type GameRun,
  type RunFlagItem,
  RunNotFoundError,
  UnauthorizedRunAccessError,
  RunAlreadyFinishedError,
  TimeExpiredError,
  InvalidFlagIndexError,
} from './runTypes.js';

export interface CreateRunOptions {
  runId?: string;
  mode?: 'practice' | 'daily' | 'challenge' | 'live-battle' | 'custom';
  challengeId?: string;
  battleId?: string;
  dailyDate?: string;
  flags?: RunFlagItem[];
  startedAt?: Date;
  continent?: Continent;
  flagCount?: number;
  durationSeconds?: number;
}

export async function createRun(
  telegramUserId: number,
  db: Db,
  options?: CreateRunOptions,
): Promise<StartRunResponse> {
  const collection = db.collection<GameRun>('runs');
  await collection.createIndex({ runId: 1 }, { unique: true });
  await collection.createIndex({ telegramUserId: 1, createdAt: -1 });

  const mode = options?.mode ?? 'practice';
  const countryPool = getCachedFlagsByContinent(options?.continent);
  const targetCount = options?.flagCount ?? 10;
  const flagsPool = countryPool.length >= targetCount ? countryPool : getCachedFlags();

  const flags: RunFlagItem[] =
    options?.flags ??
    selectRunFlags(DEFAULT_RUN_TIER_MIX, [], flagsPool, targetCount).map((flag, index) => {
      const choices = generateChoices(flag, flagsPool.length >= 4 ? flagsPool : getCachedFlags());
      return {
        flagIndex: index,
        isoCode: flag.isoCode,
        name: flag.name,
        tier: flag.tier,
        choices,
        answered: false,
      };
    });

  const now = options?.startedAt ?? new Date();
  const runId = options?.runId ?? crypto.randomUUID();
  const runDurationMs = options?.durationSeconds
    ? options.durationSeconds * 1000
    : SCORING_CONFIG.runDurationMs;

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
    challengeId: options?.challengeId,
    battleId: options?.battleId,
    dailyDate: options?.dailyDate,
    profileCredited: false,
    runDurationMs,
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
  let scored;
  try {
    scored = scoreAnswer(run, flagIndex, selectedIsoCode, now);
  } catch (error) {
    if (error instanceof TimeExpiredError) {
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
    }
    throw error;
  }

  const flag = run.flags[flagIndex];
  const updatedFlags = [...run.flags];
  updatedFlags[flagIndex] = {
    ...flag,
    answered: true,
    selectedIsoCode,
    correct: scored.isCorrect,
    points: scored.pointsThisFlag,
    comboCount: scored.newCombo,
    answeredAt: scored.answeredAt,
  };

  await collection.updateOne(
    { runId },
    {
      $set: {
        flags: updatedFlags,
        comboCount: scored.newCombo,
        maxCombo: scored.newMaxCombo,
        runningTotal: scored.newRunningTotal,
        updatedAt: new Date(now),
      },
    },
  );

  return {
    correct: scored.isCorrect,
    comboCount: scored.newCombo,
    pointsThisFlag: scored.pointsThisFlag,
    runningTotal: scored.newRunningTotal,
  };
}

export async function finishRun(
  runId: string,
  telegramUserId: number,
  db: Db,
  redis?: RedisClient,
  io?: TypedSocketServer,
): Promise<FinishRunResponse> {
  const collection = db.collection<GameRun>('runs');
  const run = await collection.findOne({ runId });

  if (!run) {
    throw new RunNotFoundError();
  }

  if (run.telegramUserId !== telegramUserId) {
    throw new UnauthorizedRunAccessError();
  }

  if ((run.status === 'finished' || run.status === 'expired') && run.profileCredited && run.finalScore) {
    return run.finalScore;
  }

  const now = Date.now();
  const finalized = finalizeRun(run, now);
  const timeUsedMs = finalized.timeUsedMs;
  const leftoverBonus = finalized.leftoverBonus;
  const correctCount = finalized.correctCount;
  const totalScore = finalized.totalScore;

  const xpEarned = finalized.xpEarned;
  const coinsEarned = finalized.coinsEarned;

  const claimResult = await collection.findOneAndUpdate(
    { runId, telegramUserId, profileCredited: { $ne: true } },
    {
      $set: {
        status: run.status === 'expired' ? 'expired' : 'finished',
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
  const isChallenge = run.mode === 'challenge';
  const isLiveBattle = run.mode === 'live-battle';
  const isPractice = run.mode === 'practice' || (!isDaily && !isChallenge && !isLiveBattle);
  const profilesCollection = db.collection<PlayerProfile>('profiles');
  const existingProfile = await profilesCollection.findOne({ telegramUserId });
  const previousBest = existingProfile?.bestScore ?? 0;
  const isNewBest = isPractice ? totalScore > previousBest : false;

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

  if (isPractice) {
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
  let bestScore = isPractice ? totalScore : previousBest;

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

  try {
    await evaluateBadges(
      telegramUserId,
      {
        type: 'run_finished',
        run: claimResult ?? run,
        finalScore: {
          totalScore,
          correctCount,
          timeUsedMs,
          maxCombo: run.maxCombo,
          leftoverBonus,
          xpEarned,
          coinsEarned,
          newXp,
          newCoins,
          newLevel,
          leveledUp,
          currentStreak: streakResult.currentStreak,
          longestStreak: streakResult.longestStreak,
          streakChange: streakResult.streakChange,
          bestScore,
          isNewBest,
        },
      },
      db,
      new Date(now),
    );

    await evaluateBadges(
      telegramUserId,
      {
        type: 'streak_updated',
        currentStreak: streakResult.currentStreak,
        longestStreak: streakResult.longestStreak,
      },
      db,
      new Date(now),
    );
  } catch {
    void 0;
  }

  if (isChallenge && run.challengeId) {
    const challengesCollection = db.collection<Challenge>('challenges');
    const challenge = await challengesCollection.findOne({ challengeId: run.challengeId });
    if (challenge) {
      if (challenge.challengerRunId === run.runId) {
        await challengesCollection.updateOne(
          { challengeId: run.challengeId, challengerRunId: run.runId },
          {
            $set: {
              challengerScore: totalScore,
              updatedAt: new Date(now),
            },
          },
        );
      } else if (challenge.opponentRunId === run.runId) {
        const opponentScore = totalScore;
        const challengerScore = challenge.challengerScore ?? 0;
        let winner: ChallengeWinner;
        if (challengerScore > opponentScore) {
          winner = 'challenger';
        } else if (opponentScore > challengerScore) {
          winner = 'opponent';
        } else {
          winner = 'tie';
        }

        await challengesCollection.updateOne(
          { challengeId: run.challengeId, opponentRunId: run.runId },
          {
            $set: {
              opponentScore,
              status: 'completed',
              winner,
              updatedAt: new Date(now),
            },
          },
        );

        await notifyChallengeCompletion(run.challengeId, db);
      }
    }
  }

  if (isLiveBattle && run.battleId) {
    await checkAndFinalizeBattle(run.battleId, db, redis, io);
  }

  if (redis) {
    try {
      if (isDaily) {
        const targetDate = run.dailyDate ?? todayStr;
        const dailyKey = getDailyLeaderboardKey(targetDate);
        await updateLeaderboardScore(telegramUserId, totalScore, redis, dailyKey);
      } else if (isPractice && isNewBest) {
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
