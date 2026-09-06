import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDailyStatus, startDailyRun } from '../api/client.js';

export function useDailyChallenge(sessionToken: string | null) {
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ['daily', 'status', sessionToken],
    queryFn: () => getDailyStatus(sessionToken!),
    enabled: Boolean(sessionToken),
    staleTime: 10_000,
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!sessionToken) {
        throw new Error('Session token required');
      }
      return startDailyRun(sessionToken);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['daily', 'status'] });
    },
  });

  return {
    dailyStatus: statusQuery.data ?? null,
    isLoadingStatus: statusQuery.isLoading,
    statusError: statusQuery.error instanceof Error ? statusQuery.error.message : null,
    startDaily: startMutation.mutateAsync,
    isStartingDaily: startMutation.isPending,
    refetchStatus: () => {
      void statusQuery.refetch();
    },
  };
}
