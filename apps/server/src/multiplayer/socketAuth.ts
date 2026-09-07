import type { Socket } from 'socket.io';
import { verifySessionToken, SessionError } from '../session/tokens.js';
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from './socketTypes.js';

export function createSocketAuthMiddleware(sessionSecret: string) {
  return (
    socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
    next: (err?: Error) => void,
  ): void => {
    const auth = socket.handshake.auth as Record<string, unknown> | undefined;
    const token =
      typeof auth?.token === 'string'
        ? auth.token
        : typeof auth?.sessionToken === 'string'
          ? auth.sessionToken
          : null;

    if (!token) {
      process.stdout.write('[Socket] Handshake rejected: Missing session token\n');
      next(new Error('Authentication error: Missing session token'));
      return;
    }

    try {
      const payload = verifySessionToken(token, sessionSecret);
      socket.data.telegramUserId = payload.telegramUserId;
      process.stdout.write(`[Socket] Handshake authenticated user ID: ${payload.telegramUserId}\n`);
      next();
    } catch (error) {
      const message = error instanceof SessionError ? error.message : 'Invalid session token';
      process.stdout.write(`[Socket] Handshake rejected: ${message}\n`);
      next(new Error(`Authentication error: ${message}`));
    }
  };
}
