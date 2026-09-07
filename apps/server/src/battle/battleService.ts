import crypto from 'node:crypto';
import type { Db } from 'mongodb';
import type { Redis as RedisClient } from 'ioredis';
import type {
  PlayerProfile,
  BattleSession,
  BattleWinner,
  BattleParticipantResult,
  CreateBattleResponse,
  BattleInfoResponse,
  JoinBattleResponse,
} from '@flagora/shared';
import {
  getEffectiveBattleStatus,
  getDisplayName,
  COUNTRIES,
  DEFAULT_RUN_TIER_MIX,
} from '@flagora/shared';
import {
  BattleNotFoundError,
  BattleExpiredError,
  SelfBattleNotAllowedError,
  BattleAlreadyJoinedError,
  UnauthorizedBattleAccessError,
  BattleNotInProgressError,
} from './battleTypes.js';
import type {
  TypedSocketServer,
  BattleStartPayload,
  BattleFinishedPayload,
  AnswerResultPayload,
  OpponentProgressPayload,
} from '../multiplayer/socketTypes.js';
import { selectRunFlags, generateChoices } from '../game/flagSelection.js';
import { createRun, finishRun } from '../game/runService.js';
import type { RunFlagItem, GameRun } from '../game/runTypes.js';
import {
  RunNotFoundError,
  RunAlreadyFinishedError,
  TimeExpiredError,
} from '../game/runTypes.js';
import { scoreAnswer } from '../game/runScoringService.js';
import { notifyBattleCompletion } from '../telegram/telegramService.js';

export async function createBattle(
  challengerUserId: number,
  db: Db,
): Promise<CreateBattleResponse> {
  const battleId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const battleDoc: BattleSession = {
    battleId,
    challengerUserId,
    challengerTelegramUserId: challengerUserId,
    opponentUserId: null,
    opponentTelegramUserId: null,
    status: 'waiting',
    createdAt: now,
    expiresAt,
    updatedAt: now,
  };

  await db.collection<BattleSession>('battles').insertOne(battleDoc);

  return {
    battleId,
    status: 'waiting',
    expiresAt,
  };
}

export async function getBattleById(
  battleId: string,
  db: Db,
): Promise<BattleSession | null> {
  return db.collection<BattleSession>('battles').findOne({ battleId });
}

export async function checkAndFinalizeBattle(
  battleId: string,
  db: Db,
  redis?: RedisClient,
  io?: TypedSocketServer,
): Promise<BattleSession | null> {
  const battle = await db.collection<BattleSession>('battles').findOne({ battleId });
  if (!battle || battle.status !== 'in_progress' || !battle.challengerRunId || !battle.opponentRunId) {
    return battle;
  }

  const runsCollection = db.collection<GameRun>('runs');
  let challengerRun = await runsCollection.findOne({ runId: battle.challengerRunId });
  let opponentRun = await runsCollection.findOne({ runId: battle.opponentRunId });
  if (!challengerRun || !opponentRun) {
    return battle;
  }

  const now = Date.now();

  if (challengerRun.status === 'active' && !challengerRun.profileCredited) {
    const elapsed = now - new Date(challengerRun.startedAt).getTime();
    if (elapsed >= challengerRun.runDurationMs) {
      await finishRun(challengerRun.runId, challengerRun.telegramUserId, db, redis, io);
      challengerRun = await runsCollection.findOne({ runId: battle.challengerRunId });
    }
  }

  if (opponentRun.status === 'active' && !opponentRun.profileCredited) {
    const elapsed = now - new Date(opponentRun.startedAt).getTime();
    if (elapsed >= opponentRun.runDurationMs) {
      await finishRun(opponentRun.runId, opponentRun.telegramUserId, db, redis, io);
      opponentRun = await runsCollection.findOne({ runId: battle.opponentRunId });
    }
  }

  if (
    challengerRun &&
    opponentRun &&
    challengerRun.profileCredited &&
    opponentRun.profileCredited
  ) {
    const challengerScore = challengerRun.finalScore?.totalScore ?? challengerRun.runningTotal;
    const opponentScore = opponentRun.finalScore?.totalScore ?? opponentRun.runningTotal;

    let winner: BattleWinner = 'tie';
    if (challengerScore > opponentScore) {
      winner = 'challenger';
    } else if (opponentScore > challengerScore) {
      winner = 'opponent';
    }

    const completedAt = new Date();
    const updateResult = await db.collection<BattleSession>('battles').findOneAndUpdate(
      { battleId, status: 'in_progress' },
      {
        $set: {
          status: 'completed',
          winner,
          challengerScore,
          opponentScore,
          completedAt,
          updatedAt: completedAt,
        },
      },
      { returnDocument: 'after' },
    );

    if (updateResult) {
      const profilesCollection = db.collection<PlayerProfile>('profiles');
      const challengerProfile = await profilesCollection.findOne({
        telegramUserId: battle.challengerUserId,
      });
      const opponentProfile = await profilesCollection.findOne({
        telegramUserId: battle.opponentUserId!,
      });

      const challengerDisplayName = challengerProfile
        ? getDisplayName(challengerProfile)
        : 'Player';
      const opponentDisplayName = opponentProfile
        ? getDisplayName(opponentProfile)
        : 'Player';

      const challengerResult: BattleParticipantResult = {
        userId: battle.challengerUserId,
        displayName: challengerDisplayName,
        photoUrl: challengerProfile?.photoUrl ?? null,
        score: challengerScore,
        correctCount: challengerRun.flags.filter((f) => f.correct).length,
        totalFlags: challengerRun.flags.length,
      };

      const opponentResult: BattleParticipantResult = {
        userId: battle.opponentUserId!,
        displayName: opponentDisplayName,
        photoUrl: opponentProfile?.photoUrl ?? null,
        score: opponentScore,
        correctCount: opponentRun.flags.filter((f) => f.correct).length,
        totalFlags: opponentRun.flags.length,
      };

      if (io) {
        const payload: BattleFinishedPayload = {
          battleId,
          winner,
          challengerScore,
          opponentScore,
          completedAt: completedAt.toISOString(),
          challengerResult,
          opponentResult,
        };
        io.to(`battle:${battleId}`).emit('battleFinished', payload);
      }

      void notifyBattleCompletion(battleId, db);

      return updateResult;
    }
  }

  return battle;
}

