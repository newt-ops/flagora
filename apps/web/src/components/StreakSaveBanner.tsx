import { useState, useCallback } from 'react';
import { Flame, ShieldCheck, Loader2 } from 'lucide-react';
import type { StreakStatusResponse } from '@flagora/shared';
import { showRewardedAd } from '../ads/adsgram.js';
import {
  getStreakSaveBannerCopy,
  formatAdOutcomeFeedback,
} from './rewardUiHelpers.js';

export interface StreakSaveBannerProps {
  sessionToken?: string | null;
  streakStatus?: StreakStatusResponse | null;
  onSuccess?: () => void;
  onLearnMore?: () => void;
}

export function StreakSaveBanner({
  sessionToken,
  streakStatus,
  onSuccess,
  onLearnMore,
}: StreakSaveBannerProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; isSuccess: boolean } | null>(null);

  const handleSaveStreak = useCallback(async () => {
    if (!sessionToken || isSaving) {
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const outcome = await showRewardedAd('streak-save', sessionToken);
      const formattedFeedback = formatAdOutcomeFeedback(outcome);
      setFeedback(formattedFeedback);

      if (outcome.status === 'rewarded') {
        onSuccess?.();
      }
    } finally {
      setIsSaving(false);
    }
  }, [sessionToken, isSaving, onSuccess]);

  if (!streakStatus?.isAtRisk) {
    return null;
  }

  const { title, subtitle } = getStreakSaveBannerCopy(streakStatus.currentStreak);

  return (
    <div
      data-testid="streak-save-banner"
      className="flex w-full flex-col rounded-2xl bg-tg-section p-4 text-left shadow-sm"
    >
      <div className="flex items-start justify-between flex-wrap sm:flex-nowrap gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-tg-button/10 text-tg-button">
            <Flame className="h-4 w-4 fill-current text-tg-button" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-tg-text truncate">{title}</span>
              <ShieldCheck className="h-4 w-4 text-tg-button shrink-0" />
            </div>
            <p className="mt-0.5 text-xs text-tg-hint">{subtitle}</p>
            {onLearnMore && (
              <button
                type="button"
                onClick={onLearnMore}
                data-testid="streak-save-learn-more"
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-tg-link hover:opacity-80 underline underline-offset-2"
              >
                Learn more & view earn options
              </button>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSaveStreak}
          disabled={isSaving || !sessionToken}
          className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-tg-button px-3.5 text-xs font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75 disabled:pointer-events-none disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-tg-button-text" />
              <span>Saving...</span>
            </>
          ) : (
            <span>Save Streak</span>
          )}
        </button>
      </div>

      {feedback && (
        <div
          data-testid="streak-save-feedback"
          className={`mt-2.5 rounded-xl px-2.5 py-1.5 text-xs font-medium ${
            feedback.isSuccess
              ? 'bg-tg-button/10 text-tg-button'
              : 'bg-tg-secondary-bg text-tg-hint'
          }`}
        >
          {feedback.text}
        </div>
      )}
    </div>
  );
}
