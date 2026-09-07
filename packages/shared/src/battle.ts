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

export function getBattleDeepLink(
  battleId: string,
  botUsername: string = 'FlagoraBot',
): string {
  const cleanUsername = botUsername.replace(/^@/, '');
  return `https://t.me/${cleanUsername}?startapp=${encodeURIComponent(`battle_${battleId}`)}`;
}

export interface SocketData {
  telegramUserId: number;
}

export interface PingResponse {
  status: 'pong';
  telegramUserId: number;
}

export interface JoinBattleRoomPayload {
  battleId: string;
}

export interface JoinBattleRoomResponse {
  success: boolean;
  battleId: string;
  error?: string;
}

export interface OpponentJoinedPayload {
  battleId: string;
  opponentUserId: number;
  opponentDisplayName?: string | null;
  opponentPhotoUrl?: string | null;
}

export interface BothPlayersPresentPayload {
  battleId: string;
}

export interface PlayerReadyPayload {
  battleId: string;
}

export interface PlayerReadyResponse {
  success: boolean;
  battleId: string;
  readyCount: number;
  error?: string;
}

export interface BattleCountdownPayload {
  battleId: string;
  countdownSeconds: number;
}

export interface BattleStartFlag {
  flagIndex: number;
  isoCode: string;
  choices: string[];
}

export interface BattleStartPayload {
  battleId: string;
  startedAt: string;
  runDurationMs: number;
  flags: BattleStartFlag[];
  challengerRunId: string;
  opponentRunId: string;
}

export interface BattleErrorPayload {
  message: string;
  battleId?: string;
  error?: string;
  timeExpired?: boolean;
}

export interface SubmitAnswerPayload {
  battleId: string;
  flagIndex: number;
  selectedIsoCode: string;
}

export interface AnswerResultPayload {
  correct: boolean;
  comboCount: number;
  pointsThisFlag: number;
  runningTotal: number;
}

export interface OpponentProgressPayload {
  flagIndex: number;
  correct: boolean;
  runningTotal: number;
}

export interface SubmitAnswerResponse {
  success: boolean;
  result?: AnswerResultPayload;
  error?: string;
  message?: string;
  timeExpired?: boolean;
}

export interface BattleFinishedPayload {
  battleId: string;
  winner: BattleWinner;
  challengerScore: number;
  opponentScore: number;
  completedAt: string;
  challengerResult: BattleParticipantResult;
  opponentResult: BattleParticipantResult;
}

export interface BattleClientToServerEvents {
  ping: (callback?: (response: PingResponse) => void) => void;
  joinBattleRoom: (
    payload: JoinBattleRoomPayload,
    callback?: (response: JoinBattleRoomResponse) => void,
  ) => void;
  playerReady: (
    payload: PlayerReadyPayload,
    callback?: (response: PlayerReadyResponse) => void,
  ) => void;
  submitAnswer: (
    payload: SubmitAnswerPayload,
    callback?: (response: SubmitAnswerResponse) => void,
  ) => void;
}

export interface BattleServerToClientEvents {
  pong: (response: PingResponse) => void;
  opponentJoined: (payload: OpponentJoinedPayload) => void;
  bothPlayersPresent: (payload: BothPlayersPresentPayload) => void;
  battleCountdown: (payload: BattleCountdownPayload) => void;
  battleStart: (payload: BattleStartPayload) => void;
  battleError: (payload: BattleErrorPayload) => void;
  answerResult: (payload: AnswerResultPayload) => void;
  opponentProgress: (payload: OpponentProgressPayload) => void;
  battleFinished: (payload: BattleFinishedPayload) => void;
}
