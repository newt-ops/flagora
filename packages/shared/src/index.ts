export interface PlayerProfile {
  telegramUserId: number;
  username?: string | null;
  firstName: string;
  lastName?: string | null;
  photoUrl?: string | null;
  coins: number;
  xp: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  gamesPlayed: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface SessionResponse {
  sessionToken: string;
  profile: PlayerProfile;
}

export interface ProfileResponse {
  profile: PlayerProfile;
}

export * from './flags.js';
export * from './scoring.js';

