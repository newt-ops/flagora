import { create } from 'zustand';
import type { PlayerProfile } from '@flagora/shared';

interface AppState {
  sessionToken: string | null;
  profile: PlayerProfile | null;
  setSession: (sessionToken: string, profile: PlayerProfile) => void;
  setProfile: (profile: PlayerProfile) => void;
  clearSession: () => void;
}

export const useStore = create<AppState>((set) => ({
  sessionToken: null,
  profile: null,
  setSession: (sessionToken, profile) => set({ sessionToken, profile }),
  setProfile: (profile) => set({ profile }),
  clearSession: () => set({ sessionToken: null, profile: null }),
}));
