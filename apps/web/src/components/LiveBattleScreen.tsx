import { useState, useEffect, useRef } from 'react';
import { Timer, Zap, Check, X, WifiOff, Loader2, Sparkles, Trophy } from './icons.js';
import {
  calculateComboMultiplier,
  isTier4Flag,
  type BattleStartPayload,
  type OpponentProgressPayload,
  type SubmitAnswerResponse,
  type GroupRankingItem,
} from '@flagora/shared';
import { triggerHaptic } from '../telegram/haptics.js';

interface LiveBattleScreenProps {
  battleStart: BattleStartPayload;
  opponentDisplayName?: string | null;
  opponentProgress: OpponentProgressPayload | null;
  isReconnecting: boolean;
  onSubmitAnswer: (flagIndex: number, selectedIsoCode: string) => Promise<SubmitAnswerResponse>;
  onCheckFinished?: () => void;
  isGroupBattle?: boolean;
  groupRankings?: GroupRankingItem[];
  currentUserId?: number;
}

export function LiveBattleScreen({
  battleStart,
  opponentDisplayName = 'Opponent',
  opponentProgress,
  isReconnecting,
  onSubmitAnswer,
  onCheckFinished,
  isGroupBattle = false,
  groupRankings = [],
  currentUserId,
}: LiveBattleScreenProps) {
  const [currentFlagIndex, setCurrentFlagIndex] = useState(0);
  const [runningScore, setRunningScore] = useState(0);
  const [comboCount, setComboCount] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    pointsThisFlag: number;
    isTier4?: boolean;
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
        const currentFlag = battleStart.flags[currentFlagIndex];
        const isTier4 = Boolean(
          (res as { isTier4?: boolean }).isTier4 ?? (currentFlag ? isTier4Flag(currentFlag.isoCode) : false),
        );
        triggerHaptic(res.correct ? 'success' : 'error');
        setRunningScore(res.runningTotal);
        setComboCount(res.comboCount);
        setFeedback({
          correct: res.correct,
          pointsThisFlag: res.pointsThisFlag,
          isTier4,
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

  // Group rankings calculations
  const myRankItem = currentUserId
    ? groupRankings.find((r) => r.userId === currentUserId)
    : null;
  const myCurrentRank = myRankItem?.rank ?? 1;

  return (
    <div className="relative flex w-full max-w-md mx-auto flex-col items-center gap-4 text-tg-text">
      {isReconnecting && (
        <div
          className="fixed top-[calc(var(--app-safe-top,0px)+0.75rem)] z-50 flex items-center gap-2 rounded-full bg-tg-button/90 px-4 py-1.5 text-xs font-bold text-tg-button-text shadow-lg backdrop-blur-sm"
        >
          <WifiOff className="h-3.5 w-3.5 animate-pulse" />
          <span>Reconnecting to battle...</span>
        </div>
      )}

      {/* Score Header */}
      <div className="flex w-full flex-col gap-2 rounded-2xl bg-tg-section p-3.5 shadow-sm">
        {isGroupBattle ? (
          /* Group Battle Scoreboard */
          <div className="flex flex-col gap-2 border-b border-tg-separator/30 pb-2.5">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-tg-hint">
                  <span>You</span>
                  <span className="text-tg-text">
                    ({Math.min(currentFlagIndex + 1, battleStart.flags.length)}/{battleStart.flags.length})
                  </span>
                  <span className="rounded-full bg-tg-button/15 px-2 py-0.5 text-[10px] font-bold text-tg-button">
                    Rank #{myCurrentRank}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="text-xl font-black text-tg-text">{runningScore}</span>
                  {comboCount > 0 && (
                    <span className="flex items-center gap-1 rounded bg-tg-button/20 px-1.5 py-0.5 text-[10px] font-extrabold text-tg-button">
                      <Zap className="h-2.5 w-2.5" />
                      {comboMultiplier}x
                    </span>
                  )}
                </div>
              </div>

              {/* Group Mini Leaderboard */}
              <div className="flex flex-col items-end">
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-tg-hint">
                  <Trophy className="h-3 w-3 text-amber-400" />
                  Live Leaders
                </span>
                <div className="mt-1 flex items-center gap-2">
                  {groupRankings.slice(0, 3).map((r, i) => {
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
                    const isMe = r.userId === currentUserId;
                    return (
                      <div
                        key={r.userId}
                        className={`flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] ${
                          isMe ? 'bg-tg-button/15 font-bold text-tg-button' : 'bg-tg-secondary-bg text-tg-hint'
                        }`}
                      >
                        <span>{medal}</span>
                        <span className="max-w-[50px] truncate">{r.displayName}</span>
                        <span className="font-bold text-tg-text">{r.score}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* 1v1 Battle Scoreboard */
          <div className="grid grid-cols-2 gap-2 border-b border-tg-separator/30 pb-2.5">
            <div className="flex flex-col">
              <div className="flex items-center gap-1 text-[11px] font-semibold text-tg-hint">
                <span>You</span>
                <span className="text-tg-text">
                  ({Math.min(currentFlagIndex + 1, battleStart.flags.length)}/{battleStart.flags.length})
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-lg font-black text-tg-text">{runningScore}</span>
                {comboCount > 0 && (
                  <span className="flex items-center gap-1 rounded bg-tg-button/20 px-1.5 py-0.5 text-[10px] font-extrabold text-tg-button">
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
                        ? 'bg-tg-button/20 text-tg-button'
                        : 'bg-tg-destructive/15 text-tg-destructive'
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
        )}

        {/* Battle Timer Bar */}
        <div>
          <div className="flex items-center justify-between text-[11px] font-medium text-tg-hint">
            <span className="flex items-center gap-1">
              <Timer className="h-3 w-3" />
              <span>Battle Timer</span>
            </span>
            <span className={timerSeconds <= 10 ? 'font-bold text-tg-destructive' : 'text-tg-text'}>
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
                timerSeconds <= 10 ? 'fill-tg-destructive' : 'fill-tg-button'
              }`}
            />
          </svg>
        </div>
      </div>

      {timeExpired ? (
        <div className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl bg-tg-section p-6 text-center shadow-sm">
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
        <div className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl bg-tg-section p-6 text-center shadow-sm">
          <Check className="h-8 w-8 text-tg-button" />
          <p className="text-sm font-bold text-tg-text">All flags completed!</p>
          <p className="text-xs text-tg-hint">
            {isGroupBattle
              ? 'Waiting for all players to finish or timer to expire...'
              : 'Waiting for opponent or battle tally...'}
          </p>
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
            <div className="flex aspect-[3/2] w-full items-center justify-center overflow-hidden rounded-2xl bg-tg-section p-6 shadow-sm">
              <span
                className={`fi fi-${currentFlag.isoCode.toLowerCase()} text-8xl rounded-lg shadow-sm`}
              />
            </div>

            {feedback && (
              <div className="flex items-center gap-2 text-xs font-semibold">
                {feedback.correct ? (
                  <>
                    <span className="flex items-center gap-1 text-tg-button">
                      <Check className="h-3.5 w-3.5" />
                      <span>+{feedback.pointsThisFlag} pts</span>
                    </span>
                    {feedback.isTier4 && (
                      <span
                        data-testid="tier4-mastery-flourish"
                        className="inline-flex items-center gap-1 rounded-full bg-tg-button/15 px-2 py-0.5 text-[11px] font-bold text-tg-button"
                      >
                        <Sparkles className="h-3 w-3 text-tg-button" />
                        <span>Tier 4 Mastery</span>
                      </span>
                    )}
                  </>
                ) : (
                  <span className="flex items-center gap-1 text-tg-destructive">
                    <X className="h-3.5 w-3.5" />
                    <span>+0 pts</span>
                  </span>
                )}
              </div>
            )}

            <div className="grid w-full grid-cols-2 gap-2.5">
              {currentFlag.choices.map((choice: string) => {
                const isSelected = selectedChoice === choice;
                let buttonStyle = 'bg-tg-section text-tg-text shadow-sm hover:opacity-90';

                if (isSelected) {
                  if (feedback) {
                    buttonStyle = feedback.correct
                      ? 'bg-tg-button text-tg-button-text font-bold'
                      : 'bg-tg-destructive text-tg-button-text font-bold';
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
