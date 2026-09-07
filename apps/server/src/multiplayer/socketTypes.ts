import type { Server, Socket } from 'socket.io';

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
}

export interface ClientToServerEvents {
  ping: (callback?: (response: PingResponse) => void) => void;
  joinBattleRoom: (
    payload: JoinBattleRoomPayload,
    callback?: (response: JoinBattleRoomResponse) => void,
  ) => void;
  playerReady: (
    payload: PlayerReadyPayload,
    callback?: (response: PlayerReadyResponse) => void,
  ) => void;
}

export interface ServerToClientEvents {
  pong: (response: PingResponse) => void;
  opponentJoined: (payload: OpponentJoinedPayload) => void;
  bothPlayersPresent: (payload: BothPlayersPresentPayload) => void;
  battleCountdown: (payload: BattleCountdownPayload) => void;
  battleStart: (payload: BattleStartPayload) => void;
  battleError: (payload: BattleErrorPayload) => void;
}

export type TypedSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
