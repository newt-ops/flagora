import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getTodayUtcDateString,
  getDailyCoinsStorageKey,
  getStoredDailyBonusCoinsCount,
  setStoredDailyBonusCoinsCount,
  getRemainingBonusAds,
  getBonusAdsButtonText,
  getStreakSaveBannerCopy,
  formatAdOutcomeFeedback,
  BONUS_COINS_DEFAULT_CAP,
} from './rewardUiHelpers.js';
import type { AdOutcome } from '../ads/adsgramTypes.js';

describe('rewardUiHelpers', () => {
  const mockStorage: Record<string, string> = {};

  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) {
      delete mockStorage[key];
    }
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (key: string) => mockStorage[key] ?? null,
        setItem: (key: string, val: string) => {
          mockStorage[key] = val;
        },
      },
    };
  });

  it('computes today UTC date string in YYYY-MM-DD format', () => {
    const fixed = new Date('2026-09-08T01:30:00.000Z');
    assert.equal(getTodayUtcDateString(fixed), '2026-09-08');
  });

  it('builds storage key incorporating UTC date', () => {
    assert.equal(getDailyCoinsStorageKey('2026-09-08'), 'flagora_coins_ads_2026-09-08');
  });

  it('reads and writes daily stored count in localStorage', () => {
    assert.equal(getStoredDailyBonusCoinsCount('2026-09-08'), 0);
    setStoredDailyBonusCoinsCount(3, '2026-09-08');
    assert.equal(getStoredDailyBonusCoinsCount('2026-09-08'), 3);
  });

  it('calculates remaining bonus ads accurately', () => {
    assert.equal(getRemainingBonusAds(0), BONUS_COINS_DEFAULT_CAP);
    assert.equal(getRemainingBonusAds(2), 3);
    assert.equal(getRemainingBonusAds(5), 0);
    assert.equal(getRemainingBonusAds(6), 0);
  });

  it('returns appropriate button text for watching, available, and exhausted states', () => {
    assert.equal(getBonusAdsButtonText(5, true), 'Loading ad...');
    assert.equal(getBonusAdsButtonText(3, false), '+50 Coins • Watch Ad');
    assert.equal(
      getBonusAdsButtonText(0, false),
      'Daily cap reached (5/5) • Come back tomorrow',
    );
  });

  it('formats non-alarming streak-save copy with proper singular and plural nouns', () => {
    const copy1 = getStreakSaveBannerCopy(1);
    assert.equal(copy1.title, 'Keep your streak alive!');
    assert.equal(copy1.subtitle, 'Watch a quick ad to save your 1-day streak');

    const copy5 = getStreakSaveBannerCopy(5);
    assert.equal(copy5.title, 'Keep your streak alive!');
    assert.equal(copy5.subtitle, 'Watch a quick ad to save your 5-day streak');
  });

  it('formats feedback message accurately for each AdOutcome status', () => {
    const bonusRewarded: AdOutcome = {
      status: 'rewarded',
      rewardType: 'bonus-coins',
      data: { ok: true, coinsEarned: 50, coins: 200, telegramUserId: 100 },
    };
    assert.deepEqual(formatAdOutcomeFeedback(bonusRewarded), {
      text: '+50 Coins earned! 🎉',
      isSuccess: true,
    });

    const streakRewarded: AdOutcome = {
      status: 'rewarded',
      rewardType: 'streak-save',
      data: {
        ok: true,
        saved: true,
        lastPlayedDate: '2026-09-07',
        currentStreak: 4,
        longestStreak: 8,
        telegramUserId: 100,
      },
    };
    assert.deepEqual(formatAdOutcomeFeedback(streakRewarded), {
      text: 'Streak saved! Play a game today to extend it 🚩',
      isSuccess: true,
    });

    const capReached: AdOutcome = {
      status: 'cap_reached',
      rewardType: 'bonus-coins',
      dailyCap: 5,
      usedCount: 5,
      message: 'Daily limit reached',
    };
    assert.deepEqual(formatAdOutcomeFeedback(capReached), {
      text: 'Daily limit reached',
      isSuccess: false,
    });

    const notAtRisk: AdOutcome = {
      status: 'not_at_risk',
      rewardType: 'streak-save',
      message: 'Streak not at risk',
    };
    assert.deepEqual(formatAdOutcomeFeedback(notAtRisk), {
      text: 'Streak is not currently at risk',
      isSuccess: false,
    });

    const unavailable: AdOutcome = {
      status: 'unavailable',
      rewardType: 'bonus-coins',
      message: 'No ad available right now, try again later 🙏',
    };
    assert.deepEqual(formatAdOutcomeFeedback(unavailable), {
      text: 'No ad available right now, try again later 🙏',
      isSuccess: false,
    });

    const skipped: AdOutcome = {
      status: 'skipped',
      rewardType: 'bonus-coins',
      message: 'Ad was skipped',
    };
    assert.deepEqual(formatAdOutcomeFeedback(skipped), {
      text: 'Ad was skipped — no reward earned',
      isSuccess: false,
    });

    const error: AdOutcome = {
      status: 'error',
      rewardType: 'bonus-coins',
      message: 'Network failed',
    };
    assert.deepEqual(formatAdOutcomeFeedback(error), {
      text: 'Network failed',
      isSuccess: false,
    });
  });
});
