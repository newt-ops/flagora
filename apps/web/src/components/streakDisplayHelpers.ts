import type { StreakChange } from '@flagora/shared';

export function getStreakBadgeText(
  streakChange: StreakChange,
  currentStreak: number,
): string | null {
  if (streakChange === 'incremented') {
    return `Streak extended to ${currentStreak}`;
  }
  if (streakChange === 'reset') {
    return 'Streak started';
  }
  return null;
}

export function getProfileStreakDisplay(
  currentStreak: number,
  longestStreak: number,
): { title: string; subtitle: string; isActive: boolean } {
  const title = currentStreak > 0 ? `${currentStreak} Day Streak` : '0 Day Streak';
  const subtitle =
    longestStreak > 0 ? `Best: ${longestStreak} days` : 'Play daily to build streak';
  const isActive = currentStreak > 0;

  return { title, subtitle, isActive };
}
