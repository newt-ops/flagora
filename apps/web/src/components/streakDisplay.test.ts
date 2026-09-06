import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getStreakBadgeText,
  getProfileStreakDisplay,
} from './streakDisplayHelpers.js';

describe('streak display helpers', () => {
  describe('getStreakBadgeText for ResultsScreen', () => {
    it('returns extended message with current streak count when incremented', () => {
      assert.equal(getStreakBadgeText('incremented', 2), 'Streak extended to 2');
      assert.equal(getStreakBadgeText('incremented', 10), 'Streak extended to 10');
    });

    it('returns streak started message when reset', () => {
      assert.equal(getStreakBadgeText('reset', 1), 'Streak started');
    });

    it('returns null when unchanged for same-day repeat runs', () => {
      assert.equal(getStreakBadgeText('unchanged', 3), null);
      assert.equal(getStreakBadgeText('unchanged', 1), null);
    });
  });

  describe('getProfileStreakDisplay for ProfileCard', () => {
    it('formats active streak with days count and best streak secondary', () => {
      const active = getProfileStreakDisplay(5, 8);
      assert.equal(active.title, '5 Day Streak');
      assert.equal(active.subtitle, 'Best: 8 days');
      assert.equal(active.isActive, true);
    });

    it('formats neutral 0 streak when player has never played', () => {
      const zero = getProfileStreakDisplay(0, 0);
      assert.equal(zero.title, '0 Day Streak');
      assert.equal(zero.subtitle, 'Play daily to build streak');
      assert.equal(zero.isActive, false);
    });

    it('formats neutral 0 streak when previous streak broken but shows previous best', () => {
      const broken = getProfileStreakDisplay(0, 6);
      assert.equal(broken.title, '0 Day Streak');
      assert.equal(broken.subtitle, 'Best: 6 days');
      assert.equal(broken.isActive, false);
    });
  });
});
