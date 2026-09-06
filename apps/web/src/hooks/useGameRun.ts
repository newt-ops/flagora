import { useMutation } from '@tanstack/react-query';
import { startRun, answerRun, finishRun } from '../api/client.js';

export function useGameRun() {
  const startMutation = useMutation({
    mutationFn: async (sessionToken: string) => {
      return startRun(sessionToken);
    },
  });

  const answerMutation = useMutation({
    mutationFn: async (params: {
      sessionToken: string;
      runId: string;
      flagIndex: number;
      selectedIsoCode: string;
    }) => {
      return answerRun(
        params.sessionToken,
        params.runId,
        params.flagIndex,
        params.selectedIsoCode,
      );
    },
  });

  const finishMutation = useMutation({
    mutationFn: async (params: { sessionToken: string; runId: string }) => {
      return finishRun(params.sessionToken, params.runId);
    },
  });

  return {
    startRun: startMutation.mutateAsync,
    isStarting: startMutation.isPending,
    answerRun: answerMutation.mutateAsync,
    isAnswering: answerMutation.isPending,
    finishRun: finishMutation.mutateAsync,
    isFinishing: finishMutation.isPending,
  };
}
