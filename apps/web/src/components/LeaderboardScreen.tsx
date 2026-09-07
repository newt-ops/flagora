import { useState } from 'react';
import { Trophy, ArrowLeft, Play, Sparkles } from 'lucide-react';
import { useLeaderboard } from '../hooks/useLeaderboard.js';
import {
  shouldShowPinnedMyRank,
  isUnrankedPlayer,
  getRankBadgeClass,
} from './leaderboardHelpers.js';
import {
  getLeaderboardTitle,
  getLeaderboardSubtitle,
} from './dailyChallengeHelpers.js';
import type { LeaderboardEntry } from '@flagora/shared';

interface LeaderboardScreenProps {
  sessionToken: string;
  currentUserId: number;
  initialMode?: 'global' | 'daily';
  onBack: () => void;
  onPlay?: () => void;
  onPlayDaily?: () => void;
  isStarting?: boolean;
  dailyAttempted?: boolean;
}

export function LeaderboardScreen({
  sessionToken,
  currentUserId,
  initialMode = 'global',
  onBack,
  onPlay,
  onPlayDaily,
  isStarting = false,
  dailyAttempted = false,
}: LeaderboardScreenProps) {
  const [mode, setMode] = useState<'global' | 'daily'>(initialMode);
  const { topEntries, myRank, isLoading, error, refetch } = useLeaderboard(sessionToken, mode);

  const showPinnedRow = shouldShowPinnedMyRank(myRank, topEntries, currentUserId);
  const isUnranked = isUnrankedPlayer(myRank);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4 text-tg-text">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-tg-secondary-bg text-tg-hint transition-colors hover:text-tg-text active:scale-95"
          aria-label="Back to Profile"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-400" />
          <h1 className="text-lg font-bold text-tg-text">{getLeaderboardTitle(mode)}</h1>
        </div>

        <div className="h-10 w-10" />
      </div>

      <div className="flex rounded-xl bg-tg-secondary-bg p-1">
        <button
          type="button"
          onClick={() => setMode('global')}
          className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
            mode === 'global'
              ? 'bg-tg-bg text-tg-text shadow-sm ring-1 ring-slate-800'
              : 'text-tg-hint hover:text-tg-text'
          }`}
        >
          Global
        </button>
        <button
          type="button"
          onClick={() => setMode('daily')}
          className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
            mode === 'daily'
              ? 'bg-tg-bg text-tg-text shadow-sm ring-1 ring-slate-800'
              : 'text-tg-hint hover:text-tg-text'
          }`}
        >
          Daily Challenge
        </button>
      </div>

      <p className="text-center text-xs text-tg-hint">
        {getLeaderboardSubtitle(mode)}
      </p>

      {isLoading && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-tg-secondary-bg p-8 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-tg-button border-t-transparent" />
          <p className="text-xs font-medium text-tg-hint">Loading leaderboard...</p>
        </div>
      )}

      {!isLoading && error && (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-tg-secondary-bg p-6 text-center">
          <p className="text-sm font-semibold text-rose-400">{error}</p>
          <button
            type="button"
            onClick={refetch}
            className="rounded-xl bg-tg-bg px-4 py-2 text-xs font-bold text-tg-text transition-colors hover:bg-slate-800"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !error && (
        <>
          <div className="flex flex-col gap-2 overflow-hidden rounded-2xl bg-tg-secondary-bg p-3 shadow-md ring-1 ring-slate-800">
            {topEntries.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <Trophy className="h-8 w-8 text-tg-hint" />
                <p className="text-sm font-semibold text-tg-text">No scores recorded yet</p>
                <p className="text-xs text-tg-hint">
                  {mode === 'daily'
                    ? 'Be the first player to complete today’s challenge!'
                    : 'Be the first player to rank on Flagora!'}
                </p>
              </div>
            ) : (
              topEntries.map((entry: LeaderboardEntry) => {
                const isMe = entry.telegramUserId === currentUserId;
                const initial = entry.displayName.replace(/^@/, '').charAt(0).toUpperCase() || 'P';

                return (
                  <div
                    key={entry.telegramUserId}
                    className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors ${
                      isMe
                        ? 'bg-tg-button/15 ring-1 ring-tg-button'
                        : 'bg-tg-bg'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold ${getRankBadgeClass(
                          entry.rank,
                        )}`}
                      >
                        #{entry.rank}
                      </div>

                      {entry.photoUrl ? (
                        <img
                          src={entry.photoUrl}
                          alt={entry.displayName}
                          className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-slate-700"
                        />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tg-button text-xs font-bold text-tg-button-text">
                          {initial}
                        </div>
                      )}

                      <div className="flex flex-col overflow-hidden text-left">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          <span className="truncate text-sm font-semibold text-tg-text">
                            {entry.displayName}
                          </span>
                          {isMe && (
                            <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.2 text-[10px] font-bold text-emerald-400">
                              You
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <span className="text-sm font-extrabold text-tg-text">
                        {entry.bestScore.toLocaleString()}
                      </span>
                      <span className="ml-1 text-xs text-tg-hint">pts</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {showPinnedRow && myRank && (
            <div className="flex items-center justify-between rounded-2xl bg-tg-secondary-bg p-3.5 shadow-md ring-1 ring-amber-500/40">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-xs font-extrabold text-amber-400 ring-1 ring-amber-500/30">
                  #{myRank.rank}
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold text-tg-text">Your Standing</p>
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.2 text-[10px] font-bold text-emerald-400">
                      You
                    </span>
                  </div>
                  <p className="text-xs text-tg-hint">Outside top 50</p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-sm font-extrabold text-tg-text">
                  {myRank.bestScore.toLocaleString()}
                </span>
                <span className="ml-1 text-xs text-tg-hint">pts</span>
              </div>
            </div>
          )}

          {isUnranked && (
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-tg-secondary-bg p-4 text-center ring-1 ring-slate-800">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                <Sparkles className="h-4 w-4 text-amber-400" />
                <span>{mode === 'daily' ? 'Not Ranked Today' : 'Not Ranked Yet'}</span>
              </div>
              <p className="text-xs text-tg-hint">
                {mode === 'daily'
                  ? dailyAttempted
                    ? 'You have already completed today’s challenge.'
                    : 'Complete today’s daily challenge to record your score on the daily leaderboard!'
                  : 'Play a run to record your score and claim your position on the leaderboard!'}
              </p>
              {mode === 'daily' && !dailyAttempted && onPlayDaily && (
                <button
                  type="button"
                  onClick={onPlayDaily}
                  disabled={isStarting}
                  className="mt-1 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-tg-button font-bold text-tg-button-text transition-transform hover:opacity-90 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                >
                  <Play className={`h-4 w-4 fill-current ${isStarting ? 'animate-spin' : ''}`} />
                  <span>{isStarting ? 'Starting Challenge...' : 'Play Daily Challenge'}</span>
                </button>
              )}
              {mode === 'global' && onPlay && (
                <button
                  type="button"
                  onClick={onPlay}
                  disabled={isStarting}
                  className="mt-1 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-tg-button font-bold text-tg-button-text transition-transform hover:opacity-90 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                >
                  <Play className={`h-4 w-4 fill-current ${isStarting ? 'animate-spin' : ''}`} />
                  <span>{isStarting ? 'Starting Run...' : 'Play to Rank'}</span>
                </button>
              )}
            </div>
          )}
        </>
      )}

      <button
        type="button"
        onClick={onBack}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-tg-secondary-bg font-semibold text-tg-hint transition-colors hover:text-tg-text active:scale-95"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to Profile</span>
      </button>
    </div>
  );
}
