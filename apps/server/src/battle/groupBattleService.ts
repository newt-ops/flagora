import crypto from 'node:crypto';
import type { Db } from 'mongodb';
import type { Redis as RedisClient } from 'ioredis';
import type {
  BattleSession,
  BattleParticipant,
  BattleInfoResponse,
  GroupPodiumItem,
  GroupBattleFinishedPayload,
  BattleStartPayload,
  BattleStartFlag,
  PlayerProfile,
} from '@flagora/shared';
import {
  DEFAULT_RUN_TIER_MIX,
  getDisplayName,
} from '@flagora/shared';
import {
  BattleNotFoundError,
  BattleExpiredError,
  BattleAlreadyJoinedError,
  BattleAlreadyStartedError,
  BattleHostRequiredError,
  InsufficientPlayersError,
  LobbyFullError,
} from './battleTypes.js';
import { selectRunFlags, generateChoices } from '../game/flagSelection.js';
import type { GameRun, RunFlagItem } from '../game/runTypes.js';
import type { TypedSocketServer } from '../multiplayer/socketTypes.js';
import { sendTelegramMessage } from '../telegram/telegramService.js';

export const GROUP_BATTLE_CONFIG = {
  minPlayers: 2,
  maxPlayersLimit: 20,
  defaultMaxPlayers: 5,
  lobbyTtlMs: 10 * 60 * 1000, // 10 minutes
  battleDurationMs: 60 * 1000, // 60 seconds
  rewardPins: {
    firstPlace: 150,
    secondPlace: 75,
    thirdPlace: 40,
    participant: 15,
  },
};

export interface CreateGroupLobbyParams {
  chatId: number;
  hostUserId: number;
  hostDisplayName: string;
  hostPhotoUrl?: string | null;
  maxPlayers?: number;
}

export async function createGroupLobby(
  params: CreateGroupLobbyParams,
  db: Db,
): Promise<BattleSession> {
  const { chatId, hostUserId, hostDisplayName, hostPhotoUrl, maxPlayers } = params;

  const clampedMax = Math.min(
    GROUP_BATTLE_CONFIG.maxPlayersLimit,
    Math.max(GROUP_BATTLE_CONFIG.minPlayers, maxPlayers || GROUP_BATTLE_CONFIG.defaultMaxPlayers),
  );

  const now = new Date();

  // If there is already an active unexpired lobby in this group, return it
  const existing = await db.collection<BattleSession>('battles').findOne({
    chatId,
    status: 'waiting',
    expiresAt: { $gt: now },
  });

  if (existing) {
    return existing;
  }

  const battleId = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + GROUP_BATTLE_CONFIG.lobbyTtlMs);

  const hostParticipant: BattleParticipant = {
    userId: hostUserId,
    telegramUserId: hostUserId,
    displayName: hostDisplayName,
    photoUrl: hostPhotoUrl ?? null,
    score: null,
    correctCount: 0,
    totalFlags: 0,
    ready: true,
  };

  const battleDoc: BattleSession = {
    battleId,
    chatId,
    isGroupBattle: true,
    maxPlayers: clampedMax,
    hostUserId,
    challengerUserId: hostUserId,
    opponentUserId: null,
    participants: [hostParticipant],
    status: 'waiting',
    createdAt: now,
    expiresAt,
    updatedAt: now,
  };

  await db.collection<BattleSession>('battles').insertOne(battleDoc);
  return battleDoc;
}

export interface JoinGroupLobbyParams {
  battleId: string;
  userId: number;
  telegramUserId: number;
  displayName: string;
  photoUrl?: string | null;
}

export async function joinGroupLobby(
  params: JoinGroupLobbyParams,
  db: Db,
): Promise<BattleSession> {
  const { battleId, userId, telegramUserId, displayName, photoUrl } = params;
  const now = new Date();

  const newParticipant: BattleParticipant = {
    userId,
    telegramUserId,
    displayName,
    photoUrl: photoUrl ?? null,
    score: null,
    correctCount: 0,
    totalFlags: 0,
    ready: true,
  };

  // Atomic race-safe join using MongoDB $expr condition
  const result = await db.collection<BattleSession>('battles').findOneAndUpdate(
    {
      battleId,
      status: 'waiting',
      expiresAt: { $gt: now },
      'participants.userId': { $ne: userId },
      $expr: { $lt: [{ $size: '$participants' }, '$maxPlayers'] },
    },
    {
      $push: { participants: newParticipant },
      $set: { updatedAt: now },
    },
    { returnDocument: 'after' },
  );

  if (result) {
    return result;
  }

  // Operation didn't match -> diagnose exact reason
  const battle = await db.collection<BattleSession>('battles').findOne({ battleId });
  if (!battle) {
    throw new BattleNotFoundError();
  }
  if (battle.status === 'expired' || new Date(battle.expiresAt).getTime() <= now.getTime()) {
    throw new BattleExpiredError();
  }
  if (battle.status !== 'waiting') {
    throw new BattleAlreadyStartedError();
  }
  if (battle.participants?.some((p) => p.userId === userId)) {
    throw new BattleAlreadyJoinedError('You have already joined this battle lobby');
  }
  if ((battle.participants?.length ?? 0) >= (battle.maxPlayers ?? GROUP_BATTLE_CONFIG.defaultMaxPlayers)) {
    throw new LobbyFullError();
  }

  throw new BattleNotFoundError('Could not join battle lobby');
}

