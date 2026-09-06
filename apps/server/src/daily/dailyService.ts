import crypto from 'node:crypto';
import type { Db } from 'mongodb';
import type { Redis as RedisClient } from 'ioredis';
import {
  COUNTRIES,
  DEFAULT_RUN_TIER_MIX,
  getUtcDateString,
  type DailyChallengeDefinition,
  type DailyChallengeFlagItem,
  type DailyChallengeStatusResponse,
  type DailyLeaderboardResponse,
  type StartRunResponse,
} from '@flagora/shared';
import { selectRunFlags, generateChoices } from '../game/flagSelection.js';
import { createRun } from '../game/runService.js';
import type { GameRun, RunFlagItem } from '../game/runTypes.js';
import {
  getDailyLeaderboardKey,
  getTopLeaderboard,
  getPlayerLeaderboardRank,
} from '../leaderboard/leaderboardService.js';
import {
  type DailyChallengeAttempt,
  DailyChallengeAlreadyAttemptedError,
} from './dailyTypes.js';

export async function getOrCreateDailyDefinition(
  date: string,
  db: Db,
): Promise<DailyChallengeDefinition> {
  const collection = db.collection<DailyChallengeDefinition>('daily_challenge_definitions');
  await collection.createIndex({ date: 1 }, { unique: true });

  const existing = await collection.findOne({ date });
  if (existing) {
    return existing;
  }

  const selectedFlags = selectRunFlags(DEFAULT_RUN_TIER_MIX, [], COUNTRIES);
  const flags: DailyChallengeFlagItem[] = selectedFlags.map((flag, index) => {
    const tierPeers = COUNTRIES.filter((f) => f.tier === flag.tier);
    const choices = generateChoices(flag, tierPeers);
    return {
      flagIndex: index,
      isoCode: flag.isoCode,
      name: flag.name,
      tier: flag.tier,
      choices,
    };
  });

  const newDef: DailyChallengeDefinition = {
    date,
    flags,
    createdAt: new Date(),
  };

  try {
    await collection.insertOne({ ...newDef });
    return newDef;
  } catch (err: unknown) {
    const mongoErr = err as { code?: number };
    if (mongoErr?.code === 11000) {
      const raceWinner = await collection.findOne({ date });
      if (raceWinner) {
        return raceWinner;
      }
    }
    throw err;
  }
}

export async function startDailyChallenge(
  telegramUserId: number,
  db: Db,
  dateOverride?: string,
): Promise<StartRunResponse> {
  const date = dateOverride ?? getUtcDateString();
  const attemptsCollection = db.collection<DailyChallengeAttempt>('daily_challenge_attempts');
  await attemptsCollection.createIndex({ telegramUserId: 1, date: 1 }, { unique: true });

  const existingAttempt = await attemptsCollection.findOne({ telegramUserId, date });
  if (existingAttempt) {
    throw new DailyChallengeAlreadyAttemptedError();
  }

  const definition = await getOrCreateDailyDefinition(date, db);
  const runId = crypto.randomUUID();
  const now = new Date();

  try {
    await attemptsCollection.insertOne({
      telegramUserId,
      date,
      runId,
      createdAt: now,
    });
  } catch (err: unknown) {
    const mongoErr = err as { code?: number };
    if (mongoErr?.code === 11000) {
      throw new DailyChallengeAlreadyAttemptedError();
    }
    throw err;
  }

  const runFlags: RunFlagItem[] = definition.flags.map((f) => ({
    ...f,
    answered: false,
  }));

  return createRun(telegramUserId, db, {
    runId,
    mode: 'daily',
    dailyDate: date,
    flags: runFlags,
  });
}

export async function getDailyChallengeStatus(
  telegramUserId: number,
  db: Db,
  dateOverride?: string,
): Promise<DailyChallengeStatusResponse> {
  const date = dateOverride ?? getUtcDateString();
  const attemptsCollection = db.collection<DailyChallengeAttempt>('daily_challenge_attempts');
  const attempt = await attemptsCollection.findOne({ telegramUserId, date });

  if (!attempt) {
    return {
      date,
      attempted: false,
      runId: null,
      status: 'not_attempted',
      result: null,
    };
  }

  const run = await db.collection<GameRun>('runs').findOne({ runId: attempt.runId });
  if (!run) {
    return {
      date,
      attempted: true,
      runId: attempt.runId,
      status: 'not_attempted',
      result: null,
    };
  }

  let status: DailyChallengeStatusResponse['status'] = 'in_progress';
  if (run.status === 'finished') {
    status = 'finished';
  } else if (run.status === 'expired') {
    status = 'expired';
  }

  return {
    date,
    attempted: true,
    runId: attempt.runId,
    status,
    result: run.finalScore ?? null,
  };
}

export async function getDailyLeaderboard(
  telegramUserId: number,
  db: Db,
  redis: RedisClient,
  dateOverride?: string,
  limit = 50,
): Promise<DailyLeaderboardResponse> {
  const date = dateOverride ?? getUtcDateString();
  const key = getDailyLeaderboardKey(date);

  const top = await getTopLeaderboard(limit, db, redis, key);
  const me = await getPlayerLeaderboardRank(telegramUserId, redis, key);

  return {
    date,
    top,
    me,
  };
}
