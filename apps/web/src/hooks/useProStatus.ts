import { useQuery } from '@tanstack/react-query';
import { fetchProStatus } from '../api/client.js';
import type { ProStatusResponse } from '@flagora/shared';

export function useProStatus(sessionToken: string | null) {
  const proQuery = useQuery<ProStatusResponse>({
    queryKey: ['pro-status', sessionToken],
    queryFn: () => {
      if (!sessionToken) {
        throw new Error('Session token required');
      }
      return fetchProStatus(sessionToken);
    },
    enabled: Boolean(sessionToken),
    staleTime: 30_000,
  });

  return {
    proStatus: proQuery.data ?? null,
    isPro: Boolean(proQuery.data?.isActive),
    isLoading: proQuery.isLoading,
    error: proQuery.error instanceof Error ? proQuery.error.message : null,
    refetchProStatus: () => {
      void proQuery.refetch();
    },
  };
}
