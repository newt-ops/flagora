import {
  Trophy,
  CheckCircle2,
  Clock,
  Zap,
  Plus,
  RotateCcw,
  User,
  Sparkles,
  Coins,
  Flame,
  Share2,
} from 'lucide-react';
import type { FinishRunResponse } from '@flagora/shared';
import { getStreakBadgeText } from './streakDisplayHelpers.js';
import {
  shouldShowPlayAgain,
  shouldShowDailyLeaderboardButton,
} from './dailyChallengeHelpers.js';

interface ResultsScreenProps {
  result: FinishRunResponse;
  mode?: 'practice' | 'daily' | 'challenge';
  onPlayAgain?: () => void;
  onBackToProfile: () => void;
  onViewLeaderboard?: () => void;
  onShareChallenge?: () => void;
  isStartingAgain?: boolean;
}

export function ResultsScreen({
  result,
  mode = 'practice',
  onPlayAgain,
  onBackToProfile,
  onViewLeaderboard,
  onShareChallenge,
  isStartingAgain = false,
}: ResultsScreenProps) {
  const timeSeconds = (result.timeUsedMs / 1000).toFixed(1);
  const streakBadgeText = getStreakBadgeText(result.streakChange, result.currentStreak);
  const isDaily = mode === 'daily';
  const isChallenge = mode === 'challenge';
  const showPlayAgain = shouldShowPlayAgain(mode);
  const showDailyLb = shouldShowDailyLeaderboardButton(mode);

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4 text-tg-text">
      {result.leveledUp && (
        <div className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500/15 p-3.5 text-sm font-bold text-amber-300 ring-1 ring-amber-500/30">
          <Sparkles className="h-4 w-4 text-amber-400" />
          <span>Level Up! You reached Level {result.newLevel}</span>
        </div>
      )}

      <div className="flex w-full flex-col items-center rounded-2xl bg-tg-section border border-tg-separator p-6 text-center shadow-sm">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20">
          <Trophy className="h-8 w-8" />
        </div>

        <h2 className="mt-4 text-xs font-semibold uppercase tracking-wider text-tg-hint">
          {isDaily ? 'Daily Challenge Completed' : isChallenge ? 'Challenge Created' : 'Run Completed'}
        </h2>

        <div className="mt-1 flex items-baseline justify-center gap-1">
          <span className="text-4xl font-extrabold tracking-tight text-tg-text">
            {result.totalScore.toLocaleString()}
          </span>
          <span className="text-sm font-semibold text-tg-hint">pts</span>
        </div>

        {isChallenge && (
          <div className="mt-3 rounded-xl bg-indigo-500/15 px-4 py-2 text-sm font-bold text-indigo-300 border border-indigo-500/30">
            Beat my score: {result.totalScore.toLocaleString()} points!
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
          {!isDaily && !isChallenge && result.isNewBest && (
            <div className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-3 py-0.5 text-xs font-bold text-emerald-400 border border-emerald-500/30">
              <Sparkles className="h-3 w-3" />
              <span>New Best!</span>
            </div>
          )}

          {streakBadgeText && (
            <div className="inline-flex items-center gap-1 rounded-full bg-orange-500/20 px-3 py-0.5 text-xs font-bold text-orange-400 border border-orange-500/30">
              <Flame className="h-3 w-3 fill-current" />
              <span>{streakBadgeText}</span>
            </div>
          )}
        </div>

        <div className="mt-6 grid w-full grid-cols-2 gap-2.5">
          <div className="flex flex-col items-center rounded-xl bg-tg-secondary-bg border border-tg-separator p-3">
            <div className="flex items-center gap-1 text-xs text-tg-hint">
              <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
              <span>XP Earned</span>
            </div>
            <p className="mt-1 text-lg font-bold text-tg-text">+{result.xpEarned}</p>
          </div>

          <div className="flex flex-col items-center rounded-xl bg-tg-secondary-bg border border-tg-separator p-3">
            <div className="flex items-center gap-1 text-xs text-tg-hint">
              <Coins className="h-3.5 w-3.5 text-amber-400" />
              <span>Coins</span>
            </div>
            <p className="mt-1 text-lg font-bold text-tg-text">+{result.coinsEarned}</p>
          </div>

          <div className="flex flex-col items-center rounded-xl bg-tg-secondary-bg border border-tg-separator p-3">
            <div className="flex items-center gap-1 text-xs text-tg-hint">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span>Correct</span>
            </div>
            <p className="mt-1 text-lg font-bold text-tg-text">{result.correctCount} / 10</p>
          </div>

          <div className="flex flex-col items-center rounded-xl bg-tg-secondary-bg border border-tg-separator p-3">
            <div className="flex items-center gap-1 text-xs text-tg-hint">
              <Clock className="h-3.5 w-3.5 text-sky-400" />
              <span>Time Used</span>
            </div>
            <p className="mt-1 text-lg font-bold text-tg-text">{timeSeconds}s</p>
          </div>

          <div className="flex flex-col items-center rounded-xl bg-tg-secondary-bg border border-tg-separator p-3">
            <div className="flex items-center gap-1 text-xs text-tg-hint">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              <span>Max Combo</span>
            </div>
            <p className="mt-1 text-lg font-bold text-tg-text">{result.maxCombo}</p>
          </div>

          <div className="flex flex-col items-center rounded-xl bg-tg-secondary-bg border border-tg-separator p-3">
            <div className="flex items-center gap-1 text-xs text-tg-hint">
              <Plus className="h-3.5 w-3.5 text-indigo-400" />
              <span>Time Bonus</span>
            </div>
            <p className="mt-1 text-lg font-bold text-tg-text">+{result.leftoverBonus}</p>
          </div>
        </div>
      </div>

      <div className="flex w-full flex-col gap-2.5">
        {isChallenge && onShareChallenge && (
          <button
            type="button"
            onClick={onShareChallenge}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 font-bold text-white shadow-sm transition-opacity hover:bg-indigo-500 active:opacity-75"
          >
            <Share2 className="h-4 w-4" />
            <span>Share Challenge</span>
          </button>
        )}

        {showDailyLb && onViewLeaderboard && (
          <button
            type="button"
            onClick={onViewLeaderboard}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-500/15 font-bold text-amber-400 border border-amber-500/30 transition-opacity hover:opacity-90 active:opacity-75"
          >
            <Trophy className="h-4 w-4 text-amber-400" />
            <span>View Daily Leaderboard</span>
          </button>
        )}

        {!isDaily && !isChallenge && result.isNewBest && onViewLeaderboard && (
          <button
            type="button"
            onClick={onViewLeaderboard}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-500/15 font-bold text-amber-400 border border-amber-500/30 transition-opacity hover:opacity-90 active:opacity-75"
          >
            <Trophy className="h-4 w-4 text-amber-400" />
            <span>Check Your New Rank</span>
          </button>
        )}

        {showPlayAgain && onPlayAgain && (
          <button
            type="button"
            onClick={onPlayAgain}
            disabled={isStartingAgain}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tg-button font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75 disabled:pointer-events-none disabled:opacity-50"
          >
            <RotateCcw className={`h-4 w-4 ${isStartingAgain ? 'animate-spin' : ''}`} />
            <span>{isStartingAgain ? 'Loading Next Run...' : 'Play Again'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onBackToProfile}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tg-section border border-tg-separator font-semibold text-tg-hint transition-colors hover:text-tg-text active:opacity-75"
        >
          <User className="h-4 w-4" />
          <span>Back to Profile</span>
        </button>
      </div>
    </div>
  );
}
