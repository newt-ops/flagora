import { Play, Flame } from 'lucide-react';
import { type PlayerProfile, getDisplayName } from '@flagora/shared';
import { getProfileStreakDisplay } from './streakDisplayHelpers.js';

export { getDisplayName };

interface ProfileCardProps {
  profile: PlayerProfile;
  onPlay?: () => void;
  isStarting?: boolean;
}

export function ProfileCard({ profile, onPlay, isStarting = false }: ProfileCardProps) {
  const displayName = getDisplayName(profile);
  const initial = profile.firstName ? profile.firstName.charAt(0).toUpperCase() : 'P';
  const streakInfo = getProfileStreakDisplay(profile.currentStreak, profile.longestStreak);

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

      {onPlay && (
        <button
          type="button"
          onClick={onPlay}
          disabled={isStarting}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tg-button font-bold text-tg-button-text shadow-md transition-transform hover:opacity-90 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
        >
          <Play className={`h-4 w-4 fill-current ${isStarting ? 'animate-spin' : ''}`} />
          <span>{isStarting ? 'Starting Run...' : 'Play Flagora'}</span>
        </button>
      )}
    </div>
  );
}
