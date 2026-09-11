import { useQuery } from '@tanstack/react-query';
import {
  getLeaderboardTop,
  getLeaderboardMe,
  getDailyLeaderboard,
  fetchRankedLeaderboard,
} from '../api/client.js';

export function useLeaderboard(
  sessionToken: string | null,
  mode: 'global' | 'daily' | 'ranked' = 'global',
) {
  const isGlobal = mode === 'global';
  const isDaily = mode === 'daily';
  const isRanked = mode === 'ranked';

  const topQuery = useQuery({
    queryKey: ['leaderboard', 'top', sessionToken],
    queryFn: () => getLeaderboardTop(sessionToken!),
    enabled: Boolean(sessionToken) && isGlobal,
    staleTime: 10_000,
  });

  const meQuery = useQuery({
    queryKey: ['leaderboard', 'me', sessionToken],
    queryFn: () => getLeaderboardMe(sessionToken!),
    enabled: Boolean(sessionToken) && isGlobal,
    staleTime: 10_000,
  });

  const dailyQuery = useQuery({
    queryKey: ['leaderboard', 'daily', sessionToken],
    queryFn: () => getDailyLeaderboard(sessionToken!),
    enabled: Boolean(sessionToken) && isDaily,
    staleTime: 10_000,
  });

  const rankedQuery = useQuery({
    queryKey: ['leaderboard', 'ranked', sessionToken],
    queryFn: () => fetchRankedLeaderboard(sessionToken!),
    enabled: Boolean(sessionToken) && isRanked,
    staleTime: 10_000,
  });

  if (isGlobal) {
    const isLoading = topQuery.isLoading || meQuery.isLoading;
    const error =
      (topQuery.error instanceof Error ? topQuery.error.message : null) ||
      (meQuery.error instanceof Error ? meQuery.error.message : null);

    return {
      topEntries: topQuery.data ?? [],
      myRank: meQuery.data ?? null,
      season: null,
      isLoading,
      error,
      refetch: () => {
        void topQuery.refetch();
        void meQuery.refetch();
      },
    };
  }

  if (isDaily) {
    const isLoading = dailyQuery.isLoading;
    const error = dailyQuery.error instanceof Error ? dailyQuery.error.message : null;

    return {
      topEntries: dailyQuery.data?.top ?? [],
      myRank: dailyQuery.data?.me ?? null,
      season: null,
      isLoading,
      error,
      refetch: () => {
        void dailyQuery.refetch();
      },
    };
  }

  const isLoading = rankedQuery.isLoading;
  const error = rankedQuery.error instanceof Error ? rankedQuery.error.message : null;

  return {
    topEntries: rankedQuery.data?.top ?? [],
    myRank: rankedQuery.data?.me ?? null,
    season: rankedQuery.data?.season ?? null,
    isLoading,
    error,
    refetch: () => {
      void rankedQuery.refetch();
    },
  };
}
