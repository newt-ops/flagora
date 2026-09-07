import type { Server, Socket } from 'socket.io';
import type {
  BattleWinner,
  BattleParticipantResult,
  SocketData,
  PingResponse,
  JoinBattleRoomPayload,
  JoinBattleRoomResponse,
  OpponentJoinedPayload,
  BothPlayersPresentPayload,
  PlayerReadyPayload,
  PlayerReadyResponse,
  BattleCountdownPayload,
  BattleStartFlag,
  BattleStartPayload,
  BattleErrorPayload,
  SubmitAnswerPayload,
  AnswerResultPayload,
  OpponentProgressPayload,
  SubmitAnswerResponse,
  BattleFinishedPayload,
  BattleClientToServerEvents,
  BattleServerToClientEvents,
} from '@flagora/shared';

export type {
  BattleWinner,
  BattleParticipantResult,
  SocketData,
  PingResponse,
  JoinBattleRoomPayload,
  JoinBattleRoomResponse,
  OpponentJoinedPayload,
  BothPlayersPresentPayload,
  PlayerReadyPayload,
  PlayerReadyResponse,
  BattleCountdownPayload,
  BattleStartFlag,
  BattleStartPayload,
  BattleErrorPayload,
  SubmitAnswerPayload,
  AnswerResultPayload,
  OpponentProgressPayload,
  SubmitAnswerResponse,
  BattleFinishedPayload,
  BattleClientToServerEvents,
  BattleServerToClientEvents,
};

export type ClientToServerEvents = BattleClientToServerEvents;
export type ServerToClientEvents = BattleServerToClientEvents;

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
