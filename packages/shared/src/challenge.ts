import type { FlagTier } from './flags.js';
import type { StartRunResponse } from './scoring.js';

export interface ChallengeFlagItem {
  flagIndex: number;
  isoCode: string;
  name: string;
  tier: FlagTier;
  choices: string[];
}

export type ChallengeStatus = 'pending' | 'completed' | 'expired';

export interface Challenge {
  challengeId: string;
  challengerUserId: number;
  flags: ChallengeFlagItem[];
  challengerRunId: string;
  challengerScore: number | null;
  opponentUserId: number | null;
  opponentRunId: string | null;
  opponentScore: number | null;
  status: ChallengeStatus;
  createdAt: Date | string;
  expiresAt: Date | string;
  updatedAt: Date | string;
}

export interface CreateChallengeResponse extends StartRunResponse {
  challengeId: string;
}

export function getEffectiveChallengeStatus(
  challenge: Challenge,
  now: Date = new Date(),
): ChallengeStatus {
  if (challenge.status === 'completed') {
    return 'completed';
  }
  const expiryTime = new Date(challenge.expiresAt).getTime();
  if (now.getTime() >= expiryTime) {
    return 'expired';
  }
  return challenge.status;
}
