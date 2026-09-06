import crypto from 'node:crypto';
import type { Db } from 'mongodb';
import {
  COUNTRIES,
  DEFAULT_RUN_TIER_MIX,
  SCORING_CONFIG,
  calculateFlagPoints,
  calculateLeftoverBonus,
  calculateXpEarned,
  calculateCoinsEarned,
  calculateLevel,
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

export async function createRun(
  telegramUserId: number,
  db: Db,
): Promise<StartRunResponse> {
  const collection = db.collection<GameRun>('runs');
  await collection.createIndex({ runId: 1 }, { unique: true });
  await collection.createIndex({ telegramUserId: 1 });

  const selectedFlags = selectRunFlags(DEFAULT_RUN_TIER_MIX, [], COUNTRIES);

  const flags: RunFlagItem[] = selectedFlags.map((flag, index) => {
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
  const runId = crypto.randomUUID();

  const runDocument: GameRun = {
    runId,
    telegramUserId,
    flags,
    comboCount: 0,
    maxCombo: 0,
    runningTotal: 0,
    startedAt: now,
    status: 'active',
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

  const profilesCollection = db.collection<PlayerProfile>('profiles');
  const existingProfile = await profilesCollection.findOne({ telegramUserId });
  const previousBest = existingProfile?.bestScore ?? 0;
  const isNewBest = totalScore > previousBest;

  const profileUpdate = await profilesCollection.findOneAndUpdate(
    { telegramUserId },
    {
      $inc: {
        xp: xpEarned,
        coins: coinsEarned,
        gamesPlayed: 1,
      },
      $max: {
        bestScore: totalScore,
      },
      $set: {
        updatedAt: new Date(now),
      },
    },
    { returnDocument: 'after' },
  );

  let newXp = xpEarned;
  let newCoins = coinsEarned;
  let newLevel = calculateLevel(xpEarned);
  let leveledUp = false;
  let bestScore = totalScore;

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
