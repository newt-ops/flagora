import crypto from 'node:crypto';
import type { Db } from 'mongodb';
import {
  COUNTRIES,
  DEFAULT_RUN_TIER_MIX,
  getEffectiveChallengeStatus,
  type Challenge,
  type ChallengeFlagItem,
  type CreateChallengeResponse,
} from '@flagora/shared';
import { selectRunFlags, generateChoices } from '../game/flagSelection.js';
import { createRun } from '../game/runService.js';
import type { RunFlagItem } from '../game/runTypes.js';

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
