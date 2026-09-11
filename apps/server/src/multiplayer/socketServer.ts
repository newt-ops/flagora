import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import type { Db } from 'mongodb';
import type { Redis as RedisClient } from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import type { BattleSession } from '@flagora/shared';
import { createSocketAuthMiddleware } from './socketAuth.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  PingResponse,
  TypedSocketServer,
} from './socketTypes.js';
import {
  startBattleSession,
  submitBattleAnswer,
} from '../battle/battleService.js';
import { notifyOpponentReady } from '../telegram/telegramService.js';
import {
  BattleNotFoundError,
  UnauthorizedBattleAccessError,
  BattleNotInProgressError,
} from '../battle/battleTypes.js';
import {
  RunNotFoundError,
  RunAlreadyFinishedError,
  FlagAlreadyAnsweredError,
  InvalidFlagIndexError,
  TimeExpiredError,
} from '../game/runTypes.js';
import { getRedis } from '../db/redis.js';
import {
  addBattlePresence,
  removeBattlePresence,
  areBothPlayersPresent,
  markPlayerReady,
  acquireCountdownLock,
} from '../battle/battlePresence.js';

export interface SocketServerOptions {
  countdownDelayMs?: number;
  redis?: RedisClient | null;
}

export function initSocketServer(
  httpServer: HttpServer,
  sessionSecret: string,
  db?: Db,
  options?: SocketServerOptions,
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

  let redisClient: RedisClient | null = options?.redis ?? null;
  if (!redisClient) {
    try {
      redisClient = getRedis();
    } catch {
      redisClient = null;
    }
  }

  if (redisClient) {
    const pubClient = redisClient;
    const subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
  }

  io.use(createSocketAuthMiddleware(sessionSecret));

  io.on('connection', (socket) => {
    const userId = socket.data.telegramUserId;
    const joinedBattles = new Set<string>();
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
      joinedBattles.add(battleId);
      await addBattlePresence(redisClient, battleId, userId, socket.id);
      process.stdout.write(`[Socket] User ${userId} joined room ${roomName}\n`);

      callback?.({ success: true, battleId });

      const bothPresent = await areBothPlayersPresent(
        redisClient,
        battleId,
        battle.challengerUserId,
        battle.opponentUserId,
      );

      if (bothPresent) {
        io.to(roomName).emit('bothPlayersPresent', { battleId });
      }
    });

    socket.on('playerReady', async (payload, callback) => {
      const { battleId } = payload;
      if (!battleId || typeof battleId !== 'string') {
        const message = 'Invalid battleId';
        socket.emit('battleError', { message, battleId });
        callback?.({ success: false, battleId, readyCount: 0, error: message });
        return;
      }

      if (!db) {
        const message = 'Database not available';
        socket.emit('battleError', { message, battleId });
        callback?.({ success: false, battleId, readyCount: 0, error: message });
        return;
      }

      const battle = await db.collection<BattleSession>('battles').findOne({ battleId });
      if (!battle) {
        const message = 'Battle not found';
        socket.emit('battleError', { message, battleId });
        callback?.({ success: false, battleId, readyCount: 0, error: message });
        return;
      }

      const isParticipant =
        battle.challengerUserId === userId ||
        (battle.opponentUserId !== null && battle.opponentUserId === userId);

      if (!isParticipant) {
        const message = 'Forbidden: You are not a participant in this battle';
        socket.emit('battleError', { message, battleId });
        callback?.({ success: false, battleId, readyCount: 0, error: message });
        return;
      }

      if (battle.status !== 'ready') {
        const message = 'Battle is not in ready status';
        socket.emit('battleError', { message, battleId });
        callback?.({ success: false, battleId, readyCount: 0, error: message });
        return;
      }

      const readyState = await markPlayerReady(
        redisClient,
        battleId,
        userId,
        battle.challengerUserId,
        battle.opponentUserId,
      );

      callback?.({ success: true, battleId, readyCount: readyState.readyCount });

      const roomName = `battle:${battleId}`;
      io.to(roomName).emit('battlePlayerReady', {
        battleId,
        userId,
        readyCount: readyState.readyCount,
        challengerReady: readyState.challengerReady,
        opponentReady: readyState.opponentReady,
      });

      void notifyOpponentReady(battleId, userId, db);

      if (readyState.bothReady) {
        const canStartCountdown = await acquireCountdownLock(redisClient, battleId);
        if (canStartCountdown) {
          io.to(roomName).emit('battleCountdown', { battleId, countdownSeconds: 3 });

          let tick = 2;
          const intervalId = setInterval(() => {
            if (tick > 0) {
              io.to(roomName).emit('battleCountdown', { battleId, countdownSeconds: tick });
              tick--;
            } else {
              clearInterval(intervalId);
            }
          }, 1000);
          intervalId.unref?.();

          const delay = options?.countdownDelayMs ?? 3000;
          const timerId = setTimeout(async () => {
            clearInterval(intervalId);
            try {
              await startBattleSession(battleId, db, io);
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : 'Failed to start battle';
              io.to(roomName).emit('battleError', { message: errorMsg, battleId });
            }
          }, delay);
          timerId.unref?.();
        }
      }
    });

    socket.on('submitAnswer', async (payload, callback) => {
      const { battleId, flagIndex, selectedIsoCode } = payload ?? {};
      if (
        !battleId ||
        typeof battleId !== 'string' ||
        typeof flagIndex !== 'number' ||
        typeof selectedIsoCode !== 'string'
      ) {
        const message = 'Invalid payload for submitAnswer';
        socket.emit('battleError', { message, battleId });
        callback?.({ success: false, error: 'Bad request', message });
        return;
      }

      if (!db) {
        const message = 'Database not available';
        socket.emit('battleError', { message, battleId });
        callback?.({ success: false, error: 'Internal server error', message });
        return;
      }

      try {
        const result = await submitBattleAnswer(
          battleId,
          userId,
          flagIndex,
          selectedIsoCode,
          db,
          Date.now(),
          undefined,
          io,
        );

        socket.emit('answerResult', result.answerResult);
        callback?.({ success: true, result: result.answerResult });

        const roomName = `battle:${battleId}`;
        socket.to(roomName).emit('opponentProgress', result.opponentProgress);
      } catch (error) {
        if (error instanceof TimeExpiredError) {
          socket.emit('battleError', {
            error: 'Time expired',
            message: error.message,
            timeExpired: true,
            battleId,
          });
          callback?.({
            success: false,
            error: 'Time expired',
            message: error.message,
            timeExpired: true,
          });
          return;
        }

        if (
          error instanceof FlagAlreadyAnsweredError ||
          error instanceof InvalidFlagIndexError ||
          error instanceof RunAlreadyFinishedError ||
          error instanceof BattleNotInProgressError
        ) {
          socket.emit('battleError', {
            error: 'Bad request',
            message: error.message,
            battleId,
          });
          callback?.({
            success: false,
            error: 'Bad request',
            message: error.message,
          });
          return;
        }

        if (error instanceof UnauthorizedBattleAccessError) {
          socket.emit('battleError', {
            error: 'Forbidden',
            message: error.message,
            battleId,
          });
          callback?.({
            success: false,
            error: 'Forbidden',
            message: error.message,
          });
          return;
        }

        if (error instanceof BattleNotFoundError || error instanceof RunNotFoundError) {
          socket.emit('battleError', {
            error: 'Not found',
            message: error.message,
            battleId,
          });
          callback?.({
            success: false,
            error: 'Not found',
            message: error.message,
          });
          return;
        }

        const message = error instanceof Error ? error.message : 'Answer submission failed';
        socket.emit('battleError', { message, battleId });
        callback?.({ success: false, error: 'Internal server error', message });
      }
    });

    socket.on('disconnect', (reason) => {
      for (const battleId of joinedBattles) {
        void removeBattlePresence(redisClient, battleId, userId, socket.id);
      }
      process.stdout.write(
        `[Socket] Client disconnected: socket ID ${socket.id}, reason: ${reason}\n`,
      );
    });
  });

  return io;
}
