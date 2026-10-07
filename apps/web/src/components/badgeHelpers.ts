import type { ComponentType } from 'react';
import { Award, Zap, Sparkles, Flame, Calendar, Trophy } from 'lucide-react';
import {
  type BadgeId,
  type Badge,
  type PlayerBadgeResponseItem,
  BADGE_CATALOG,
} from '@flagora/shared';
import { formatSeasonName } from './rankHelpers.js';

export interface BadgeDisplayItem {
  id: BadgeId;
  name: string;
  description: string;
  isEarned: boolean;
  isSeasonal?: boolean;
  earnedAt?: string;
  season?: string | null;
  formattedSeason?: string | null;
}

export function getBadgeIcon(badgeId: BadgeId): ComponentType<{ className?: string }> {
  switch (badgeId) {
    case 'flawless_run':
      return Award;
    case 'speed_demon':
      return Zap;
    case 'tier_4_specialist':
      return Sparkles;
    case 'week_warrior':
      return Flame;
    case 'month_warrior':
      return Calendar;
    case 'season_top_100':
      return Trophy;
    default:
      return Award;
  }
}

export function formatBadgeEarnedDate(earnedAt: Date | string): string {
  try {
    const d = typeof earnedAt === 'string' ? new Date(earnedAt) : earnedAt;
    if (isNaN(d.getTime())) {
      return '';
    }
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return '';
  }
}

export function getBadgeAccentColors(_badgeId: BadgeId, isEarned: boolean) {
  if (!isEarned) {
    return {
      card: 'bg-tg-secondary-bg/40 border-tg-separator/40 opacity-70',
      iconContainer: 'bg-tg-separator/30 text-tg-hint/60 ring-1 ring-tg-separator/30',
      title: 'text-tg-hint/90',
      description: 'text-tg-hint/60',
      badgeTag: 'bg-tg-separator/20 text-tg-hint/50 border-tg-separator/30',
    };
  }

  return {
    card: 'bg-tg-button/5 border-tg-button/25 ring-1 ring-tg-button/15',
    iconContainer: 'bg-tg-button/15 text-tg-button ring-1 ring-tg-button/30',
    title: 'text-tg-text',
    description: 'text-tg-hint',
    badgeTag: 'bg-tg-button/15 text-tg-button border-tg-button/30',
  };
}

export function getMergedBadgeItems(
  catalog: readonly Badge[] = BADGE_CATALOG,
  earnedBadges: PlayerBadgeResponseItem[] = [],
): BadgeDisplayItem[] {
  const earnedByBadgeId = new Map<BadgeId, PlayerBadgeResponseItem[]>();

  for (const earned of earnedBadges) {
    const list = earnedByBadgeId.get(earned.badgeId) ?? [];
    list.push(earned);
    earnedByBadgeId.set(earned.badgeId, list);
  }

  const items: BadgeDisplayItem[] = [];

  for (const badge of catalog) {
    const earnedList = earnedByBadgeId.get(badge.id);

    if (badge.isSeasonal) {
      if (earnedList && earnedList.length > 0) {
        for (const item of earnedList) {
          items.push({
            id: badge.id,
            name: badge.name,
            description: badge.description,
            isEarned: true,
            isSeasonal: true,
            earnedAt: formatBadgeEarnedDate(item.earnedAt),
            season: item.season,
            formattedSeason: item.season ? formatSeasonName(item.season) : null,
          });
        }
      } else {
        items.push({
          id: badge.id,
          name: badge.name,
          description: badge.description,
          isEarned: false,
          isSeasonal: true,
        });
      }
    } else {
      if (earnedList && earnedList.length > 0) {
        const first = earnedList[0];
        items.push({
          id: badge.id,
          name: badge.name,
          description: badge.description,
          isEarned: true,
          isSeasonal: false,
          earnedAt: formatBadgeEarnedDate(first.earnedAt),
        });
      } else {
        items.push({
          id: badge.id,
          name: badge.name,
          description: badge.description,
          isEarned: false,
          isSeasonal: false,
        });
      }
    }
  }

  return items;
}
