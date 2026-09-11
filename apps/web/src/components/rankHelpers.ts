import { Shield, Medal, Crown, Gem, Sparkles, Flame, type LucideIcon } from 'lucide-react';
import { type RankedTier, RANKED_TIERS, getRankedTier } from '@flagora/shared';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function formatSeasonName(seasonStr?: string | null): string {
  if (seasonStr) {
    const match = /^(\d{4})-(\d{2})$/.exec(seasonStr.trim());
    if (match) {
      const year = match[1];
      const monthIndex = parseInt(match[2], 10) - 1;
      if (monthIndex >= 0 && monthIndex < 12) {
        return `${MONTH_NAMES[monthIndex]} ${year}`;
      }
    }
  }

  const now = new Date();
  return `${MONTH_NAMES[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
}

export interface TierStyleConfig {
  text: string;
  bg: string;
  border: string;
  badge: string;
}

export function getTierBadgeColors(tier: RankedTier): TierStyleConfig {
  switch (tier) {
    case 'Legend':
      return {
        text: 'text-purple-300',
        bg: 'bg-purple-950/30',
        border: 'border-purple-500/60',
        badge: 'bg-purple-500/25 text-purple-300 border-purple-500/50 shadow-[0_0_8px_rgba(168,85,247,0.25)]',
      };
    case 'Diamond':
      return {
        text: 'text-sky-300',
        bg: 'bg-sky-950/25',
        border: 'border-sky-400/50',
        badge: 'bg-sky-500/20 text-sky-300 border-sky-400/40',
      };
    case 'Platinum':
      return {
        text: 'text-teal-300',
        bg: 'bg-teal-950/25',
        border: 'border-teal-400/50',
        badge: 'bg-teal-500/20 text-teal-300 border-teal-400/40',
      };
    case 'Gold':
      return {
        text: 'text-amber-400',
        bg: 'bg-amber-900/25',
        border: 'border-amber-400/50',
        badge: 'bg-amber-400/20 text-amber-400 border-amber-400/40',
      };
    case 'Silver':
      return {
        text: 'text-slate-300',
        bg: 'bg-slate-800/20',
        border: 'border-slate-400/40',
        badge: 'bg-slate-500/20 text-slate-300 border-slate-400/30',
      };
    case 'Bronze':
    default:
      return {
        text: 'text-amber-500',
        bg: 'bg-amber-950/20',
        border: 'border-amber-700/40',
        badge: 'bg-amber-900/20 text-amber-500 border-amber-700/30',
      };
  }
}

export function getTierIcon(tier: RankedTier): LucideIcon {
  switch (tier) {
    case 'Legend':
      return Flame;
    case 'Diamond':
      return Sparkles;
    case 'Platinum':
      return Gem;
    case 'Gold':
      return Crown;
    case 'Silver':
      return Medal;
    case 'Bronze':
    default:
      return Shield;
  }
}

export interface RatingDeltaDisplay {
  text: string;
  colorClass: string;
  isPositive: boolean;
  isNegative: boolean;
}

export function getRatingDeltaDisplay(delta?: number | null): RatingDeltaDisplay {
  if (delta === undefined || delta === null) {
    return {
      text: '0',
      colorClass: 'text-tg-hint',
      isPositive: false,
      isNegative: false,
    };
  }

  if (delta > 0) {
    return {
      text: `+${delta}`,
      colorClass: 'text-emerald-400',
      isPositive: true,
      isNegative: false,
    };
  }

  if (delta < 0) {
    return {
      text: `${delta}`,
      colorClass: 'text-rose-400',
      isPositive: false,
      isNegative: true,
    };
  }

  return {
    text: '0',
    colorClass: 'text-tg-hint',
    isPositive: false,
    isNegative: false,
  };
}

export interface TierPromotionResult {
  isPromoted: boolean;
  newTier?: RankedTier;
  previousTier?: RankedTier;
}

export function checkTierPromotion(
  newRating?: number | null,
  ratingDelta?: number | null,
): TierPromotionResult {
  if (
    newRating === undefined ||
    newRating === null ||
    ratingDelta === undefined ||
    ratingDelta === null ||
    ratingDelta <= 0
  ) {
    return { isPromoted: false };
  }

  const previousRating = newRating - ratingDelta;
  const previousTier = getRankedTier(previousRating);
  const newTier = getRankedTier(newRating);

  const isPromoted = RANKED_TIERS.indexOf(newTier) > RANKED_TIERS.indexOf(previousTier);

  return {
    isPromoted,
    newTier: isPromoted ? newTier : undefined,
    previousTier: isPromoted ? previousTier : undefined,
  };
}