export async function leaveGroupLobby(
  battleId: string,
  userId: number,
  db: Db,
): Promise<BattleSession | null> {
  const battle = await db.collection<BattleSession>('battles').findOne({ battleId });
  if (!battle) {
    throw new BattleNotFoundError();
  }
  if (battle.status !== 'waiting') {
    throw new BattleAlreadyStartedError('Cannot leave a battle that is already in progress');
  }

  const now = new Date();
  const isHost = battle.hostUserId === userId;
  const participants = battle.participants ?? [];

  if (isHost) {
    const remaining = participants.filter((p) => p.userId !== userId);
    if (remaining.length === 0) {
      // Host was alone -> cancel lobby
      const updated = await db.collection<BattleSession>('battles').findOneAndUpdate(
        { battleId, status: 'waiting' },
        { $set: { status: 'expired', updatedAt: now } },
        { returnDocument: 'after' },
      );
      return updated;
    }

    // Transfer host to next participant
    const nextHost = remaining[0];
    const updated = await db.collection<BattleSession>('battles').findOneAndUpdate(
      { battleId, status: 'waiting' },
      {
        $pull: { participants: { userId } },
        $set: {
          hostUserId: nextHost.userId,
          challengerUserId: nextHost.userId,
          updatedAt: now,
        },
      },
      { returnDocument: 'after' },
    );
    return updated;
  }

  // Non-host player leaving
  const updated = await db.collection<BattleSession>('battles').findOneAndUpdate(
    { battleId, status: 'waiting' },
    {
      $pull: { participants: { userId } },
      $set: { updatedAt: now },
    },
    { returnDocument: 'after' },
  );

  return updated;
}

export async function cancelGroupLobby(
  battleId: string,
  requestingUserId: number,
  db: Db,
): Promise<BattleSession> {
  const battle = await db.collection<BattleSession>('battles').findOne({ battleId });
  if (!battle) {
    throw new BattleNotFoundError();
  }
  if (battle.hostUserId !== requestingUserId) {
    throw new BattleHostRequiredError();
  }
  if (battle.status !== 'waiting') {
    throw new BattleAlreadyStartedError('Cannot cancel a battle that has already started');
  }

  const now = new Date();
  const updated = await db.collection<BattleSession>('battles').findOneAndUpdate(
    { battleId, status: 'waiting', hostUserId: requestingUserId },
    { $set: { status: 'expired', updatedAt: now } },
    { returnDocument: 'after' },
  );

  if (!updated) {
    throw new BattleNotFoundError();
  }
  return updated;
}

