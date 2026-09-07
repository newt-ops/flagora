import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { createSocketAuthMiddleware } from './socketAuth.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  PingResponse,
} from './socketTypes.js';

export function initSocketServer(
  httpServer: HttpServer,
  sessionSecret: string,
): SocketIOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData> {
  const io = new SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.use(createSocketAuthMiddleware(sessionSecret));

  io.on('connection', (socket) => {
    const userId = socket.data.telegramUserId;
    process.stdout.write(`[Socket] Client connected: socket ID ${socket.id}, user ID ${userId}\n`);

    socket.on('ping', (callback) => {
      const response: PingResponse = {
        status: 'pong',
        telegramUserId: socket.data.telegramUserId,
      };

      if (typeof callback === 'function') {
        callback(response);
      } else {
        socket.emit('pong', response);
      }
    });

    socket.on('disconnect', (reason) => {
      process.stdout.write(
        `[Socket] Client disconnected: socket ID ${socket.id}, reason: ${reason}\n`,
      );
    });
  });

  return io;
}
