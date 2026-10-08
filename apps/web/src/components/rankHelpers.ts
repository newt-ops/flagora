import { Shield, Medal, Crown, Gem, Sparkles, Flame, type HugeIcon } from './icons.js';
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
        text: 'text-tg-button-text',
        bg: 'bg-tg-button',
        border: 'border-tg-button',
        badge: 'bg-tg-button text-tg-button-text border-tg-button font-bold',
      };
    case 'Diamond':
      return {
        text: 'text-tg-button',
        bg: 'bg-tg-button/20',
        border: 'border-tg-button/40',
        badge: 'bg-tg-button/20 text-tg-button border-tg-button/40 font-bold',
      };
    case 'Platinum':
      return {
        text: 'text-tg-button',
        bg: 'bg-tg-button/15',
        border: 'border-tg-button/30',
        badge: 'bg-tg-button/15 text-tg-button border-tg-button/30 font-semibold',
      };
    case 'Gold':
      return {
        text: 'text-tg-button',
        bg: 'bg-tg-button/10',
        border: 'border-tg-button/20',
        badge: 'bg-tg-button/10 text-tg-button border-tg-button/20 font-semibold',
      };
    case 'Silver':
      return {
        text: 'text-tg-text',
        bg: 'bg-tg-secondary-bg',
        border: 'border-tg-separator/40',
        badge: 'bg-tg-secondary-bg text-tg-text border-tg-separator/40 font-medium',
      };
    case 'Bronze':
    default:
      return {
        text: 'text-tg-hint',
        bg: 'bg-tg-secondary-bg',
        border: 'border-tg-separator/30',
        badge: 'bg-tg-secondary-bg text-tg-hint border-tg-separator/30 font-normal',
      };
  }
}

export function getTierIcon(tier: RankedTier): HugeIcon {
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
      colorClass: 'text-tg-button',
      isPositive: true,
      isNegative: false,
    };
  }

  if (delta < 0) {
    return {
      text: `${delta}`,
      colorClass: 'text-tg-destructive',
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
