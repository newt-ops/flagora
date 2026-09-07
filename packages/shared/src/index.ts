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
  bestScore: number;
  lastPlayedDate: string | null;
  referredBy?: number | null;
  referralCount?: number;
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
export * from './progression.js';
export * from './streak.js';
export * from './leaderboard.js';
export * from './profile.js';
export * from './daily.js';
export * from './challenge.js';
export * from './battle.js';
export * from './rewards.js';
