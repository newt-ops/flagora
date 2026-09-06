import type { PlayerProfile } from '@flagora/shared';

export function getDisplayName(profile: {
  username?: string | null;
  firstName: string;
  lastName?: string | null;
}): string {
  if (profile.username && profile.username.trim() !== '') {
    return `@${profile.username.replace(/^@/, '')}`;
  }
  if (profile.lastName && profile.lastName.trim() !== '') {
    return `${profile.firstName} ${profile.lastName.trim().charAt(0).toUpperCase()}.`;
  }
  return profile.firstName;
}

interface ProfileCardProps {
  profile: PlayerProfile;
}

export function ProfileCard({ profile }: ProfileCardProps) {
  const displayName = getDisplayName(profile);
  const initial = profile.firstName ? profile.firstName.charAt(0).toUpperCase() : 'P';

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

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-tg-bg p-3 text-center">
          <p className="text-xs text-tg-hint">Coins</p>
          <p className="mt-1 text-lg font-bold text-tg-text">{profile.coins}</p>
        </div>
        <div className="rounded-xl bg-tg-bg p-3 text-center">
          <p className="text-xs text-tg-hint">XP</p>
          <p className="mt-1 text-lg font-bold text-tg-text">{profile.xp}</p>
        </div>
        <div className="rounded-xl bg-tg-bg p-3 text-center">
          <p className="text-xs text-tg-hint">Current Streak</p>
          <p className="mt-1 text-lg font-bold text-tg-text">{profile.currentStreak}</p>
        </div>
        <div className="rounded-xl bg-tg-bg p-3 text-center">
          <p className="text-xs text-tg-hint">Longest Streak</p>
          <p className="mt-1 text-lg font-bold text-tg-text">{profile.longestStreak}</p>
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-tg-bg p-3 text-center">
        <p className="text-xs text-tg-hint">Games Played</p>
        <p className="mt-1 text-lg font-bold text-tg-text">{profile.gamesPlayed}</p>
      </div>
    </div>
  );
}