export async function getBattleInfo(
  battleId: string,
  requestingUserId: number,
  db: Db,
): Promise<BattleInfoResponse> {
  let battle = await db.collection<BattleSession>('battles').findOne({ battleId });
  if (!battle) {
    throw new BattleNotFoundError();
  }

  if (battle.status === 'in_progress') {
    await checkAndFinalizeBattle(battleId, db);
    const refreshed = await db.collection<BattleSession>('battles').findOne({ battleId });
    if (refreshed) {
      battle = refreshed;
    }
  }

  const effectiveStatus = getEffectiveBattleStatus(battle);
  if (effectiveStatus === 'expired' && battle.status === 'waiting') {
    await db.collection('battles').updateOne(
      { battleId },
      { $set: { status: 'expired', updatedAt: new Date() } },
    );
    battle.status = 'expired';
  }

  const challengerProfile = await db
    .collection<PlayerProfile>('profiles')
    .findOne({ telegramUserId: battle.challengerUserId });
  const challengerDisplayName = challengerProfile
    ? getDisplayName(challengerProfile)
    : 'Player';
  const challengerPhotoUrl = challengerProfile?.photoUrl ?? null;

  let opponentDisplayName: string | null = null;
  let opponentPhotoUrl: string | null = null;

  if (battle.opponentUserId) {
    const opponentProfile = await db
      .collection<PlayerProfile>('profiles')
      .findOne({ telegramUserId: battle.opponentUserId });
    opponentDisplayName = opponentProfile
      ? getDisplayName(opponentProfile)
      : 'Player';
    opponentPhotoUrl = opponentProfile?.photoUrl ?? null;
  }

  const isChallenger = requestingUserId === battle.challengerUserId;
  const isOwnInvite = isChallenger;
  const isOpponent =
    battle.opponentUserId !== null && requestingUserId === battle.opponentUserId;
  const isJoinable =
    effectiveStatus === 'waiting' && battle.opponentUserId === null;

  let challengerResult: BattleParticipantResult | null = null;
  let opponentResult: BattleParticipantResult | null = null;

  if (battle.status === 'completed') {
    const runsCollection = db.collection<GameRun>('runs');
    const cRun = battle.challengerRunId
      ? await runsCollection.findOne({ runId: battle.challengerRunId })
      : null;
    const oRun = battle.opponentRunId
      ? await runsCollection.findOne({ runId: battle.opponentRunId })
      : null;

    if (cRun) {
      challengerResult = {
        userId: battle.challengerUserId,
        displayName: challengerDisplayName,
        photoUrl: challengerPhotoUrl,
        score: battle.challengerScore ?? cRun.finalScore?.totalScore ?? cRun.runningTotal,
        correctCount: cRun.flags.filter((f) => f.correct).length,
        totalFlags: cRun.flags.length,
      };
    }

    if (oRun && battle.opponentUserId) {
      opponentResult = {
        userId: battle.opponentUserId,
        displayName: opponentDisplayName ?? 'Player',
        photoUrl: opponentPhotoUrl,
        score: battle.opponentScore ?? oRun.finalScore?.totalScore ?? oRun.runningTotal,
        correctCount: oRun.flags.filter((f) => f.correct).length,
        totalFlags: oRun.flags.length,
      };
    }
  }

  return {
    battleId: battle.battleId,
    challengerUserId: battle.challengerUserId,
    challengerTelegramUserId: battle.challengerUserId,
    challengerDisplayName,
    challengerPhotoUrl,
    status: battle.status,
    isChallenger,
    isOwnInvite,
    isOpponent,
    isJoinable,
    expiresAt: battle.expiresAt,
    opponentUserId: battle.opponentUserId,
    opponentTelegramUserId: battle.opponentUserId,
    opponentDisplayName,
    opponentPhotoUrl,
    winner: battle.winner ?? null,
    challengerScore: battle.challengerScore ?? null,
    opponentScore: battle.opponentScore ?? null,
    completedAt: battle.completedAt ?? null,
    challengerResult,
    opponentResult,
    totalFlags: 10,
    durationSeconds: 60,
  };
}