export async function startGroupBattle(
  battleId: string,
  requestingUserId: number,
  db: Db,
  redis?: RedisClient,
  io?: TypedSocketServer,
): Promise<BattleSession> {
  const battle = await db.collection<BattleSession>('battles').findOne({ battleId });
  if (!battle) {
    throw new BattleNotFoundError();
  }
  if (battle.hostUserId !== requestingUserId) {
    throw new BattleHostRequiredError();
  }
  if (battle.status !== 'waiting') {
    throw new BattleAlreadyStartedError();
  }
  const participants = battle.participants ?? [];
  if (participants.length < GROUP_BATTLE_CONFIG.minPlayers) {
    throw new InsufficientPlayersError();
  }

  const now = new Date();

  // Atomic state transition to 'in_progress'
  const startedBattle = await db.collection<BattleSession>('battles').findOneAndUpdate(
    {
      battleId,
      status: 'waiting',
      hostUserId: requestingUserId,
      $expr: { $gte: [{ $size: '$participants' }, GROUP_BATTLE_CONFIG.minPlayers] },
    },
    {
      $set: {
        status: 'in_progress',
        startedAt: now,
        updatedAt: now,
      },
    },
    { returnDocument: 'after' },
  );

  if (!startedBattle) {
    throw new BattleAlreadyStartedError('Battle could not be started or already started');
  }

  // 1. Generate single synchronized flag sequence for all participants
  const selectedFlags = selectRunFlags(DEFAULT_RUN_TIER_MIX);
  const runFlags: RunFlagItem[] = selectedFlags.map((country, index) => ({
    flagIndex: index,
    isoCode: country.isoCode,
    name: country.name,
    tier: country.tier,
    choices: generateChoices(country),
    answered: false,
    correct: false,
  }));

  const battleStartFlags: BattleStartFlag[] = runFlags.map((f) => ({
    flagIndex: f.flagIndex,
    isoCode: f.isoCode,
    choices: f.choices,
  }));

  // 2. Create individual GameRuns for all participants sharing the exact flag seed
  const runsCollection = db.collection<GameRun>('runs');
  const updatedParticipants: BattleParticipant[] = [];

  for (const participant of startedBattle.participants ?? []) {
    const runId = crypto.randomUUID();
    const runDoc: GameRun = {
      runId,
      telegramUserId: participant.userId,
      mode: 'practice',
      status: 'active',
      startedAt: now,
      runDurationMs: GROUP_BATTLE_CONFIG.battleDurationMs,
      flags: runFlags.map((f) => ({ ...f })),
      runningTotal: 0,
      comboCount: 0,
      maxCombo: 0,
      profileCredited: false,
      createdAt: now,
      updatedAt: now,
    };

    await runsCollection.insertOne(runDoc);
    updatedParticipants.push({
      ...participant,
      runId,
    });
  }

  await db.collection<BattleSession>('battles').updateOne(
    { battleId },
    { $set: { participants: updatedParticipants, updatedAt: new Date() } },
  );

  // 3. Emit battleStart event to Socket.IO room
  if (io) {
    const payload: BattleStartPayload = {
      battleId,
      startedAt: now.toISOString(),
      runDurationMs: GROUP_BATTLE_CONFIG.battleDurationMs,
      flags: battleStartFlags,
      challengerRunId: updatedParticipants[0]?.runId ?? '',
      opponentRunId: updatedParticipants[1]?.runId ?? '',
    };
    io.to(`battle:${battleId}`).emit('battleStart', payload);
  }

  const finalDoc = await db.collection<BattleSession>('battles').findOne({ battleId });
  return finalDoc ?? startedBattle;
}

