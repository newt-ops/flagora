import type { LeaderboardEntry, LeaderboardMeResponse } from './leaderboard.js';

export type RankedTier =
  | 'Bronze'
  | 'Silver'
  | 'Gold'
  | 'Platinum'
  | 'Diamond'
  | 'Legend';

export const RANKED_TIERS: readonly RankedTier[] = [
  'Bronze',
  'Silver',
  'Gold',
  'Platinum',
  'Diamond',
  'Legend',
] as const;

export const TIER_THRESHOLDS = {
  BRONZE_MAX: 299,
  SILVER_MIN: 300,
  SILVER_MAX: 599,
  GOLD_MIN: 600,
  GOLD_MAX: 999,
  PLATINUM_MIN: 1000,
  PLATINUM_MAX: 1499,
  DIAMOND_MIN: 1500,
  DIAMOND_MAX: 1999,
  LEGEND_MIN: 2000,
} as const;

export const RATING_DELTAS = {
  WIN: 20,
  LOSS: -15,
  TIE: 2,
} as const;

export function getRankedTier(rating: number): RankedTier {
  if (rating >= TIER_THRESHOLDS.LEGEND_MIN) {
    return 'Legend';
  }
  if (rating >= TIER_THRESHOLDS.DIAMOND_MIN) {
    return 'Diamond';
  }
  if (rating >= TIER_THRESHOLDS.PLATINUM_MIN) {
    return 'Platinum';
  }
  if (rating >= TIER_THRESHOLDS.GOLD_MIN) {
    return 'Gold';
  }
  if (rating >= TIER_THRESHOLDS.SILVER_MIN) {
    return 'Silver';
  }
  return 'Bronze';
}

export function getUtcSeasonString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

export function getRankedLeaderboardKey(season: string): string {
  return `leaderboard:ranked:${season}`;
}

export interface SeasonResult {
  telegramUserId: number;
  season: string;
  finalRating: number;
  finalTier: RankedTier;
  finalRank: number | null;
  archivedAt: Date | string;
}

export interface RankStatusResponse {
  season: string;
  battleRating: number;
  tier: RankedTier;
  rank: number | null;
}

export interface RankedLeaderboardResponse {
  season: string;
  top: LeaderboardEntry[];
  me: LeaderboardMeResponse;
}