export async function joinBattle(
  battleId: string,
  opponentUserId: number,
  db: Db,
  io?: TypedSocketServer,
): Promise<JoinBattleResponse> {
  const battle = await db.collection<BattleSession>('battles').findOne({ battleId });
  if (!battle) {
    throw new BattleNotFoundError();
  }

  const now = new Date();
  const effectiveStatus = getEffectiveBattleStatus(battle, now);

  if (effectiveStatus === 'expired') {
    throw new BattleExpiredError();
  }

  if (opponentUserId === battle.challengerUserId) {
    throw new SelfBattleNotAllowedError();
  }

  if (battle.opponentUserId !== null || battle.status !== 'waiting') {
    throw new BattleAlreadyJoinedError();
  }

  const updateResult = await db.collection<BattleSession>('battles').findOneAndUpdate(
    {
      battleId,
      status: 'waiting',
      opponentUserId: null,
      expiresAt: { $gt: now },
      challengerUserId: { $ne: opponentUserId },
    },
    {
      $set: {
        opponentUserId,
        opponentTelegramUserId: opponentUserId,
        status: 'ready',
        updatedAt: now,
      },
    },
    { returnDocument: 'after' },
  );

  if (!updateResult) {
    const latest = await db.collection<BattleSession>('battles').findOne({ battleId });
    if (!latest) {
      throw new BattleNotFoundError();
    }
    if (getEffectiveBattleStatus(latest, now) === 'expired') {
      throw new BattleExpiredError();
    }
    if (latest.challengerUserId === opponentUserId) {
      throw new SelfBattleNotAllowedError();
    }
    throw new BattleAlreadyJoinedError();
  }

  const opponentProfile = await db
    .collection<PlayerProfile>('profiles')
    .findOne({ telegramUserId: opponentUserId });
  const opponentDisplayName = opponentProfile
    ? getDisplayName(opponentProfile)
    : 'Player';
  const opponentPhotoUrl = opponentProfile?.photoUrl ?? null;

  if (io) {
    const roomName = `battle:${battleId}`;
    io.to(roomName).emit('opponentJoined', {
      battleId,
      opponentUserId,
      opponentDisplayName,
      opponentPhotoUrl,
    });

    const sockets = await io.in(roomName).fetchSockets();
    const presentUserIds = new Set(sockets.map((s) => s.data.telegramUserId));
    if (presentUserIds.has(battle.challengerUserId) && presentUserIds.has(opponentUserId)) {
      io.to(roomName).emit('bothPlayersPresent', { battleId });
    }
  }

  return {
    battleId,
    status: 'ready',
    opponentUserId,
    opponentTelegramUserId: opponentUserId,
  };
}

