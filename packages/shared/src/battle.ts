export type BattleStatus = 'waiting' | 'ready' | 'in_progress' | 'completed' | 'expired';

export type BattleWinner = 'challenger' | 'opponent' | 'tie';

export interface BattleSession {
  battleId: string;
  challengerUserId: number;
  challengerTelegramUserId?: number;
  opponentUserId: number | null;
  opponentTelegramUserId?: number | null;
  status: BattleStatus;
  challengerRunId?: string | null;
  opponentRunId?: string | null;
  startedAt?: Date | string | null;
  winner?: BattleWinner | null;
  challengerScore?: number | null;
  opponentScore?: number | null;
  completedAt?: Date | string | null;
  createdAt: Date | string;
  expiresAt: Date | string;
  updatedAt: Date | string;
}

export interface CreateBattleResponse {
  battleId: string;
  status: BattleStatus;
  expiresAt: Date | string;
}

export interface BattleParticipantResult {
  userId: number;
  displayName: string;
  photoUrl?: string | null;
  score: number;
  correctCount: number;
  totalFlags: number;
}

export interface BattleInfoResponse {
  battleId: string;
  challengerUserId: number;
  challengerTelegramUserId?: number;
  challengerDisplayName: string;
  challengerPhotoUrl?: string | null;
  status: BattleStatus;
  isChallenger: boolean;
  isOwnInvite: boolean;
  isOpponent: boolean;
  isJoinable: boolean;
  expiresAt: Date | string;
  opponentUserId?: number | null;
  opponentTelegramUserId?: number | null;
  opponentDisplayName?: string | null;
  opponentPhotoUrl?: string | null;
  winner?: BattleWinner | null;
  challengerScore?: number | null;
  opponentScore?: number | null;
  completedAt?: Date | string | null;
  challengerResult?: BattleParticipantResult | null;
  opponentResult?: BattleParticipantResult | null;
}

export interface JoinBattleResponse {
  battleId: string;
  status: BattleStatus;
  opponentUserId: number;
  opponentTelegramUserId?: number;
}

export function getEffectiveBattleStatus(
  battle: BattleSession,
  now: Date = new Date(),
): BattleStatus {
  if (battle.status === 'completed' || battle.status === 'in_progress') {
    return battle.status;
  }
  const expiryTime = new Date(battle.expiresAt).getTime();
  if (now.getTime() >= expiryTime) {
    return 'expired';
  }
  return battle.status;
}
