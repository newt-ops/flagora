import { useQuery } from '@tanstack/react-query';
import { getStreakStatus } from '../api/client.js';
import type { StreakStatusResponse } from '@flagora/shared';

export function useStreakStatus(sessionToken: string | null) {
  const streakQuery = useQuery<StreakStatusResponse>({
    queryKey: ['streak-status', sessionToken],
    queryFn: () => {
      if (!sessionToken) {
        throw new Error('Session token required');
      }
      return getStreakStatus(sessionToken);
    },
    enabled: Boolean(sessionToken),
    staleTime: 30_000,
  });

  return {
    streakStatus: streakQuery.data ?? null,
    isLoading: streakQuery.isLoading,
    error: streakQuery.error instanceof Error ? streakQuery.error.message : null,
    refetchStreakStatus: () => {
      void streakQuery.refetch();
    },
  };
}
