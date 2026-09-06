import { useQuery } from '@tanstack/react-query';
import { getLeaderboardTop, getLeaderboardMe } from '../api/client.js';

export function useLeaderboard(sessionToken: string | null) {
  const topQuery = useQuery({
    queryKey: ['leaderboard', 'top', sessionToken],
    queryFn: () => getLeaderboardTop(sessionToken!),
    enabled: Boolean(sessionToken),
    staleTime: 10_000,
  });

  const meQuery = useQuery({
    queryKey: ['leaderboard', 'me', sessionToken],
    queryFn: () => getLeaderboardMe(sessionToken!),
    enabled: Boolean(sessionToken),
    staleTime: 10_000,
  });

  const isLoading = topQuery.isLoading || meQuery.isLoading;
  const error =
    (topQuery.error instanceof Error ? topQuery.error.message : null) ||
    (meQuery.error instanceof Error ? meQuery.error.message : null);

  return {
    topEntries: topQuery.data ?? [],
    myRank: meQuery.data ?? null,
    isLoading,
    error,
    refetch: () => {
      void topQuery.refetch();
      void meQuery.refetch();
    },
  };
}
