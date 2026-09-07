import { Play, Flame, Trophy, Calendar, CheckCircle2, Swords, Zap } from 'lucide-react';
import { type PlayerProfile, type DailyChallengeStatusResponse, getDisplayName } from '@flagora/shared';
import { getProfileStreakDisplay } from './streakDisplayHelpers.js';
import { getDailyResultSummary } from './dailyChallengeHelpers.js';

export { getDisplayName };

interface ProfileCardProps {
  profile: PlayerProfile;
  dailyStatus?: DailyChallengeStatusResponse | null;
  onPlay?: () => void;
  onStartDaily?: () => void;
  onChallengeFriend?: () => void;
  onBattleFriend?: () => void;
  onViewLeaderboard?: () => void;
  onViewDailyLeaderboard?: () => void;
  isStarting?: boolean;
  isStartingDaily?: boolean;
  isStartingChallenge?: boolean;
  isStartingBattle?: boolean;
}

export function ProfileCard({
  profile,
  dailyStatus,
  onPlay,
  onStartDaily,
  onChallengeFriend,
  onBattleFriend,
  onViewLeaderboard,
  onViewDailyLeaderboard,
  isStarting = false,
  isStartingDaily = false,
  isStartingChallenge = false,
  isStartingBattle = false,
}: ProfileCardProps) {
  const displayName = getDisplayName(profile);
  const initial = profile.firstName ? profile.firstName.charAt(0).toUpperCase() : 'P';
  const streakInfo = getProfileStreakDisplay(profile.currentStreak, profile.longestStreak);
  const dailySummary = getDailyResultSummary(dailyStatus?.result ?? null);

  return (
    <div className="w-full max-w-sm rounded-2xl bg-tg-secondary-bg p-6 text-tg-text">
      <div className="flex flex-col items-center text-center">
        {profile.photoUrl ? (
          <img
            src={profile.photoUrl}
            alt={displayName}
            className="h-20 w-20 rounded-full object-cover ring-2 ring-tg-button"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-tg-button text-3xl font-semibold text-tg-button-text">
            {initial}
          </div>
        )}

        <h2 className="mt-4 text-xl font-bold text-tg-text">{displayName}</h2>
        <p className="mt-0.5 text-xs text-tg-hint">Level {profile.level} Player</p>
      </div>

      <div className="mt-5 flex items-center justify-between rounded-xl bg-tg-bg px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20">
            <Flame className="h-5 w-5 fill-current text-orange-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-tg-text">{streakInfo.title}</p>
            <p className="text-xs text-tg-hint">{streakInfo.subtitle}</p>
          </div>
        </div>
        {streakInfo.isActive && (
          <span className="rounded-full bg-orange-500/20 px-2.5 py-0.5 text-xs font-semibold text-orange-400 ring-1 ring-orange-500/30">
            Active
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-tg-bg p-3 text-center">
          <p className="text-xs text-tg-hint">Coins</p>
          <p className="mt-1 text-lg font-bold text-tg-text">{profile.coins}</p>
        </div>
        <div className="rounded-xl bg-tg-bg p-3 text-center">
          <p className="text-xs text-tg-hint">XP</p>
          <p className="mt-1 text-lg font-bold text-tg-text">{profile.xp}</p>
        </div>
        <div className="rounded-xl bg-tg-bg p-3 text-center">
          <p className="text-xs text-tg-hint">Best Score</p>
          <p className="mt-1 text-lg font-bold text-tg-text">{profile.bestScore}</p>
        </div>
        <div className="rounded-xl bg-tg-bg p-3 text-center">
          <p className="text-xs text-tg-hint">Games Played</p>
          <p className="mt-1 text-lg font-bold text-tg-text">{profile.gamesPlayed}</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-tg-bg p-4 ring-1 ring-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20">
              <Calendar className="h-4 w-4" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-tg-text">Daily Challenge</p>
              <p className="text-[11px] text-tg-hint">Same 10 flags for all players</p>
            </div>
          </div>
          {dailyStatus?.attempted ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-bold text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              Completed
            </span>
          ) : (
            <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-400">
              Available
            </span>
          )}
        </div>

        {dailyStatus?.attempted ? (
          <div className="mt-3 flex flex-col gap-2.5">
            {dailySummary ? (
              <div className="flex items-center justify-between rounded-lg bg-tg-secondary-bg px-3 py-2 text-xs">
                <div>
                  <span className="font-extrabold text-tg-text">{dailySummary.scoreText}</span>
                  <span className="ml-2 text-tg-hint">{dailySummary.correctText}</span>
                </div>
                <span className="text-tg-hint">{dailySummary.timeText}</span>
              </div>
            ) : (
              <p className="text-xs text-tg-hint">Completed today</p>
            )}

            {onViewDailyLeaderboard && (
              <button
                type="button"
                onClick={onViewDailyLeaderboard}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-amber-500/15 font-bold text-amber-300 ring-1 ring-amber-500/30 transition-transform hover:opacity-90 active:scale-95"
              >
                <Trophy className="h-4 w-4 text-amber-400" />
                <span>View Daily Leaderboard</span>
              </button>
            )}
          </div>
        ) : (
          <div className="mt-3">
            {onStartDaily && (
              <button
                type="button"
                onClick={onStartDaily}
                disabled={isStartingDaily}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-amber-500 font-bold text-slate-950 shadow transition-transform hover:bg-amber-400 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
              >
                <Play className={`h-3.5 w-3.5 fill-current ${isStartingDaily ? 'animate-spin' : ''}`} />
                <span>{isStartingDaily ? 'Starting Challenge...' : 'Play Daily Challenge'}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {onPlay && (
        <button
          type="button"
          onClick={onPlay}
          disabled={isStarting}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tg-button font-bold text-tg-button-text shadow-md transition-transform hover:opacity-90 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
        >
          <Play className={`h-4 w-4 fill-current ${isStarting ? 'animate-spin' : ''}`} />
          <span>{isStarting ? 'Starting Run...' : 'Play Practice'}</span>
        </button>
      )}

      {onChallengeFriend && (
        <button
          type="button"
          onClick={onChallengeFriend}
          disabled={isStartingChallenge}
          className="mt-2.5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 font-bold text-white shadow-md transition-transform hover:bg-indigo-500 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
        >
          <Swords className={`h-4 w-4 ${isStartingChallenge ? 'animate-spin' : ''}`} />
          <span>{isStartingChallenge ? 'Creating Challenge...' : 'Challenge a Friend'}</span>
        </button>
      )}

      {onBattleFriend && (
        <button
          type="button"
          onClick={onBattleFriend}
          disabled={isStartingBattle}
          className="mt-2.5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 font-bold text-white shadow-md transition-transform hover:bg-violet-500 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
        >
          <Zap className={`h-4 w-4 ${isStartingBattle ? 'animate-spin' : ''}`} />
          <span>{isStartingBattle ? 'Creating Battle...' : 'Battle a Friend'}</span>
        </button>
      )}

      {onViewLeaderboard && (
        <button
          type="button"
          onClick={onViewLeaderboard}
          className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-tg-bg font-semibold text-tg-hint transition-colors hover:text-tg-text active:scale-95"
        >
          <Trophy className="h-4 w-4 text-amber-400" />
          <span>Global Leaderboard</span>
        </button>
      )}
    </div>
  );
}
