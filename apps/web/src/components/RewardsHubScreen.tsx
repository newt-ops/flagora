import { useState, useCallback } from 'react';
import {
  Coins,
  Flame,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Sparkles,
  ShoppingBag,
  Info,
  CheckCircle2,
} from 'lucide-react';
import type { PlayerProfile, StreakStatusResponse } from '@flagora/shared';
import { useBonusCoinsAd } from '../hooks/useBonusCoinsAd.js';
import { showRewardedAd } from '../ads/adsgram.js';
import {
  getBonusAdsButtonText,
  getStreakSaveBannerCopy,
  formatAdOutcomeFeedback,
} from './rewardUiHelpers.js';

export interface RewardsHubScreenProps {
  profile: PlayerProfile;
  streakStatus?: StreakStatusResponse | null;
  sessionToken?: string | null;
  onRefetchProfile?: () => void;
  onRefetchStreakStatus?: () => void;
  onNavigateToShop?: () => void;
}

export function RewardsHubScreen({
  profile,
  streakStatus,
  sessionToken,
  onRefetchProfile,
  onRefetchStreakStatus,
  onNavigateToShop,
}: RewardsHubScreenProps) {
  const {
    isWatchingAd,
    feedback: bonusFeedback,
    remainingAds,
    isCapReached,
    handleWatchAd,
  } = useBonusCoinsAd({
    sessionToken,
    onRewardSuccess: onRefetchProfile,
  });

  const [isSavingStreak, setIsSavingStreak] = useState(false);
  const [streakFeedback, setStreakFeedback] = useState<{
    text: string;
    isSuccess: boolean;
  } | null>(null);

  const isStreakAtRisk = Boolean(streakStatus?.isAtRisk);
  const currentStreak = streakStatus?.currentStreak ?? profile.currentStreak ?? 0;
  const streakCopy = getStreakSaveBannerCopy(currentStreak);

  const handleSaveStreak = useCallback(async () => {
    if (!sessionToken || isSavingStreak || !isStreakAtRisk) {
      return;
    }

    setIsSavingStreak(true);
    setStreakFeedback(null);

    try {
      const outcome = await showRewardedAd('streak-save', sessionToken);
      const formatted = formatAdOutcomeFeedback(outcome);
      setStreakFeedback(formatted);

      if (outcome.status === 'rewarded') {
        onRefetchProfile?.();
        onRefetchStreakStatus?.();
      }
    } finally {
      setIsSavingStreak(false);
    }
  }, [sessionToken, isSavingStreak, isStreakAtRisk, onRefetchProfile, onRefetchStreakStatus]);

  return (
    <div data-testid="rewards-hub-screen" className="flex w-full max-w-md mx-auto flex-col gap-4 text-tg-text pb-20">
      <div className="flex items-center justify-between flex-wrap gap-2 rounded-2xl bg-tg-section p-4 shadow-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tg-button/10 text-tg-button">
            <Coins className="h-5 w-5" />
          </div>
          <div className="flex flex-col text-left min-w-0">
            <h1 className="text-base font-bold text-tg-text truncate">Earn Free Coins</h1>
            <p className="text-xs text-tg-hint truncate">Sponsored rewards & streak protection</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 rounded-full bg-tg-secondary-bg px-3 py-1.5 text-xs font-bold text-tg-text shrink-0">
          <Coins className="h-4 w-4 text-tg-button" />
          <span>{profile.coins.toLocaleString()}</span>
        </div>
      </div>

      <div className="rounded-2xl bg-tg-section p-4 shadow-sm text-left">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-tg-button/10 text-tg-button">
              <Coins className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-tg-text truncate">Daily Bonus Coins</p>
              <p className="text-[11px] text-tg-hint truncate">+50 coins per ad • 5 available daily</p>
            </div>
          </div>
          <span
            data-testid="bonus-coins-remaining-badge"
            className="rounded-full bg-tg-button/15 px-2.5 py-0.5 text-xs font-bold text-tg-button shrink-0"
          >
            {remainingAds > 0 ? `${remainingAds}/5 remaining today` : 'Daily cap reached (5/5)'}
          </span>
        </div>

        <p className="mt-2.5 text-xs text-tg-hint leading-relaxed">
          Watch a quick sponsored video to receive 50 bonus coins immediately. Resets every day at 00:00 UTC.
        </p>

        <button
          type="button"
          onClick={handleWatchAd}
          disabled={isCapReached || isWatchingAd || !sessionToken}
          data-testid="watch-bonus-ad-button"
          className="mt-3.5 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-tg-button px-3 text-xs font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75 disabled:pointer-events-none disabled:opacity-50"
        >
          {isWatchingAd ? (
            <Loader2 className="h-4 w-4 animate-spin text-tg-button-text" />
          ) : (
            <Coins className="h-4 w-4 text-tg-button-text" />
          )}
          <span>{getBonusAdsButtonText(remainingAds, isWatchingAd)}</span>
        </button>

        {bonusFeedback && (
          <div
            data-testid="bonus-coins-feedback"
            className={`mt-2.5 rounded-xl px-2.5 py-1.5 text-xs font-medium ${
              bonusFeedback.isSuccess
                ? 'bg-tg-button/10 text-tg-button'
                : 'bg-tg-secondary-bg text-tg-hint'
            }`}
          >
            {bonusFeedback.text}
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-tg-section p-4 shadow-sm text-left">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-tg-button/10 text-tg-button">
              {isStreakAtRisk ? (
                <ShieldAlert className="h-4 w-4" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-tg-text truncate">Streak Protection</p>
              <p className="text-[11px] text-tg-hint truncate">Preserve streak when a day is missed</p>
            </div>
          </div>

          <span
            data-testid="streak-protection-status-badge"
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold shrink-0 ${
              isStreakAtRisk
                ? 'bg-tg-secondary-bg text-tg-text'
                : 'bg-tg-button/15 text-tg-button'
            }`}
          >
            {isStreakAtRisk ? 'At Risk' : 'Not currently needed'}
          </span>
        </div>

        <div className="mt-2.5 text-xs text-tg-hint leading-relaxed">
          {isStreakAtRisk ? (
            <p className="text-tg-text font-medium">
              {streakCopy.subtitle}
            </p>
          ) : (
            <p>
              Your daily streak is active and up to date ({currentStreak} day{currentStreak === 1 ? '' : 's'}).
              If you ever miss a day without playing, streak protection becomes available here to rescue your progress.
            </p>
          )}
        </div>

        {isStreakAtRisk ? (
          <button
            type="button"
            onClick={handleSaveStreak}
            disabled={isSavingStreak || !sessionToken}
            data-testid="watch-streak-save-ad-button"
            className="mt-3.5 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-tg-button px-3 text-xs font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75 disabled:pointer-events-none disabled:opacity-50"
          >
            {isSavingStreak ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-tg-button-text" />
                <span>Saving streak...</span>
              </>
            ) : (
              <>
                <Flame className="h-4 w-4 fill-current text-tg-button-text" />
                <span>Save Streak • Watch Ad</span>
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            disabled
            data-testid="streak-save-not-needed-button"
            className="mt-3.5 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-tg-secondary-bg px-3 text-xs font-medium text-tg-hint cursor-not-allowed opacity-75"
          >
            <CheckCircle2 className="h-4 w-4 text-tg-button" />
            <span>Protection Not Needed • Streak Safe</span>
          </button>
        )}

        {streakFeedback && (
          <div
            data-testid="streak-save-feedback"
            className={`mt-2.5 rounded-xl px-2.5 py-1.5 text-xs font-medium ${
              streakFeedback.isSuccess
                ? 'bg-tg-button/10 text-tg-button'
                : 'bg-tg-secondary-bg text-tg-hint'
            }`}
          >
            {streakFeedback.text}
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-tg-section p-4 shadow-sm text-left">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-tg-button shrink-0" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-tg-hint">Reward Economy Guide</h2>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2.5 text-xs">
          <div className="flex items-start gap-2.5 rounded-xl bg-tg-secondary-bg p-3">
            <Sparkles className="h-4 w-4 text-tg-button shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-semibold text-tg-text">Correct Quiz Answers</p>
              <p className="text-[11px] text-tg-hint">+5 coins for every correct flag identified during practice, daily, challenge, and battle runs.</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-xl bg-tg-secondary-bg p-3">
            <Coins className="h-4 w-4 text-tg-button shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-semibold text-tg-text">Daily Sponsored Videos</p>
              <p className="text-[11px] text-tg-hint">+50 coins per video, up to 5 times per day (+250 coins maximum daily bonus).</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-xl bg-tg-secondary-bg p-3">
            <ShoppingBag className="h-4 w-4 text-tg-button shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-semibold text-tg-text">Cosmetic Shop Tiers</p>
              <p className="text-[11px] text-tg-hint">Spend coins on Avatar Frames, Flag Themes, and Profile Banners: Tier 1 (~150 coins), Tier 2 (~400 coins), Tier 3 (~900 coins).</p>
            </div>
          </div>
        </div>

        {onNavigateToShop && (
          <button
            type="button"
            onClick={onNavigateToShop}
            className="mt-3.5 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-tg-button/15 px-3 text-xs font-semibold text-tg-button hover:bg-tg-button/20 active:opacity-75 transition-colors"
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            <span>Browse Cosmetic Shop</span>
          </button>
        )}
      </div>
    </div>
  );
}
