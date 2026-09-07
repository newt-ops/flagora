import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LeaderboardEntry, LeaderboardMeResponse } from '@flagora/shared';
import {
  shouldShowPinnedMyRank,
  isUnrankedPlayer,
  getRankBadgeClass,
} from './leaderboardHelpers.js';

describe('leaderboard helpers', () => {
  const sampleTopEntries: LeaderboardEntry[] = [
    {
      telegramUserId: 101,
      displayName: '@alice',
      photoUrl: null,
      bestScore: 1200,
      rank: 1,
    },
    {
      telegramUserId: 102,
      displayName: '@bob',
      photoUrl: null,
      bestScore: 950,
      rank: 2,
    },
    {
      telegramUserId: 103,
      displayName: 'Charlie D.',
      photoUrl: null,
      bestScore: 800,
      rank: 3,
    },
  ];

  describe('shouldShowPinnedMyRank', () => {
    it('returns false when user is in top entries (deduplication)', () => {
      const myRank: LeaderboardMeResponse = {
        ranked: true,
        rank: 2,
        bestScore: 950,
      };
      const show = shouldShowPinnedMyRank(myRank, sampleTopEntries, 102);
      assert.equal(show, false);
    });

    it('returns true when user is ranked outside top entries', () => {
      const myRank: LeaderboardMeResponse = {
        ranked: true,
        rank: 75,
        bestScore: 400,
      };
      const show = shouldShowPinnedMyRank(myRank, sampleTopEntries, 999);
      assert.equal(show, true);
    });

    it('returns false when user is unranked', () => {
      const myRank: LeaderboardMeResponse = {
        ranked: false,
        rank: null,
        bestScore: 0,
      };
      const show = shouldShowPinnedMyRank(myRank, sampleTopEntries, 999);
      assert.equal(show, false);
    });

    it('returns false when myRank is null', () => {
      const show = shouldShowPinnedMyRank(null, sampleTopEntries, 999);
      assert.equal(show, false);
    });
  });

  describe('isUnrankedPlayer', () => {
    it('returns true when myRank is null', () => {
      assert.equal(isUnrankedPlayer(null), true);
    });

    it('returns true when ranked is false', () => {
      const unranked: LeaderboardMeResponse = {
        ranked: false,
        rank: null,
        bestScore: 0,
      };
      assert.equal(isUnrankedPlayer(unranked), true);
    });

    it('returns false when ranked is true', () => {
      const ranked: LeaderboardMeResponse = {
        ranked: true,
        rank: 14,
        bestScore: 650,
      };
      assert.equal(isUnrankedPlayer(ranked), false);
    });
  });

  describe('getRankBadgeClass', () => {
    it('returns distinctive styles for top 3 ranks', () => {
      assert.ok(getRankBadgeClass(1).includes('bg-tg-button'));
      assert.ok(getRankBadgeClass(2).includes('bg-tg-button/20'));
      assert.ok(getRankBadgeClass(3).includes('bg-tg-button/10'));
    });

    it('returns neutral styles for rank 4 and beyond', () => {
      assert.equal(getRankBadgeClass(4), 'bg-tg-bg text-tg-hint');
      assert.equal(getRankBadgeClass(50), 'bg-tg-bg text-tg-hint');
    });
  });
});
