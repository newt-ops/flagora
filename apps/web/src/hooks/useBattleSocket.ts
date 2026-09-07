import { useEffect, useRef, useState, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  BattleClientToServerEvents,
  BattleServerToClientEvents,
  JoinBattleRoomResponse,
  OpponentJoinedPayload,
  PlayerReadyResponse,
  BattleCountdownPayload,
  BattleStartPayload,
  BattleErrorPayload,
  OpponentProgressPayload,
  BattleFinishedPayload,
  SubmitAnswerResponse,
} from '@flagora/shared';

const API_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'http://localhost:3001';

type TypedClientSocket = Socket<BattleServerToClientEvents, BattleClientToServerEvents>;

interface UseBattleSocketOptions {
  sessionToken: string | null;
  battleId: string | null;
  onBattleStart?: (payload: BattleStartPayload) => void;
  onBattleFinished?: (payload: BattleFinishedPayload) => void;
}

export interface UseBattleSocketReturn {
  isConnected: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  bothPlayersPresent: boolean;
  opponentJoined: OpponentJoinedPayload | null;
  isReady: boolean;
  countdown: number | null;
  startPayload: BattleStartPayload | null;
  opponentProgress: OpponentProgressPayload | null;
  finishedPayload: BattleFinishedPayload | null;
  error: string | null;
  sendReady: () => Promise<boolean>;
  submitAnswer: (flagIndex: number, selectedIsoCode: string) => Promise<SubmitAnswerResponse>;
}

export function useBattleSocket({
  sessionToken,
  battleId,
  onBattleStart,
  onBattleFinished,
}: UseBattleSocketOptions): UseBattleSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [bothPlayersPresent, setBothPlayersPresent] = useState(false);
  const [opponentJoined, setOpponentJoined] = useState<OpponentJoinedPayload | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [startPayload, setStartPayload] = useState<BattleStartPayload | null>(null);
  const [opponentProgress, setOpponentProgress] = useState<OpponentProgressPayload | null>(null);
  const [finishedPayload, setFinishedPayload] = useState<BattleFinishedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<TypedClientSocket | null>(null);
  const onBattleStartRef = useRef(onBattleStart);
  const onBattleFinishedRef = useRef(onBattleFinished);

  useEffect(() => {
    onBattleStartRef.current = onBattleStart;
    onBattleFinishedRef.current = onBattleFinished;
  }, [onBattleStart, onBattleFinished]);

  useEffect(() => {
    if (!sessionToken || !battleId) {
      return;
    }

    setIsConnecting(true);
    setError(null);

    const socket: TypedClientSocket = io(API_URL, {
      auth: { token: sessionToken },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setIsConnecting(false);
      setIsReconnecting(false);

      socket.emit('joinBattleRoom', { battleId }, (response: JoinBattleRoomResponse) => {
        if (!response.success && response.error) {
          setError(response.error);
        }
      });
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.io.on('reconnect_attempt', () => {
      setIsReconnecting(true);
    });

    socket.io.on('reconnect', () => {
      setIsReconnecting(false);
      socket.emit('joinBattleRoom', { battleId });
    });

    socket.on('opponentJoined', (payload: OpponentJoinedPayload) => {
      setOpponentJoined(payload);
    });

    socket.on('bothPlayersPresent', () => {
      setBothPlayersPresent(true);
    });

    socket.on('battleCountdown', (payload: BattleCountdownPayload) => {
      setCountdown(payload.countdownSeconds);
    });

    socket.on('battleStart', (payload: BattleStartPayload) => {
      setStartPayload(payload);
      setCountdown(null);
      if (onBattleStartRef.current) {
        onBattleStartRef.current(payload);
      }
    });

    socket.on('opponentProgress', (payload: OpponentProgressPayload) => {
      setOpponentProgress(payload);
    });

    socket.on('battleFinished', (payload: BattleFinishedPayload) => {
      setFinishedPayload(payload);
      if (onBattleFinishedRef.current) {
        onBattleFinishedRef.current(payload);
      }
    });

    socket.on('battleError', (payload: BattleErrorPayload) => {
      setError(payload.message || 'Battle error occurred');
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      setIsConnecting(false);
      setIsReconnecting(false);
    };
  }, [sessionToken, battleId]);

  const sendReady = useCallback(async (): Promise<boolean> => {
    if (!socketRef.current || !battleId) {
      return false;
    }
    return new Promise((resolve) => {
      socketRef.current?.emit('playerReady', { battleId }, (response: PlayerReadyResponse) => {
        if (response.success) {
          setIsReady(true);
          resolve(true);
        } else {
          setError(response.error || 'Failed to ready up');
          resolve(false);
        }
      });
    });
  }, [battleId]);

  const submitAnswer = useCallback(
    async (flagIndex: number, selectedIsoCode: string): Promise<SubmitAnswerResponse> => {
      if (!socketRef.current || !battleId) {
        return { success: false, error: 'Socket not connected' };
      }
      return new Promise((resolve) => {
        socketRef.current?.emit(
          'submitAnswer',
          { battleId, flagIndex, selectedIsoCode },
          (response: SubmitAnswerResponse) => {
            resolve(response);
          },
        );
      });
    },
    [battleId],
  );

  return {
    isConnected,
    isConnecting,
    isReconnecting,
    bothPlayersPresent,
    opponentJoined,
    isReady,
    countdown,
    startPayload,
    opponentProgress,
    finishedPayload,
    error,
    sendReady,
    submitAnswer,
  };
}
