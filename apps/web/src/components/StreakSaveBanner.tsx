import { useState, useCallback } from 'react';
import { Flame, ShieldCheck, Loader2 } from 'lucide-react';
import { type StreakStatusResponse, STREAK_SAVE_PIN_COST } from '@flagora/shared';
import { saveStreak } from '../api/client.js';
import { getStreakSaveBannerCopy } from './rewardUiHelpers.js';

export interface StreakSaveBannerProps {
  sessionToken?: string | null;
  streakStatus?: StreakStatusResponse | null;
  userPins?: number;
  isPro?: boolean;
  onSuccess?: () => void;
  onUpgradePro?: () => void;
}

export function StreakSaveBanner({
  sessionToken,
  streakStatus,
  userPins = 0,
  isPro = false,
  onSuccess,
  onUpgradePro,
}: StreakSaveBannerProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; isSuccess: boolean } | null>(null);

  const canAfford = isPro || userPins >= STREAK_SAVE_PIN_COST;

  const handleSaveStreak = useCallback(async () => {
    if (!sessionToken || isSaving || !canAfford) {
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const res = await saveStreak(sessionToken);
      if (res.saved) {
        setFeedback({ text: 'Streak saved! Play a game today to extend it 🚩', isSuccess: true });
        onSuccess?.();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save streak';
      setFeedback({ text: message, isSuccess: false });
    } finally {
      setIsSaving(false);
    }
  }, [sessionToken, isSaving, canAfford, onSuccess]);

  if (!streakStatus?.isAtRisk) {
    return null;
  }

  const { title, subtitle, buttonText } = getStreakSaveBannerCopy(streakStatus.currentStreak, isPro);

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
            {!isPro && !canAfford && (
              <div className="mt-1 flex flex-col gap-1">
                <p className="text-[11px] font-semibold text-tg-destructive">
                  You need {STREAK_SAVE_PIN_COST} pins (current: {userPins})
                </p>
                {onUpgradePro && (
                  <button
                    type="button"
                    onClick={onUpgradePro}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-tg-button hover:underline"
                  >
                    <span>Upgrade to Pro with Stars for free saves</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSaveStreak}
          disabled={isSaving || !sessionToken || !canAfford}
          className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-tg-button px-3.5 text-xs font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75 disabled:pointer-events-none disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-tg-button-text" />
              <span>Saving...</span>
            </>
          ) : (
            <span>{buttonText}</span>
          )}
        </button>
      </div>

      {feedback && (
        <div
          data-testid="streak-save-feedback"
          className={`mt-2.5 rounded-xl px-2.5 py-1.5 text-xs font-medium ${
            feedback.isSuccess
              ? 'bg-tg-button/10 text-tg-button'
              : 'bg-tg-destructive/10 text-tg-destructive'
          }`}
        >
          {feedback.text}
        </div>
      )}
    </div>
  );
}
