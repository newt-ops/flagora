import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Response } from 'express';
import type { Socket } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { initSocketServer } from './socketServer.js';
import { createSocketAuthMiddleware } from './socketAuth.js';
import {
  createRequireSessionMiddleware,
  type AuthenticatedSessionRequest,
} from '../session/requireSession.js';
import { createSessionToken } from '../session/tokens.js';
import type {
  PingResponse,
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from './socketTypes.js';

const TEST_SECRET = 'multiplayer_socket_test_secret_32_characters_123';


describe('multiplayer socket infrastructure', () => {
  let httpServer: http.Server;
  let serverUrl: string;
  const activeSockets: ClientSocket[] = [];

  function createClient(options: { auth?: Record<string, unknown> }): ClientSocket {
    const client = ioClient(serverUrl, {
      autoConnect: true,
      transports: ['websocket'],
      reconnection: false,
      ...options,
    });
    activeSockets.push(client);
    return client;
  }

  before(async () => {
    httpServer = http.createServer();
    initSocketServer(httpServer, TEST_SECRET);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });

    const address = httpServer.address() as AddressInfo;
    serverUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    for (const socket of activeSockets) {
      if (socket.connected) {
        socket.disconnect();
      }
    }
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  it('allows connection with valid session token and responds to ping with pong', async () => {
    const userId = 778899;
    const token = createSessionToken(userId, TEST_SECRET, '1h');

    const client = createClient({
      auth: { token },
    });

    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', (err) => reject(err));
    });

    assert.equal(client.connected, true);

    const ackResponse = await new Promise<PingResponse>((resolve) => {
      client.emit('ping', (res: PingResponse) => {
        resolve(res);
      });
    });

    assert.equal(ackResponse.status, 'pong');
    assert.equal(ackResponse.telegramUserId, userId);

    const eventResponse = await new Promise<PingResponse>((resolve) => {
      client.on('pong', (data: PingResponse) => {
        resolve(data);
      });
      client.emit('ping');
    });

    assert.equal(eventResponse.status, 'pong');
    assert.equal(eventResponse.telegramUserId, userId);
  });

  it('allows connection using sessionToken field in auth payload', async () => {
    const userId = 554433;
    const sessionToken = createSessionToken(userId, TEST_SECRET, '1h');

    const client = createClient({
      auth: { sessionToken },
    });

    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', (err) => reject(err));
    });

    assert.equal(client.connected, true);

    const ackResponse = await new Promise<PingResponse>((resolve) => {
      client.emit('ping', (res: PingResponse) => {
        resolve(res);
      });
    });

    assert.equal(ackResponse.telegramUserId, userId);
  });

  it('rejects connection at handshake when session token is missing', async () => {
    const client = createClient({
      auth: {},
    });

    const error = await new Promise<Error>((resolve) => {
      client.on('connect_error', (err) => resolve(err));
      client.on('connect', () => {
        assert.fail('Should not have connected without token');
      });
    });

    assert.equal(client.connected, false);
    assert.ok(error.message.includes('Missing session token'));
  });

  it('rejects connection at handshake when session token is expired', async () => {
    const expiredToken = createSessionToken(12345, TEST_SECRET, '-1s');

    const client = createClient({
      auth: { token: expiredToken },
    });

    const error = await new Promise<Error>((resolve) => {
      client.on('connect_error', (err) => resolve(err));
      client.on('connect', () => {
        assert.fail('Should not have connected with expired token');
      });
    });

    assert.equal(client.connected, false);
    assert.ok(error.message.includes('Session token is expired'));
  });

  it('rejects connection at handshake when session token is tampered or invalid', async () => {
    const client = createClient({
      auth: { token: 'invalid.tampered.token' },
    });

    const error = await new Promise<Error>((resolve) => {
      client.on('connect_error', (err) => resolve(err));
      client.on('connect', () => {
        assert.fail('Should not have connected with invalid token');
      });
    });

    assert.equal(client.connected, false);
    assert.ok(error.message.includes('Session token is invalid'));
  });

  describe('parity between REST middleware and socket handshake verification', () => {
    const restMiddleware = createRequireSessionMiddleware(TEST_SECRET);
    const socketMiddleware = createSocketAuthMiddleware(TEST_SECRET);

    it('authenticates valid token identically on both transports', () => {
      const userId = 445566;
      const token = createSessionToken(userId, TEST_SECRET, '1h');

      let restUserId: number | undefined;
      const mockReq = {
        header: (name: string) => (name.toLowerCase() === 'authorization' ? `Bearer ${token}` : undefined),
      } as unknown as AuthenticatedSessionRequest;
      const mockRes = {} as unknown as Response;
      restMiddleware(mockReq, mockRes, () => {
        restUserId = mockReq.sessionUser?.telegramUserId;
      });

      let socketUserId: number | undefined;
      const mockSocket = {
        handshake: { auth: { token } },
        data: {},
      } as unknown as Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
      socketMiddleware(mockSocket, (err) => {
        assert.ifError(err);
        socketUserId = mockSocket.data.telegramUserId;
      });

      assert.equal(restUserId, userId);
      assert.equal(socketUserId, userId);
      assert.equal(restUserId, socketUserId);
    });

    it('rejects expired token on both transports with expired indicator', () => {
      const expiredToken = createSessionToken(12345, TEST_SECRET, '-1s');

      let restStatus: number | undefined;
      let restMessage: string | undefined;
      const mockReq = {
        header: (name: string) => (name.toLowerCase() === 'authorization' ? `Bearer ${expiredToken}` : undefined),
      } as unknown as AuthenticatedSessionRequest;
      const mockRes = {
        status: (code: number) => {
          restStatus = code;
          return {
            json: (body: { message?: string }) => {
              restMessage = body.message;
            },
          };
        },
      } as unknown as Response;
      restMiddleware(mockReq, mockRes, () => {
        assert.fail('REST should not call next on expired token');
      });

      let socketError: Error | undefined;
      const mockSocket = {
        handshake: { auth: { token: expiredToken } },
        data: {},
      } as unknown as Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
      socketMiddleware(mockSocket, (err) => {
        socketError = err;
      });

      assert.equal(restStatus, 401);
      assert.ok(restMessage?.includes('expired'));
      assert.ok(socketError?.message.includes('expired'));
    });

    it('rejects tampered token on both transports with invalid indicator', () => {
      const tamperedToken = 'invalid.jwt.token';

      let restStatus: number | undefined;
      let restMessage: string | undefined;
      const mockReq = {
        header: (name: string) => (name.toLowerCase() === 'authorization' ? `Bearer ${tamperedToken}` : undefined),
      } as unknown as AuthenticatedSessionRequest;
      const mockRes = {
        status: (code: number) => {
          restStatus = code;
          return {
            json: (body: { message?: string }) => {
              restMessage = body.message;
            },
          };
        },
      } as unknown as Response;
      restMiddleware(mockReq, mockRes, () => {
        assert.fail('REST should not call next on tampered token');
      });

      let socketError: Error | undefined;
      const mockSocket = {
        handshake: { auth: { token: tamperedToken } },
        data: {},
      } as unknown as Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
      socketMiddleware(mockSocket, (err) => {
        socketError = err;
      });

      assert.equal(restStatus, 401);
      assert.ok(restMessage?.includes('invalid'));
      assert.ok(socketError?.message.includes('invalid'));
    });
  });
});
