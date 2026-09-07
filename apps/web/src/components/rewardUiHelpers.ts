import { getUtcDateString } from '@flagora/shared';
import type { AdOutcome } from '../ads/adsgramTypes.js';

export const BONUS_COINS_DEFAULT_CAP = 5;

export function getTodayUtcDateString(now?: Date): string {
  return getUtcDateString(now);
}

export function getDailyCoinsStorageKey(dateStr?: string): string {
  const d = dateStr || getTodayUtcDateString();
  return `flagora_coins_ads_${d}`;
}

export function getStoredDailyBonusCoinsCount(dateStr?: string): number {
  if (typeof window === 'undefined' || !window.localStorage) {
    return 0;
  }
  try {
    const raw = window.localStorage.getItem(getDailyCoinsStorageKey(dateStr));
    if (!raw) return 0;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export function setStoredDailyBonusCoinsCount(count: number, dateStr?: string): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(
      getDailyCoinsStorageKey(dateStr),
      String(Math.max(0, count)),
    );
  } catch {
    void 0;
  }
}

export function getRemainingBonusAds(
  usedCount: number,
  dailyCap = BONUS_COINS_DEFAULT_CAP,
): number {
  return Math.max(0, dailyCap - Math.max(0, usedCount));
}

export function getBonusAdsButtonText(
  remaining: number,
  isWatching: boolean,
): string {
  if (isWatching) {
    return 'Loading ad...';
  }
  if (remaining <= 0) {
    return 'Daily cap reached (5/5) • Come back tomorrow';
  }
  return '+50 Coins • Watch Ad';
}

export function getStreakSaveBannerCopy(streak: number): {
  title: string;
  subtitle: string;
} {
  return {
    title: 'Keep your streak alive!',
    subtitle: `Watch a quick ad to save your ${streak}-day streak`,
  };
}

export function formatAdOutcomeFeedback(
  outcome: AdOutcome,
): { text: string; isSuccess: boolean } | null {
  switch (outcome.status) {
    case 'rewarded':
      if (outcome.rewardType === 'bonus-coins') {
        return { text: '+50 Coins earned! 🎉', isSuccess: true };
      }
      return {
        text: 'Streak saved! Play a game today to extend it 🚩',
        isSuccess: true,
      };
    case 'cap_reached':
      return {
        text: outcome.message || 'Daily limit reached. Come back tomorrow!',
        isSuccess: false,
      };
    case 'not_at_risk':
      return {
        text: 'Streak is not currently at risk',
        isSuccess: false,
      };
    case 'unavailable':
      return {
        text: outcome.message || 'No ad available right now, try again later 🙏',
        isSuccess: false,
      };
    case 'skipped':
      return {
        text: 'Ad was skipped — no reward earned',
        isSuccess: false,
      };
    case 'error':
      return {
        text: outcome.message || 'Failed to display ad',
        isSuccess: false,
      };
    default:
      return null;
  }
}
