import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getBadgeIcon,
  formatBadgeEarnedDate,
  getBadgeAccentColors,
  getMergedBadgeItems,
} from './badgeHelpers.js';
import {
  type PlayerBadgeResponseItem,
  type Badge,
  BADGE_CATALOG,
} from '@flagora/shared';
import { Award, Zap, Sparkles, Flame, Calendar, Trophy } from 'lucide-react';

describe('badgeHelpers', () => {
  describe('getBadgeIcon', () => {
    it('returns the assigned icon for each known badge ID', () => {
      assert.equal(getBadgeIcon('flawless_run'), Award);
      assert.equal(getBadgeIcon('speed_demon'), Zap);
      assert.equal(getBadgeIcon('tier_4_specialist'), Sparkles);
      assert.equal(getBadgeIcon('week_warrior'), Flame);
      assert.equal(getBadgeIcon('month_warrior'), Calendar);
      assert.equal(getBadgeIcon('season_top_100'), Trophy);
    });

    it('falls back to Award for unknown badge ID', () => {
      assert.equal(getBadgeIcon('unknown_badge' as unknown as import('@flagora/shared').BadgeId), Award);
    });
  });

  describe('formatBadgeEarnedDate', () => {
    it('formats ISO date strings properly in UTC', () => {
      const formatted = formatBadgeEarnedDate('2026-09-16T12:00:00.000Z');
      assert.equal(formatted, 'Sep 16, 2026');
    });

    it('formats Date instances properly in UTC', () => {
      const date = new Date('2026-01-05T00:00:00.000Z');
      const formatted = formatBadgeEarnedDate(date);
      assert.equal(formatted, 'Jan 5, 2026');
    });

    it('returns empty string on invalid dates', () => {
      assert.equal(formatBadgeEarnedDate('invalid-date'), '');
      assert.equal(formatBadgeEarnedDate(new Date('invalid')), '');
    });
  });

  describe('getBadgeAccentColors', () => {
    it('returns muted locked styles when isEarned is false', () => {
      const locked = getBadgeAccentColors('flawless_run', false);
      assert.ok(locked.card.includes('opacity-70'));
      assert.ok(locked.title.includes('tg-hint'));
      assert.ok(locked.iconContainer.includes('tg-separator'));
    });

    it('returns distinctive styles for each badge when earned', () => {
      const flawless = getBadgeAccentColors('flawless_run', true);
      assert.ok(flawless.iconContainer.includes('emerald'));

      const speed = getBadgeAccentColors('speed_demon', true);
      assert.ok(speed.iconContainer.includes('amber'));

      const specialist = getBadgeAccentColors('tier_4_specialist', true);
      assert.ok(specialist.iconContainer.includes('purple'));

      const week = getBadgeAccentColors('week_warrior', true);
      assert.ok(week.iconContainer.includes('rose'));

      const month = getBadgeAccentColors('month_warrior', true);
      assert.ok(month.iconContainer.includes('cyan'));

      const season = getBadgeAccentColors('season_top_100', true);
      assert.ok(season.iconContainer.includes('yellow'));
    });
  });

  describe('getMergedBadgeItems', () => {
    it('returns all catalog badges as locked when earnedBadges is empty', () => {
      const items = getMergedBadgeItems(BADGE_CATALOG, []);
      assert.equal(items.length, 6);
      for (const item of items) {
        assert.equal(item.isEarned, false);
        assert.ok(item.name.length > 0);
        assert.ok(item.description.length > 0);
      }
    });

    it('correctly reflects earned non-seasonal badges', () => {
      const earned: PlayerBadgeResponseItem[] = [
        {
          badgeId: 'flawless_run',
          name: 'Flawless Run',
          description: 'Score 10/10 correct in any practice, daily, challenge, or battle run.',
          earnedAt: '2026-09-10T10:00:00.000Z',
          season: null,
        },
        {
          badgeId: 'week_warrior',
          name: 'Week Warrior',
          description: 'Reach a streak of 7 days.',
          earnedAt: '2026-09-12T10:00:00.000Z',
          season: null,
        },
      ];

      const items = getMergedBadgeItems(BADGE_CATALOG, earned);
      assert.equal(items.length, 6);

      const flawless = items.find((i) => i.id === 'flawless_run');
      assert.ok(flawless);
      assert.equal(flawless.isEarned, true);
      assert.equal(flawless.earnedAt, 'Sep 10, 2026');

      const week = items.find((i) => i.id === 'week_warrior');
      assert.ok(week);
      assert.equal(week.isEarned, true);
      assert.equal(week.earnedAt, 'Sep 12, 2026');

      const speed = items.find((i) => i.id === 'speed_demon');
      assert.ok(speed);
      assert.equal(speed.isEarned, false);
    });

    it('returns multiple entries for season-scoped badges earned across different seasons', () => {
      const earned: PlayerBadgeResponseItem[] = [
        {
          badgeId: 'season_top_100',
          name: 'Season Top 100',
          description: 'Finish a ranked season in the Top 100 players.',
          earnedAt: '2026-08-31T23:59:59.000Z',
          season: '2026-08',
        },
        {
          badgeId: 'season_top_100',
          name: 'Season Top 100',
          description: 'Finish a ranked season in the Top 100 players.',
          earnedAt: '2026-09-30T23:59:59.000Z',
          season: '2026-09',
        },
      ];

      const items = getMergedBadgeItems(BADGE_CATALOG, earned);
      assert.equal(items.length, 7);

      const seasonItems = items.filter((i) => i.id === 'season_top_100');
      assert.equal(seasonItems.length, 2);
      assert.equal(seasonItems[0].isEarned, true);
      assert.equal(seasonItems[0].season, '2026-08');
      assert.equal(seasonItems[0].formattedSeason, 'August 2026');
      assert.equal(seasonItems[1].isEarned, true);
      assert.equal(seasonItems[1].season, '2026-09');
      assert.equal(seasonItems[1].formattedSeason, 'September 2026');
    });

    it('handles custom catalog gracefully', () => {
      const customCatalog: Badge[] = [
        {
          id: 'speed_demon',
          name: 'Speed Demon',
          description: 'Test description',
        },
      ];
      const items = getMergedBadgeItems(customCatalog, []);
      assert.equal(items.length, 1);
      assert.equal(items[0].id, 'speed_demon');
      assert.equal(items[0].isEarned, false);
    });
  });
});
