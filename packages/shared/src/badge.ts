export type BadgeId =
  | 'flawless_run'
  | 'speed_demon'
  | 'tier_4_specialist'
  | 'week_warrior'
  | 'month_warrior'
  | 'season_top_100';

export interface Badge {
  id: BadgeId;
  name: string;
  description: string;
  isSeasonal?: boolean;
}

export const BADGE_CATALOG: readonly Badge[] = [
  {
    id: 'flawless_run',
    name: 'Flawless Run',
    description: 'Score 10/10 correct in any practice, daily, challenge, or battle run.',
  },
  {
    id: 'speed_demon',
    name: 'Speed Demon',
    description: 'Finish a 10/10 run with at least 20 seconds of unused time remaining.',
  },
  {
    id: 'tier_4_specialist',
    name: 'Tier 4 Specialist',
    description: 'Answer 50 Tier 4 flags correctly across career games.',
  },
  {
    id: 'week_warrior',
    name: 'Week Warrior',
    description: 'Reach a streak of 7 days.',
  },
  {
    id: 'month_warrior',
    name: 'Month Warrior',
    description: 'Reach a streak of 30 days.',
  },
  {
    id: 'season_top_100',
    name: 'Season Top 100',
    description: 'Finish a ranked season in the Top 100 players.',
    isSeasonal: true,
  },
] as const;

export function getBadgeDefinition(id: BadgeId): Badge | undefined {
  return BADGE_CATALOG.find((b) => b.id === id);
}

export interface PlayerBadge {
  telegramUserId: number;
  badgeId: BadgeId;
  earnedAt: Date | string;
  season?: string | null;
}

export interface PlayerBadgeResponseItem {
  badgeId: BadgeId;
  name: string;
  description: string;
  earnedAt: Date | string;
  season?: string | null;
}

export interface BadgesMeResponse {
  badges: PlayerBadgeResponseItem[];
}
