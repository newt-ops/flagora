import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import type { Db } from 'mongodb';
import type { BattleSession } from '@flagora/shared';
import { createSocketAuthMiddleware } from './socketAuth.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  PingResponse,
  TypedSocketServer,
} from './socketTypes.js';

export function initSocketServer(
  httpServer: HttpServer,
  sessionSecret: string,
  db?: Db,
): TypedSocketServer {
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

    socket.on('joinBattleRoom', async (payload, callback) => {
      const { battleId } = payload;
      if (!battleId || typeof battleId !== 'string') {
        const message = 'Invalid battleId';
        socket.emit('battleError', { message, battleId });
        callback?.({ success: false, battleId, error: message });
        return;
      }

      if (!db) {
        const message = 'Database not available';
        socket.emit('battleError', { message, battleId });
        callback?.({ success: false, battleId, error: message });
        return;
      }

      const battle = await db.collection<BattleSession>('battles').findOne({ battleId });
      if (!battle) {
        const message = 'Battle not found';
        socket.emit('battleError', { message, battleId });
        callback?.({ success: false, battleId, error: message });
        return;
      }

      const isParticipant =
        battle.challengerUserId === userId ||
        (battle.opponentUserId !== null && battle.opponentUserId === userId);

      if (!isParticipant) {
        const message = 'Forbidden: You are not a participant in this battle';
        socket.emit('battleError', { message, battleId });
        callback?.({ success: false, battleId, error: message });
        return;
      }

      const roomName = `battle:${battleId}`;
      await socket.join(roomName);
      process.stdout.write(`[Socket] User ${userId} joined room ${roomName}\n`);

      callback?.({ success: true, battleId });

      const sockets = await io.in(roomName).fetchSockets();
      const presentUserIds = new Set(sockets.map((s) => s.data.telegramUserId));

      if (
        presentUserIds.has(battle.challengerUserId) &&
        battle.opponentUserId !== null &&
        presentUserIds.has(battle.opponentUserId)
      ) {
        io.to(roomName).emit('bothPlayersPresent', { battleId });
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
