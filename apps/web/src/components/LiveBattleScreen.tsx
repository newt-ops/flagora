import { useState, useEffect, useRef } from 'react';
import { Timer, Zap, Check, X, WifiOff, Loader2 } from 'lucide-react';
import {
  calculateComboMultiplier,
  type BattleStartPayload,
  type OpponentProgressPayload,
  type SubmitAnswerResponse,
} from '@flagora/shared';
import { triggerHaptic } from '../telegram/haptics.js';

interface LiveBattleScreenProps {
  battleStart: BattleStartPayload;
  opponentDisplayName?: string | null;
  opponentProgress: OpponentProgressPayload | null;
  isReconnecting: boolean;
  onSubmitAnswer: (flagIndex: number, selectedIsoCode: string) => Promise<SubmitAnswerResponse>;
  onCheckFinished?: () => void;
}

export function LiveBattleScreen({
  battleStart,
  opponentDisplayName = 'Opponent',
  opponentProgress,
  isReconnecting,
  onSubmitAnswer,
  onCheckFinished,
}: LiveBattleScreenProps) {
  const [currentFlagIndex, setCurrentFlagIndex] = useState(0);
  const [runningScore, setRunningScore] = useState(0);
  const [comboCount, setComboCount] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    pointsThisFlag: number;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeLeftMs, setTimeLeftMs] = useState(battleStart.runDurationMs);
  const [timeExpired, setTimeExpired] = useState(false);

  const startTimestampRef = useRef<number>(Date.now());
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const startedAtTime = new Date(battleStart.startedAt).getTime();
    const initialElapsed = Math.max(0, Date.now() - startedAtTime);
    startTimestampRef.current = Date.now() - initialElapsed;

    timerIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimestampRef.current;
      const remaining = Math.max(0, battleStart.runDurationMs - elapsed);
      setTimeLeftMs(remaining);

      if (remaining <= 0) {
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
        }
        setTimeExpired(true);
      }
    }, 100);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [battleStart.runDurationMs, battleStart.startedAt]);

  const handleSelectChoice = async (choiceText: string) => {
    if (isSubmitting || selectedChoice !== null || timeExpired) {
      return;
    }

    setIsSubmitting(true);
    setSelectedChoice(choiceText);

    try {
      const response = await onSubmitAnswer(currentFlagIndex, choiceText);

      if (response.success && response.result) {
        const res = response.result;
        triggerHaptic(res.correct ? 'success' : 'error');
        setRunningScore(res.runningTotal);
        setComboCount(res.comboCount);
        setFeedback({
          correct: res.correct,
          pointsThisFlag: res.pointsThisFlag,
        });
      } else if (response.timeExpired) {
        triggerHaptic('warning');
        setTimeExpired(true);
      }

      setTimeout(() => {
        const isLastFlag = currentFlagIndex >= battleStart.flags.length - 1;
        if (!isLastFlag) {
          setCurrentFlagIndex((prev) => prev + 1);
          setSelectedChoice(null);
          setFeedback(null);
          setIsSubmitting(false);
        }
      }, 550);
    } catch {
      setIsSubmitting(false);
      setSelectedChoice(null);
    }
  };

  const currentFlag = battleStart.flags[currentFlagIndex];
  const timerSeconds = Math.ceil(timeLeftMs / 1000);
  const timerPercentage = Math.min(
    100,
    Math.max(0, (timeLeftMs / battleStart.runDurationMs) * 100),
  );
  const comboMultiplier = calculateComboMultiplier(comboCount);

  return (
    <div className="relative flex w-full max-w-sm flex-col items-center gap-4 text-tg-text">
      {isReconnecting && (
        <div
          className="fixed top-[calc(var(--app-safe-top,0px)+0.75rem)] z-50 flex items-center gap-2 rounded-full bg-tg-button/90 px-4 py-1.5 text-xs font-bold text-tg-button-text shadow-lg backdrop-blur-sm"
        >
          <WifiOff className="h-3.5 w-3.5 animate-pulse" />
          <span>Reconnecting to battle...</span>
        </div>
      )}

      <div className="flex w-full flex-col gap-2 rounded-2xl bg-tg-section border border-tg-separator p-3.5 shadow-sm">
        <div className="grid grid-cols-2 gap-2 border-b border-tg-separator pb-2.5">
          <div className="flex flex-col">
            <div className="flex items-center gap-1 text-[11px] font-semibold text-tg-hint">
              <span>You</span>
              <span className="text-tg-text">
                ({currentFlagIndex + 1}/{battleStart.flags.length})
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="text-lg font-black text-tg-text">{runningScore}</span>
              {comboCount > 0 && (
                <span className="flex items-center gap-0.5 rounded bg-tg-button/20 px-1.5 py-0.5 text-[10px] font-extrabold text-tg-button">
                  <Zap className="h-2.5 w-2.5" />
                  {comboMultiplier}x
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end text-right">
            <div className="flex items-center gap-1 text-[11px] font-semibold text-tg-hint">
              <span className="max-w-[90px] truncate">{opponentDisplayName || 'Opponent'}</span>
              <span className="text-tg-text">
                ({opponentProgress ? opponentProgress.flagIndex + 1 : 0}/{battleStart.flags.length})
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              {opponentProgress && (
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-black ${
                    opponentProgress.correct
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  }`}
                >
                  {opponentProgress.correct ? '+' : 'x'}
                </span>
              )}
              <span className="text-lg font-black text-tg-text">
                {opponentProgress?.runningTotal ?? 0}
              </span>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-[11px] font-medium text-tg-hint">
            <span className="flex items-center gap-1">
              <Timer className="h-3 w-3" />
              <span>Battle Timer</span>
            </span>
            <span className={timerSeconds <= 10 ? 'font-bold text-rose-400' : 'text-tg-text'}>
              {timerSeconds}s
            </span>
          </div>

          <svg className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-tg-secondary-bg">
            <rect
              x="0"
              y="0"
              width={`${timerPercentage}%`}
              height="100%"
              rx="3"
              className={`transition-all duration-100 ease-linear ${
                timerSeconds <= 10
                  ? 'fill-rose-500'
                  : 'fill-tg-button'
              }`}
            />
          </svg>
        </div>
      </div>

      {timeExpired ? (
        <div className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl bg-tg-section border border-tg-separator p-6 text-center shadow-sm">
          <Loader2 className="h-6 w-6 animate-spin text-tg-button" />
          <p className="text-sm font-bold text-tg-text">Time is up!</p>
          <p className="text-xs text-tg-hint">Tallying final battle results...</p>
          {onCheckFinished && (
            <button
              type="button"
              onClick={onCheckFinished}
              className="mt-1 rounded-xl bg-tg-button px-4 py-2 text-xs font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75"
            >
              Check Final Results
            </button>
          )}
        </div>
      ) : currentFlagIndex >= battleStart.flags.length ? (
        <div className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl bg-tg-section border border-tg-separator p-6 text-center shadow-sm">
          <Check className="h-8 w-8 text-emerald-400" />
          <p className="text-sm font-bold text-tg-text">All flags completed!</p>
          <p className="text-xs text-tg-hint">Waiting for opponent or battle tally...</p>
          {onCheckFinished && (
            <button
              type="button"
              onClick={onCheckFinished}
              className="mt-1 rounded-xl bg-tg-button px-4 py-2 text-xs font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75"
            >
              Check Final Results
            </button>
          )}
        </div>
      ) : (
        currentFlag && (
          <div className="flex w-full flex-col items-center gap-4">
            <div className="flex aspect-[3/2] w-full items-center justify-center overflow-hidden rounded-2xl bg-tg-section p-6 shadow-sm border border-tg-separator">
              <span
                className={`fi fi-${currentFlag.isoCode.toLowerCase()} text-8xl rounded-lg shadow-sm`}
              />
            </div>

            {feedback && (
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                {feedback.correct ? (
                  <span className="flex items-center gap-1 text-emerald-500">
                    <Check className="h-3.5 w-3.5" />
                    <span>+{feedback.pointsThisFlag} pts</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-rose-500">
                    <X className="h-3.5 w-3.5" />
                    <span>+0 pts</span>
                  </span>
                )}
              </div>
            )}

            <div className="grid w-full grid-cols-2 gap-2.5">
              {currentFlag.choices.map((choice: string) => {
                const isSelected = selectedChoice === choice;
                let buttonStyle = 'bg-tg-section text-tg-text border border-tg-separator hover:opacity-90';

                if (isSelected) {
                  if (feedback) {
                    buttonStyle = feedback.correct
                      ? 'bg-emerald-600 text-white font-bold ring-2 ring-emerald-400'
                      : 'bg-rose-600 text-white font-bold ring-2 ring-rose-400';
                  } else {
                    buttonStyle = 'bg-tg-button text-tg-button-text font-bold';
                  }
                }

                return (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => void handleSelectChoice(choice)}
                    disabled={isSubmitting || timeExpired}
                    className={`flex min-h-14 items-center justify-center rounded-xl p-3 text-center text-sm font-medium transition-opacity duration-150 active:opacity-75 disabled:pointer-events-none ${buttonStyle}`}
                  >
                    <span className="line-clamp-2">{choice}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )
      )}
    </div>
  );
}
