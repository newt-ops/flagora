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

export type ChallengeWinner = 'challenger' | 'opponent' | 'tie';

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
  winner?: ChallengeWinner | null;
  createdAt: Date | string;
  expiresAt: Date | string;
  updatedAt: Date | string;
}

export interface CreateChallengeResponse extends StartRunResponse {
  challengeId: string;
}

export interface AcceptChallengeResponse extends StartRunResponse {
  challengeId: string;
}

export interface ChallengeInfoResponse {
  challengeId: string;
  challengerUserId: number;
  challengerDisplayName: string;
  challengerPhotoUrl?: string | null;
  challengerScore: number | null;
  status: ChallengeStatus;
  isOpen: boolean;
  isChallenger: boolean;
  isOpponent: boolean;
  expiresAt: Date | string;
  opponentUserId?: number | null;
  opponentDisplayName?: string | null;
  opponentPhotoUrl?: string | null;
  opponentScore?: number | null;
  winner?: ChallengeWinner | null;
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

export function getChallengeDeepLink(
  challengeId: string,
  botUsername: string = 'flagora_bot',
): string {
  const cleanUsername = botUsername.replace(/^@/, '');
  return `https://t.me/${cleanUsername}?startapp=${encodeURIComponent(challengeId)}`;
}
