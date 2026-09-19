import { useState, useCallback } from 'react';
import { showRewardedAd } from '../ads/adsgram.js';
import {
  BONUS_PINS_DEFAULT_CAP,
  getStoredDailyBonusPinsCount,
  setStoredDailyBonusPinsCount,
  getRemainingBonusAds,
  formatAdOutcomeFeedback,
} from '../components/rewardUiHelpers.js';
import type { AdOutcome } from '../ads/adsgramTypes.js';

export interface UseBonusPinsAdOptions {
  sessionToken?: string | null;
  onRewardSuccess?: () => void;
}

export function useBonusPinsAd({ sessionToken, onRewardSuccess }: UseBonusPinsAdOptions) {
  const [isWatchingAd, setIsWatchingAd] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; isSuccess: boolean } | null>(null);
  const [storedCount, setStoredCount] = useState<number>(() => getStoredDailyBonusPinsCount());

  const remainingAds = getRemainingBonusAds(storedCount);
  const isCapReached = remainingAds <= 0;

  const handleWatchAd = useCallback(async () => {
    if (!sessionToken || isWatchingAd || isCapReached) {
      return;
    }

    setIsWatchingAd(true);
    setFeedback(null);

    try {
      const outcome: AdOutcome = await showRewardedAd('bonus-pins', sessionToken);
      const formattedFeedback = formatAdOutcomeFeedback(outcome);
      setFeedback(formattedFeedback);

      if (outcome.status === 'rewarded') {
        const newCount = storedCount + 1;
        setStoredCount(newCount);
        setStoredDailyBonusPinsCount(newCount);
        onRewardSuccess?.();
      } else if (outcome.status === 'cap_reached') {
        const cap = outcome.dailyCap ?? BONUS_PINS_DEFAULT_CAP;
        setStoredCount(cap);
        setStoredDailyBonusPinsCount(cap);
      }
    } finally {
      setIsWatchingAd(false);
    }
  }, [sessionToken, isWatchingAd, isCapReached, storedCount, onRewardSuccess]);

  return {
    isWatchingAd,
    feedback,
    remainingAds,
    isCapReached,
    handleWatchAd,
    setFeedback,
  };
}
