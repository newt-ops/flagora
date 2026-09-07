import crypto from 'node:crypto';
import type { Db } from 'mongodb';
import {
  COUNTRIES,
  DEFAULT_RUN_TIER_MIX,
  getEffectiveChallengeStatus,
  getDisplayName,
  type Challenge,
  type ChallengeFlagItem,
  type CreateChallengeResponse,
  type AcceptChallengeResponse,
  type ChallengeInfoResponse,
  type PlayerProfile,
} from '@flagora/shared';
import { selectRunFlags, generateChoices } from '../game/flagSelection.js';
import { createRun } from '../game/runService.js';
import type { RunFlagItem } from '../game/runTypes.js';
import {
  ChallengeNotFoundError,
  ChallengeExpiredError,
  ChallengeAlreadyCompletedError,
  ChallengeNotCompletedError,
  SelfChallengeNotAllowedError,
  ChallengeAlreadyAcceptedError,
  UnauthorizedChallengeAccessError,
} from './challengeTypes.js';
import {
  notifyRematchInvitation,
  type TelegramServiceOverrides,
} from '../telegram/telegramService.js';

export async function createChallenge(
  challengerUserId: number,
  db: Db,
): Promise<CreateChallengeResponse> {
  const collection = db.collection<Challenge>('challenges');
  await collection.createIndex({ challengeId: 1 }, { unique: true });
  await collection.createIndex({ expiresAt: 1 });

  const selected = selectRunFlags(DEFAULT_RUN_TIER_MIX, [], COUNTRIES);
  const runFlags: RunFlagItem[] = selected.map((flag, index) => {
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

  const challengeFlags: ChallengeFlagItem[] = runFlags.map((flag) => ({
    flagIndex: flag.flagIndex,
    isoCode: flag.isoCode,
    name: flag.name,
    tier: flag.tier,
    choices: [...flag.choices],
  }));

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const challengeId = crypto.randomUUID();
  const challengerRunId = crypto.randomUUID();

  const challengeDocument: Challenge = {
    challengeId,
    challengerUserId,
    flags: challengeFlags,
    challengerRunId,
    challengerScore: null,
    opponentUserId: null,
    opponentRunId: null,
    opponentScore: null,
    status: 'pending',
    createdAt: now,
    expiresAt,
    updatedAt: now,
  };

  await collection.insertOne({ ...challengeDocument });

  const run = await createRun(challengerUserId, db, {
    runId: challengerRunId,
    mode: 'challenge',
    challengeId,
    flags: runFlags,
  });

  return {
    ...run,
    challengeId,
  };
}

export async function getChallenge(
  challengeId: string,
  db: Db,
): Promise<Challenge | null> {
  const collection = db.collection<Challenge>('challenges');
  const challenge = await collection.findOne({ challengeId });
  if (!challenge) {
    return null;
  }

  const effectiveStatus = getEffectiveChallengeStatus(challenge);
  if (effectiveStatus !== challenge.status) {
    const now = new Date();
    await collection.updateOne(
      { challengeId },
      {
        $set: {
          status: effectiveStatus,
          updatedAt: now,
        },
      },
    );
    challenge.status = effectiveStatus;
    challenge.updatedAt = now;
  }

  return challenge;
}

export async function getChallengeInfo(
  challengeId: string,
  requestingUserId: number,
  db: Db,
): Promise<ChallengeInfoResponse> {
  const challenge = await getChallenge(challengeId, db);
  if (!challenge) {
    throw new ChallengeNotFoundError();
  }

  const profilesCollection = db.collection<PlayerProfile>('profiles');
  const challengerProfile = await profilesCollection.findOne({ telegramUserId: challenge.challengerUserId });
  const challengerDisplayName = challengerProfile
    ? getDisplayName(challengerProfile)
    : `Player ${challenge.challengerUserId}`;

  const isOpen = challenge.status === 'pending' && challenge.opponentUserId === null;
  const isChallenger = requestingUserId === challenge.challengerUserId;
  const isOpponent = Boolean(challenge.opponentUserId && requestingUserId === challenge.opponentUserId);

  let opponentDisplayName: string | null = null;
  let opponentPhotoUrl: string | null = null;
  if (challenge.opponentUserId) {
    const opponentProfile = await profilesCollection.findOne({ telegramUserId: challenge.opponentUserId });
    opponentDisplayName = opponentProfile
      ? getDisplayName(opponentProfile)
      : `Player ${challenge.opponentUserId}`;
    opponentPhotoUrl = opponentProfile?.photoUrl ?? null;
  }

  return {
    challengeId: challenge.challengeId,
    challengerUserId: challenge.challengerUserId,
    challengerDisplayName,
    challengerPhotoUrl: challengerProfile?.photoUrl ?? null,
    challengerScore: challenge.challengerScore,
    status: challenge.status,
    isOpen,
    isChallenger,
    isOpponent,
    expiresAt: challenge.expiresAt,
    opponentUserId: challenge.opponentUserId,
    opponentDisplayName,
    opponentPhotoUrl,
    opponentScore: challenge.opponentScore,
    winner: challenge.winner ?? null,
  };
}

export async function acceptChallenge(
  challengeId: string,
  opponentUserId: number,
  db: Db,
): Promise<AcceptChallengeResponse> {
  const challenge = await getChallenge(challengeId, db);
  if (!challenge) {
    throw new ChallengeNotFoundError();
  }

  if (challenge.status === 'expired') {
    throw new ChallengeExpiredError();
  }

  if (challenge.status === 'completed') {
    throw new ChallengeAlreadyCompletedError();
  }

  if (challenge.challengerUserId === opponentUserId) {
    throw new SelfChallengeNotAllowedError();
  }

  if (challenge.opponentUserId !== null) {
    throw new ChallengeAlreadyAcceptedError();
  }

  const now = new Date();
  const opponentRunId = crypto.randomUUID();
  const collection = db.collection<Challenge>('challenges');

  const claimResult = await collection.findOneAndUpdate(
    {
      challengeId,
      status: 'pending',
      opponentUserId: null,
      challengerUserId: { $ne: opponentUserId },
      expiresAt: { $gt: now },
    },
    {
      $set: {
        opponentUserId,
        opponentRunId,
        updatedAt: now,
      },
    },
    { returnDocument: 'after' },
  );

  if (!claimResult) {
    const refreshed = await getChallenge(challengeId, db);
    if (!refreshed) {
      throw new ChallengeNotFoundError();
    }
    if (refreshed.status === 'expired') {
      throw new ChallengeExpiredError();
    }
    if (refreshed.status === 'completed') {
      throw new ChallengeAlreadyCompletedError();
    }
    if (refreshed.challengerUserId === opponentUserId) {
      throw new SelfChallengeNotAllowedError();
    }
    if (refreshed.opponentUserId !== null) {
      throw new ChallengeAlreadyAcceptedError();
    }
    throw new ChallengeExpiredError();
  }

  const opponentFlags: RunFlagItem[] = challenge.flags.map((flag) => ({
    flagIndex: flag.flagIndex,
    isoCode: flag.isoCode,
    name: flag.name,
    tier: flag.tier,
    choices: [...flag.choices],
    answered: false,
  }));

  const run = await createRun(opponentUserId, db, {
    runId: opponentRunId,
    mode: 'challenge',
    challengeId,
    flags: opponentFlags,
  });

  return {
    ...run,
    challengeId,
  };
}

export async function rematchChallenge(
  challengeId: string,
  requestingUserId: number,
  db: Db,
  overrides?: TelegramServiceOverrides,
): Promise<CreateChallengeResponse> {
  const challenge = await getChallenge(challengeId, db);
  if (!challenge) {
    throw new ChallengeNotFoundError();
  }

  if (challenge.status !== 'completed') {
    throw new ChallengeNotCompletedError();
  }

  const isChallenger = challenge.challengerUserId === requestingUserId;
  const isOpponent = challenge.opponentUserId === requestingUserId;
  if (!isChallenger && !isOpponent) {
    throw new UnauthorizedChallengeAccessError();
  }

  const targetUserId = isChallenger ? challenge.opponentUserId! : challenge.challengerUserId;

  const newChallenge = await createChallenge(requestingUserId, db);

  await notifyRematchInvitation(
    newChallenge.challengeId,
    targetUserId,
    requestingUserId,
    db,
    overrides,
  );

  return newChallenge;
}
