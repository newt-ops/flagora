import { useQuery } from '@tanstack/react-query';
import { getBadgesMe } from '../api/client.js';

export function useBadges(sessionToken: string | null) {
  const query = useQuery({
    queryKey: ['badges', 'me', sessionToken],
    queryFn: () => getBadgesMe(sessionToken!),
    enabled: Boolean(sessionToken),
    staleTime: 10_000,
  });

  const error = query.error instanceof Error ? query.error.message : null;

  return {
    badges: query.data?.badges ?? [],
    isLoadingBadges: query.isLoading,
    error,
    refetchBadges: () => {
      void query.refetch();
    },
  };
}