export async function finalizeGroupBattle(
  battleId: string,
  db: Db,
  redis?: RedisClient,
  io?: TypedSocketServer,
): Promise<BattleSession | null> {
  const battle = await db.collection<BattleSession>('battles').findOne({ battleId });
  if (!battle || battle.status !== 'in_progress') {
    return battle;
  }

  const now = new Date();

  // Atomic idempotency guard: only ONE execution sets rewardsDistributed: true
  const claimResult = await db.collection<BattleSession>('battles').findOneAndUpdate(
    {
      battleId,
      status: 'in_progress',
      rewardsDistributed: { $ne: true },
    },
    {
      $set: {
        status: 'completed',
        rewardsDistributed: true,
        finalizedAt: now,
        completedAt: now,
        updatedAt: now,
      },
    },
    { returnDocument: 'after' },
  );

  if (!claimResult) {
    // Already claimed or finalized by another concurrent worker: return latest document
    return db.collection<BattleSession>('battles').findOne({ battleId });
  }

  const runsCollection = db.collection<GameRun>('runs');
  const profilesCollection = db.collection<PlayerProfile>('profiles');
  const participants = claimResult.participants ?? [];

  // Collect results for each participant
  interface ParticipantScoreData {
    participant: BattleParticipant;
    score: number;
    correctCount: number;
    totalFlags: number;
    timeUsedMs: number;
  }

  const scoredList: ParticipantScoreData[] = [];

  for (const participant of participants) {
    let score = 0;
    let correctCount = 0;
    let totalFlags = 10;
    let timeUsedMs = GROUP_BATTLE_CONFIG.battleDurationMs;

    if (participant.runId) {
      const run = await runsCollection.findOne({ runId: participant.runId });
      if (run) {
        score = run.finalScore?.totalScore ?? run.runningTotal ?? 0;
        correctCount = run.flags.filter((f) => f.correct).length;
        totalFlags = run.flags.length;
        if (run.finishedAt) {
          timeUsedMs = Math.min(
            GROUP_BATTLE_CONFIG.battleDurationMs,
            new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime(),
          );
        }
      }
    }

    scoredList.push({
      participant,
      score,
      correctCount,
      totalFlags,
      timeUsedMs,
    });
  }

  // Sort descending by score, tie-break by timeUsedMs ascending
  scoredList.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.timeUsedMs - b.timeUsedMs;
  });

  const podium: GroupPodiumItem[] = [];
  const updatedParticipants: BattleParticipant[] = [];

  for (let i = 0; i < scoredList.length; i++) {
    const item = scoredList[i];
    const rank = i + 1;
    let pinsEarned = GROUP_BATTLE_CONFIG.rewardPins.participant;

    if (rank === 1) {
      pinsEarned = GROUP_BATTLE_CONFIG.rewardPins.firstPlace;
    } else if (rank === 2) {
      pinsEarned = GROUP_BATTLE_CONFIG.rewardPins.secondPlace;
    } else if (rank === 3) {
      pinsEarned = GROUP_BATTLE_CONFIG.rewardPins.thirdPlace;
    }

    // Atomically credit pins to player profile
    await profilesCollection.updateOne(
      { telegramUserId: item.participant.userId },
      { $inc: { pins: pinsEarned } },
    );

    const podiumItem: GroupPodiumItem = {
      userId: item.participant.userId,
      displayName: item.participant.displayName,
      photoUrl: item.participant.photoUrl,
      score: item.score,
      correctCount: item.correctCount,
      totalFlags: item.totalFlags,
      rank,
      pinsEarned,
    };

    podium.push(podiumItem);
    updatedParticipants.push({
      ...item.participant,
      score: item.score,
      correctCount: item.correctCount,
      totalFlags: item.totalFlags,
      rank,
      pinsEarned,
    });
  }

  // Save podium and finalized participants on the battle document
  const finalizedBattle = await db.collection<BattleSession>('battles').findOneAndUpdate(
    { battleId },
    {
      $set: {
        participants: updatedParticipants,
        podium,
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' },
  );

  // Emit groupBattleFinished to Socket.IO
  if (io) {
    const payload: GroupBattleFinishedPayload = {
      battleId,
      completedAt: now.toISOString(),
      podium,
    };
    io.to(`battle:${battleId}`).emit('groupBattleFinished', payload);
  }

  // Post victory podium notification to the Telegram group chat
  if (claimResult.chatId) {
    let podiumText = `🏆 <b>FLAGORA BATTLE FINISHED!</b> 🚩\n\n`;
    podium.forEach((p) => {
      const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `#${p.rank}`;
      podiumText += `${medal} <b>${p.displayName}</b> — ${p.score} pts (+${p.pinsEarned} 🪙)\n`;
    });
    podiumText += `\n<i>Well played everyone! Type /battle to play again.</i>`;

    void sendTelegramMessage({
      chatId: claimResult.chatId,
      text: podiumText,
      parseMode: 'HTML',
    });
  }

  return finalizedBattle ?? claimResult;
}

export async function getGroupBattleInfo(
  battleId: string,
  requestingUserId: number,
  db: Db,
): Promise<BattleInfoResponse> {
  const battle = await db.collection<BattleSession>('battles').findOne({ battleId });
  if (!battle) {
    throw new BattleNotFoundError();
  }

  const isHost = battle.hostUserId === requestingUserId;
  const isParticipant = battle.participants?.some((p) => p.userId === requestingUserId) ?? false;
  const isJoinable =
    battle.status === 'waiting' &&
    new Date(battle.expiresAt).getTime() > Date.now() &&
    !isParticipant &&
    (battle.participants?.length ?? 0) < (battle.maxPlayers ?? GROUP_BATTLE_CONFIG.defaultMaxPlayers);

  return {
    battleId: battle.battleId,
    challengerUserId: battle.challengerUserId,
    challengerTelegramUserId: battle.challengerTelegramUserId,
    challengerDisplayName: battle.participants?.[0]?.displayName ?? 'Host',
    challengerPhotoUrl: battle.participants?.[0]?.photoUrl ?? null,
    status: battle.status,
    isChallenger: isHost,
    isOwnInvite: isHost,
    isOpponent: !isHost && isParticipant,
    isJoinable,
    expiresAt: battle.expiresAt,
    isGroupBattle: Boolean(battle.isGroupBattle),
    chatId: battle.chatId,
    maxPlayers: battle.maxPlayers,
    hostUserId: battle.hostUserId,
    isHost,
    participants: battle.participants,
    podium: battle.podium,
    completedAt: battle.completedAt,
    totalFlags: 10,
    durationSeconds: GROUP_BATTLE_CONFIG.battleDurationMs / 1000,
  };
}
