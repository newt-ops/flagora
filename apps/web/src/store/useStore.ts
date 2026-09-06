import { create } from 'zustand';

type AppState = Record<string, never>;

export const useStore = create<AppState>(() => ({}));
