import { useState, useEffect, useRef, useCallback } from 'react';
import { Timer, Zap, Award, Check, X, AlertCircle } from 'lucide-react';
import {
  calculateComboMultiplier,
  type StartRunResponse,
  type FinishRunResponse,
} from '@flagora/shared';
import { useGameRun } from '../hooks/useGameRun.js';
import { triggerHaptic } from '../telegram/haptics.js';
import { TimeExpiredApiError } from '../api/client.js';

interface GameScreenProps {
  run: StartRunResponse;
  sessionToken: string;
  onFinish: (result: FinishRunResponse) => void;
}

export function GameScreen({ run, sessionToken, onFinish }: GameScreenProps) {
  const { answerRun, finishRun } = useGameRun();

  const [currentFlagIndex, setCurrentFlagIndex] = useState(0);
  const [runningScore, setRunningScore] = useState(0);
  const [comboCount, setComboCount] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    pointsThisFlag: number;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeLeftMs, setTimeLeftMs] = useState(run.runDurationMs);
  const [timeExpired, setTimeExpired] = useState(false);

  const startTimestampRef = useRef<number>(Date.now());
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasFinishedRef = useRef(false);

  const handleFinishRun = useCallback(async () => {
    if (hasFinishedRef.current) {
      return;
    }
    hasFinishedRef.current = true;
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    try {
      const finishResult = await finishRun({
        sessionToken,
        runId: run.runId,
      });
      onFinish(finishResult);
    } catch {
      const fallbackResult: FinishRunResponse = {
        correctCount: 0,
        timeUsedMs: run.runDurationMs,
        maxCombo: comboCount,
        leftoverBonus: 0,
        totalScore: runningScore,
        xpEarned: 0,
        coinsEarned: 0,
        newXp: 0,
        newCoins: 0,
        newLevel: 1,
        leveledUp: false,
        bestScore: runningScore,
        isNewBest: false,
        currentStreak: 1,
        longestStreak: 1,
        streakChange: 'unchanged',
      };
      onFinish(fallbackResult);
    }
  }, [comboCount, finishRun, onFinish, run.runDurationMs, run.runId, runningScore, sessionToken]);

  useEffect(() => {
    startTimestampRef.current = Date.now();

    timerIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimestampRef.current;
      const remaining = Math.max(0, run.runDurationMs - elapsed);
      setTimeLeftMs(remaining);

      if (remaining <= 0) {
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
        }
        setTimeExpired(true);
        void handleFinishRun();
      }
    }, 100);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [handleFinishRun, run.runDurationMs]);

  const handleSelectChoice = async (choiceText: string) => {
    if (isSubmitting || selectedChoice !== null || timeExpired || hasFinishedRef.current) {
      return;
    }

    setIsSubmitting(true);
    setSelectedChoice(choiceText);

    try {
      const answerResponse = await answerRun({
        sessionToken,
        runId: run.runId,
        flagIndex: currentFlagIndex,
        selectedIsoCode: choiceText,
      });

      triggerHaptic(answerResponse.correct ? 'success' : 'error');
      setRunningScore(answerResponse.runningTotal);
      setComboCount(answerResponse.comboCount);
      setFeedback({
        correct: answerResponse.correct,
        pointsThisFlag: answerResponse.pointsThisFlag,
      });

      setTimeout(() => {
        if (hasFinishedRef.current) {
          return;
        }

        const isLastFlag = currentFlagIndex >= run.flags.length - 1;
        if (isLastFlag) {
          void handleFinishRun();
        } else {
          setCurrentFlagIndex((prev) => prev + 1);
          setSelectedChoice(null);
          setFeedback(null);
          setIsSubmitting(false);
        }
      }, 650);
    } catch (error) {
      if (error instanceof TimeExpiredApiError) {
        triggerHaptic('warning');
        setTimeExpired(true);
        void handleFinishRun();
        return;
      }
      setIsSubmitting(false);
      setSelectedChoice(null);
    }
  };

  const currentFlag = run.flags[currentFlagIndex];
  const timerSeconds = Math.ceil(timeLeftMs / 1000);
  const timerPercentage = Math.min(100, Math.max(0, (timeLeftMs / run.runDurationMs) * 100));
  const comboMultiplier = calculateComboMultiplier(comboCount);

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4 text-tg-text">
      <div className="w-full rounded-2xl bg-tg-secondary-bg p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-tg-hint">
            <span>Flag</span>
            <span className="text-tg-text">
              {currentFlagIndex + 1}/{run.flags.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {comboCount > 0 && (
              <div className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-400 ring-1 ring-amber-500/30">
                <Zap className="h-3 w-3" />
                <span>{comboMultiplier}x</span>
              </div>
            )}

            <div className="flex items-center gap-1 rounded-full bg-tg-bg px-2.5 py-0.5 text-xs font-bold text-tg-text">
              <Award className="h-3.5 w-3.5 text-tg-button" />
              <span>{runningScore}</span>
            </div>
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between text-xs font-medium text-tg-hint">
            <span className="flex items-center gap-1">
              <Timer className="h-3.5 w-3.5" />
              <span>Time Left</span>
            </span>
            <span className={timerSeconds <= 10 ? 'font-bold text-rose-400' : 'text-tg-text'}>
              {timerSeconds}s
            </span>
          </div>

          <svg className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-tg-bg">
            <rect
              x="0"
              y="0"
              width={`${timerPercentage}%`}
              height="100%"
              rx="3"
              className={`transition-all duration-100 ease-linear ${
                timerSeconds <= 10
                  ? 'fill-rose-500'
                  : timerSeconds <= 25
                    ? 'fill-amber-500'
                    : 'fill-emerald-500'
              }`}
            />
          </svg>
        </div>
      </div>

      {timeExpired && (
        <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500/20 p-3 text-sm font-semibold text-rose-400">
          <AlertCircle className="h-4 w-4" />
          <span>Time Expired! Wrapping up run...</span>
        </div>
      )}

      {currentFlag && !timeExpired && (
        <div className="flex w-full flex-col items-center gap-4">
          <div className="flex aspect-[3/2] w-full items-center justify-center overflow-hidden rounded-2xl bg-tg-secondary-bg p-6 shadow-md ring-1 ring-slate-800">
            <span
              className={`fi fi-${currentFlag.isoCode.toLowerCase()} text-8xl rounded-lg shadow-sm`}
            />
          </div>

          {feedback && (
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              {feedback.correct ? (
                <span className="flex items-center gap-1 text-emerald-400">
                  <Check className="h-3.5 w-3.5" />
                  <span>+{feedback.pointsThisFlag} pts</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-rose-400">
                  <X className="h-3.5 w-3.5" />
                  <span>+0 pts</span>
                </span>
              )}
            </div>
          )}

          <div className="grid w-full grid-cols-2 gap-2.5">
            {currentFlag.choices.map((choice) => {
              const isSelected = selectedChoice === choice;
              let buttonStyle = 'bg-tg-secondary-bg text-tg-text hover:brightness-110';

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
                  className={`flex min-h-14 items-center justify-center rounded-xl p-3 text-center text-sm font-medium transition-all active:scale-95 disabled:pointer-events-none ${buttonStyle}`}
                >
                  <span className="line-clamp-2">{choice}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
