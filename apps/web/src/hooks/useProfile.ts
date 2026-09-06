import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useCallback } from 'react';
import { initTelegramApp } from '../telegram/init.js';
import { exchangeSession, fetchProfile } from '../api/client.js';
import { useStore } from '../store/useStore.js';
import type { PlayerProfile } from '@flagora/shared';

export function useProfile() {
  const { sessionToken, profile: cachedProfile, setSession, setProfile } = useStore();
  const [initError, setInitError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const authenticate = useCallback(async () => {
    setIsInitializing(true);
    setInitError(null);
    try {
      const { initData } = await initTelegramApp();
      const session = await exchangeSession(initData);
      setSession(session.sessionToken, session.profile);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed';
      setInitError(message);
    } finally {
      setIsInitializing(false);
    }
  }, [setSession]);

  useEffect(() => {
    if (!sessionToken) {
      authenticate();
    } else {
      setIsInitializing(false);
    }
  }, [sessionToken, authenticate]);

  const profileQuery = useQuery({
    queryKey: ['profile', sessionToken],
    queryFn: async () => {
      const freshProfile = await fetchProfile(sessionToken!);
      setProfile(freshProfile);
      return freshProfile;
    },
    enabled: Boolean(sessionToken),
    retry: 1,
  });

  const profile: PlayerProfile | null = profileQuery.data ?? cachedProfile;
  const isLoading = isInitializing || (Boolean(sessionToken) && profileQuery.isLoading && !profile);
  const error =
    initError || (profileQuery.error instanceof Error ? profileQuery.error.message : null);

  return {
    profile,
    isLoading,
    error,
    refetch: () => {
      if (!sessionToken) {
        authenticate();
      } else {
        profileQuery.refetch();
      }
    },
  };
}
