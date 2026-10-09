export interface PlayerProfile {
  telegramUserId: number;
  username?: string | null;
  firstName: string;
  lastName?: string | null;
  photoUrl?: string | null;
  pins: number;
  xp: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  gamesPlayed: number;
  bestScore: number;
  lastPlayedDate: string | null;
  referredBy?: number | null;
  referralCount?: number;
  battleRating?: number;
  currentSeason?: string | null;
  tier4CorrectCount?: number;
  pinnedIsoCodes?: string[];
  isVerified?: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface RunHistoryItem {
  runId: string;
  mode: string;
  score: number;
  totalScore: number;
  date: string;
  correctCount: number;
  timeUsedMs: number;
  xpEarned: number;
  pinsEarned: number;
}

export interface RunHistoryResponse {
  runs: RunHistoryItem[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface SessionResponse {
  sessionToken: string;
  profile: PlayerProfile;
}

export interface ProfileResponse {
  profile: PlayerProfile;
}

export interface ProStatusResponse {
  isActive: boolean;
  currentPeriodEnd: string | Date | null;
  perks?: string[];
}

export interface CreateInvoiceLinkResponse {
  invoiceLink: string;
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
export * from './rank.js';
export * from './referral.js';

