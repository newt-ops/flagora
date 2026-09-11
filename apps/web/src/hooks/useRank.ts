import { useQuery } from '@tanstack/react-query';
import { fetchRankStatus } from '../api/client.js';

export function useRank(sessionToken: string | null) {
  const query = useQuery({
    queryKey: ['rank', 'status', sessionToken],
    queryFn: () => fetchRankStatus(sessionToken!),
    enabled: Boolean(sessionToken),
    staleTime: 10_000,
  });

  const error = query.error instanceof Error ? query.error.message : null;

  return {
    rankStatus: query.data ?? null,
    isLoadingRank: query.isLoading,
    error,
    refetchRank: () => {
      void query.refetch();
    },
  };
}
