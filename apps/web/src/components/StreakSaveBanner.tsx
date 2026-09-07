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
}

export function StreakSaveBanner({
  sessionToken,
  streakStatus,
  onSuccess,
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
      className="flex w-full flex-col rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-left"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-500 ring-1 ring-amber-500/30">
            <Flame className="h-5 w-5 fill-current text-amber-500" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-amber-400">{title}</span>
              <ShieldCheck className="h-4 w-4 text-amber-400" />
            </div>
            <p className="mt-0.5 text-xs text-tg-hint">{subtitle}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSaveStreak}
          disabled={isSaving || !sessionToken}
          className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3.5 text-xs font-bold text-slate-950 shadow-sm transition-opacity hover:opacity-90 active:opacity-75 disabled:pointer-events-none disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-950" />
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
          className={`mt-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
            feedback.isSuccess
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-amber-500/15 text-amber-300'
          }`}
        >
          {feedback.text}
        </div>
      )}
    </div>
  );
}
