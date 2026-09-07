export interface SocketData {
  telegramUserId: number;
}

export interface PingResponse {
  status: 'pong';
  telegramUserId: number;
}

export interface ClientToServerEvents {
  ping: (callback?: (response: PingResponse) => void) => void;
}

export interface ServerToClientEvents {
  pong: (response: PingResponse) => void;
}
