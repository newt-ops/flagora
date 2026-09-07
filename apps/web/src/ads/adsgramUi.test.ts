import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  getRemainingBonusAds,
  getBonusAdsButtonText,
  getStreakSaveBannerCopy,
  formatAdOutcomeFeedback,
  getDailyCoinsStorageKey,
  getStoredDailyBonusCoinsCount,
  setStoredDailyBonusCoinsCount,
  getTodayUtcDateString,
  BONUS_COINS_DEFAULT_CAP,
} from '../components/rewardUiHelpers.js';
import { StreakSaveBanner } from '../components/StreakSaveBanner.js';
import { ProfileCard } from '../components/ProfileCard.js';
import type { PlayerProfile, StreakStatusResponse } from '@flagora/shared';
import type { AdOutcome } from './adsgramTypes.js';

describe('Phase 8 Prompt 05: Reward UI Entry Points', () => {
  const originalLocalStorage = (globalThis as unknown as { localStorage?: unknown }).localStorage;
  const originalWindow = (globalThis as unknown as { window?: unknown }).window;

  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const storageImpl = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = String(value);
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
    };

    (globalThis as unknown as { window: { localStorage: typeof storageImpl } }).window = {
      localStorage: storageImpl,
    };
  });

  afterEach(() => {
    (globalThis as unknown as { localStorage?: unknown }).localStorage = originalLocalStorage;
    (globalThis as unknown as { window?: unknown }).window = originalWindow;
  });

  const dummyProfile: PlayerProfile = {
    telegramUserId: 1234567,
    username: 'testplayer',
    firstName: 'Test',
    lastName: 'Player',
    photoUrl: null,
    coins: 250,
    xp: 1500,
    level: 3,
    bestScore: 850,
    gamesPlayed: 14,
    currentStreak: 4,
    longestStreak: 7,
    lastPlayedDate: '2026-09-06',
    referralCount: 2,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
  };

  describe('Bonus Coins UI State & Helpers', () => {
    it('initializes with 5 remaining ads and 0 used in storage', () => {
      const todayKey = getDailyCoinsStorageKey();
      assert.equal(getStoredDailyBonusCoinsCount(), 0);
      assert.equal(getRemainingBonusAds(0), 5);
      assert.equal(getBonusAdsButtonText(5, false), '+50 Coins • Watch Ad');
      assert.equal(mockStorage[todayKey], undefined);
    });

    it('decrements remaining count as ads are stored', () => {
      setStoredDailyBonusCoinsCount(1);
      assert.equal(getStoredDailyBonusCoinsCount(), 1);
      assert.equal(getRemainingBonusAds(1), 4);
      assert.equal(getBonusAdsButtonText(4, false), '+50 Coins • Watch Ad');

      setStoredDailyBonusCoinsCount(3);
      assert.equal(getStoredDailyBonusCoinsCount(), 3);
      assert.equal(getRemainingBonusAds(3), 2);

      setStoredDailyBonusCoinsCount(5);
      assert.equal(getStoredDailyBonusCoinsCount(), 5);
      assert.equal(getRemainingBonusAds(5), 0);
      assert.equal(
        getBonusAdsButtonText(0, false),
        'Daily cap reached (5/5) • Come back tomorrow',
      );
    });

    it('shows loading state while ad is watching', () => {
      assert.equal(getBonusAdsButtonText(5, true), 'Loading ad...');
      assert.equal(getBonusAdsButtonText(0, true), 'Loading ad...');
    });

    it('clamps remaining ads to 0 when count exceeds cap', () => {
      assert.equal(getRemainingBonusAds(10), 0);
      assert.equal(getRemainingBonusAds(-1), BONUS_COINS_DEFAULT_CAP);
    });

    it('formats positive feedback upon rewarded outcome', () => {
      const outcome: AdOutcome = {
        status: 'rewarded',
        rewardType: 'bonus-coins',
        data: {
          ok: true,
          coinsEarned: 50,
          coins: 300,
          telegramUserId: 1234567,
        },
      };

      const feedback = formatAdOutcomeFeedback(outcome);
      assert.deepEqual(feedback, {
        text: '+50 Coins earned! 🎉',
        isSuccess: true,
      });
    });

    it('formats cap reached feedback with backend message', () => {
      const outcome: AdOutcome = {
        status: 'cap_reached',
        rewardType: 'bonus-coins',
        dailyCap: 5,
        usedCount: 5,
        resetAtUtc: '2026-09-09T00:00:00.000Z',
        message: 'Daily bonus coins limit reached (5/5). Resets at 00:00 UTC.',
      };

      const feedback = formatAdOutcomeFeedback(outcome);
      assert.deepEqual(feedback, {
        text: 'Daily bonus coins limit reached (5/5). Resets at 00:00 UTC.',
        isSuccess: false,
      });
    });

    it('formats skipped feedback without error panic', () => {
      const outcome: AdOutcome = {
        status: 'skipped',
        rewardType: 'bonus-coins',
        message: 'Ad was skipped',
      };

      const feedback = formatAdOutcomeFeedback(outcome);
      assert.deepEqual(feedback, {
        text: 'Ad was skipped — no reward earned',
        isSuccess: false,
      });
    });

    it('formats unavailable ad feedback with polite retry message', () => {
      const outcome: AdOutcome = {
        status: 'unavailable',
        rewardType: 'bonus-coins',
        message: 'No ad available right now, try again later',
      };

      const feedback = formatAdOutcomeFeedback(outcome);
      assert.deepEqual(feedback, {
        text: 'No ad available right now, try again later',
        isSuccess: false,
      });
    });
  });

  describe('Streak Save UI State & Helpers', () => {
    it('formats streak banner copy with singular day', () => {
      const copy = getStreakSaveBannerCopy(1);
      assert.equal(copy.title, 'Keep your streak alive!');
      assert.equal(copy.subtitle, 'Watch a quick ad to save your 1-day streak');
    });

    it('formats streak banner copy with plural days', () => {
      const copy = getStreakSaveBannerCopy(5);
      assert.equal(copy.title, 'Keep your streak alive!');
      assert.equal(copy.subtitle, 'Watch a quick ad to save your 5-day streak');
    });

    it('formats positive feedback upon rewarded streak save', () => {
      const outcome: AdOutcome = {
        status: 'rewarded',
        rewardType: 'streak-save',
        data: {
          ok: true,
          saved: true,
          currentStreak: 4,
          longestStreak: 7,
          lastPlayedDate: '2026-09-07',
          telegramUserId: 1234567,
        },
      };

      const feedback = formatAdOutcomeFeedback(outcome);
      assert.deepEqual(feedback, {
        text: 'Streak saved! Play a game today to extend it 🚩',
        isSuccess: true,
      });
    });

    it('formats not-at-risk feedback if backend rejects intent', () => {
      const outcome: AdOutcome = {
        status: 'not_at_risk',
        rewardType: 'streak-save',
        message: 'Streak is not currently at risk',
      };

      const feedback = formatAdOutcomeFeedback(outcome);
      assert.deepEqual(feedback, {
        text: 'Streak is not currently at risk',
        isSuccess: false,
      });
    });
  });

  describe('StreakSaveBanner Component Rendering', () => {
    it('returns empty html when streak is not at risk', () => {
      const streakStatus: StreakStatusResponse = {
        isAtRisk: false,
        currentStreak: 3,
        longestStreak: 5,
        lastPlayedDate: getTodayUtcDateString(),
      };

      const html = renderToStaticMarkup(
        React.createElement(StreakSaveBanner, {
          streakStatus,
          sessionToken: 'test-token',
        }),
      );

      assert.equal(html, '');
    });

    it('returns empty html when streakStatus is null', () => {
      const html = renderToStaticMarkup(
        React.createElement(StreakSaveBanner, {
          streakStatus: null,
          sessionToken: 'test-token',
        }),
      );

      assert.equal(html, '');
    });

    it('renders banner html with test-id and copy when streak is at risk', () => {
      const streakStatus: StreakStatusResponse = {
        isAtRisk: true,
        currentStreak: 4,
        longestStreak: 7,
        lastPlayedDate: '2026-09-06',
      };

      const html = renderToStaticMarkup(
        React.createElement(StreakSaveBanner, {
          streakStatus,
          sessionToken: 'test-token',
        }),
      );

      assert.ok(html.includes('data-testid="streak-save-banner"'));
      assert.ok(html.includes('Keep your streak alive!'));
      assert.ok(html.includes('Watch a quick ad to save your 4-day streak'));
      assert.ok(html.includes('Save Streak'));
    });
  });

  describe('ProfileCard Reward Section Rendering', () => {
    it('renders ProfileCard with bonus coins elements and streak banner when at risk', () => {
      const html = renderToStaticMarkup(
        React.createElement(ProfileCard, {
          profile: dummyProfile,
          sessionToken: 'test-token',
          streakStatus: {
            isAtRisk: true,
            currentStreak: 4,
            longestStreak: 7,
            lastPlayedDate: '2026-09-06',
          },
        }),
      );

      assert.ok(html.includes('Bonus Coins'));
      assert.ok(html.includes('data-testid="bonus-coins-remaining-badge"'));
      assert.ok(html.includes('5/5 remaining today'));
      assert.ok(html.includes('data-testid="watch-bonus-ad-button"'));
      assert.ok(html.includes('data-testid="streak-save-banner"'));
    });

    it('renders ProfileCard without streak banner when streak is not at risk', () => {
      const html = renderToStaticMarkup(
        React.createElement(ProfileCard, {
          profile: dummyProfile,
          sessionToken: 'test-token',
          streakStatus: {
            isAtRisk: false,
            currentStreak: 4,
            longestStreak: 7,
            lastPlayedDate: '2026-09-07',
          },
        }),
      );

      assert.ok(html.includes('Bonus Coins'));
      assert.ok(html.includes('data-testid="watch-bonus-ad-button"'));
      assert.ok(!html.includes('data-testid="streak-save-banner"'));
    });
  });
});