export async function startBattleSession(
  battleId: string,
  db: Db,
  io: TypedSocketServer,
): Promise<BattleStartPayload | null> {
  const battle = await db.collection<BattleSession>('battles').findOne({ battleId });
  if (!battle || battle.status !== 'ready' || battle.opponentUserId === null) {
    return null;
  }

  const selectedFlags = selectRunFlags(DEFAULT_RUN_TIER_MIX, [], COUNTRIES);
  const flagItems: RunFlagItem[] = selectedFlags.map((flag, index) => {
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

  const serverStartTime = new Date();

  const challengerRun = await createRun(battle.challengerUserId, db, {
    mode: 'live-battle',
    battleId,
    flags: flagItems,
    startedAt: serverStartTime,
  });

  const opponentRun = await createRun(battle.opponentUserId, db, {
    mode: 'live-battle',
    battleId,
    flags: flagItems,
    startedAt: serverStartTime,
  });

  await db.collection<BattleSession>('battles').updateOne(
    { battleId },
    {
      $set: {
        status: 'in_progress',
        challengerRunId: challengerRun.runId,
        opponentRunId: opponentRun.runId,
        startedAt: serverStartTime,
        updatedAt: serverStartTime,
      },
    },
  );

  const startPayload: BattleStartPayload = {
    battleId,
    startedAt: serverStartTime.toISOString(),
    runDurationMs: challengerRun.runDurationMs,
    flags: challengerRun.flags,
    challengerRunId: challengerRun.runId,
    opponentRunId: opponentRun.runId,
  };

  io.to(`battle:${battleId}`).emit('battleStart', startPayload);

  const autoFinalizeTimer = setTimeout(async () => {
    try {
      await checkAndFinalizeBattle(battleId, db, undefined, io);
    } catch {
      // ignore
    }
  }, challengerRun.runDurationMs + 1000);
  autoFinalizeTimer.unref?.();

  return startPayload;
}

export interface SubmitBattleAnswerResult {
  answerResult: AnswerResultPayload;
  opponentProgress: OpponentProgressPayload;
}

export async function submitBattleAnswer(
  battleId: string,
  userId: number,
  flagIndex: number,
  selectedIsoCode: string,
  db: Db,
  nowMs: number = Date.now(),
  redis?: RedisClient,
  io?: TypedSocketServer,
): Promise<SubmitBattleAnswerResult> {
  const battle = await db.collection<BattleSession>('battles').findOne({ battleId });
  if (!battle) {
    throw new BattleNotFoundError();
  }

  const isChallenger = battle.challengerUserId === userId;
  const isOpponent = battle.opponentUserId !== null && battle.opponentUserId === userId;

  if (!isChallenger && !isOpponent) {
    throw new UnauthorizedBattleAccessError();
  }

  if (battle.status !== 'in_progress') {
    throw new BattleNotInProgressError();
  }

  const runId = isChallenger ? battle.challengerRunId : battle.opponentRunId;
  if (!runId) {
    throw new RunNotFoundError();
  }

  const runsCollection = db.collection<GameRun>('runs');
  const run = await runsCollection.findOne({ runId });
  if (!run) {
    throw new RunNotFoundError();
  }

  if (run.status !== 'active') {
    throw new RunAlreadyFinishedError();
  }

  let scored;
  try {
    scored = scoreAnswer(run, flagIndex, selectedIsoCode, nowMs);
  } catch (error) {
    if (error instanceof TimeExpiredError) {
      await runsCollection.updateOne(
        { runId },
        {
          $set: {
            status: 'expired',
            finishedAt: new Date(nowMs),
            updatedAt: new Date(nowMs),
          },
        },
      );
      await finishRun(runId, userId, db, redis, io);
      await checkAndFinalizeBattle(battleId, db, redis, io);
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

  await runsCollection.updateOne(
    { runId },
    {
      $set: {
        flags: updatedFlags,
        comboCount: scored.newCombo,
        maxCombo: scored.newMaxCombo,
        runningTotal: scored.newRunningTotal,
        updatedAt: new Date(nowMs),
      },
    },
  );

  if (updatedFlags.every((f) => f.answered)) {
    await finishRun(runId, userId, db, redis, io);
    await checkAndFinalizeBattle(battleId, db, redis, io);
  }

  const answerResult: AnswerResultPayload = {
    correct: scored.isCorrect,
    comboCount: scored.newCombo,
    pointsThisFlag: scored.pointsThisFlag,
    runningTotal: scored.newRunningTotal,
  };

  const opponentProgress: OpponentProgressPayload = {
    flagIndex,
    correct: scored.isCorrect,
    runningTotal: scored.newRunningTotal,
  };

  return {
    answerResult,
    opponentProgress,
  };
}
