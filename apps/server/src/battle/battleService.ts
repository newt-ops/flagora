import crypto from 'node:crypto';
import type { Db } from 'mongodb';
import type {
  PlayerProfile,
  BattleSession,
  CreateBattleResponse,
  BattleInfoResponse,
  JoinBattleResponse,
} from '@flagora/shared';
import { getEffectiveBattleStatus, getDisplayName } from '@flagora/shared';
import {
  BattleNotFoundError,
  BattleExpiredError,
  SelfBattleNotAllowedError,
  BattleAlreadyJoinedError,
} from './battleTypes.js';
import type { TypedSocketServer } from '../multiplayer/socketTypes.js';

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

export async function getBattleInfo(
  battleId: string,
  requestingUserId: number,
  db: Db,
): Promise<BattleInfoResponse> {
  const battle = await db.collection<BattleSession>('battles').findOne({ battleId });
  if (!battle) {
    throw new BattleNotFoundError();
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

  return {
    battleId: battle.battleId,
    challengerUserId: battle.challengerUserId,
    challengerTelegramUserId: battle.challengerUserId,
    challengerDisplayName,
    challengerPhotoUrl,
    status: effectiveStatus,
    isChallenger,
    isOwnInvite,
    isOpponent,
    isJoinable,
    expiresAt: battle.expiresAt,
    opponentUserId: battle.opponentUserId,
    opponentTelegramUserId: battle.opponentUserId,
    opponentDisplayName,
    opponentPhotoUrl,
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
