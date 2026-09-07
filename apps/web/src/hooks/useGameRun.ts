import { useMutation } from '@tanstack/react-query';
import { startRun, answerRun, finishRun, type StartRunOptions } from '../api/client.js';

export function useGameRun() {
  const startMutation = useMutation({
    mutationFn: async (args: string | { sessionToken: string; options?: StartRunOptions }) => {
      if (typeof args === 'string') {
        return startRun(args);
      }
      return startRun(args.sessionToken, args.options);
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

  const triggerStartRun = async (
    sessionToken: string,
    options?: StartRunOptions,
  ) => {
    return startMutation.mutateAsync({ sessionToken, options });
  };

  return {
    startRun: triggerStartRun,
    isStarting: startMutation.isPending,
    answerRun: answerMutation.mutateAsync,
    isAnswering: answerMutation.isPending,
    finishRun: finishMutation.mutateAsync,
    isFinishing: finishMutation.isPending,
  };
}
