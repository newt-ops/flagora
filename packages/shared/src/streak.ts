export type StreakChange = 'incremented' | 'reset' | 'unchanged';

export interface StreakCalculationResult {
  currentStreak: number;
  longestStreak: number;
  streakChange: StreakChange;
}

export function getUtcDateString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function getDaysDifference(dateStrA: string, dateStrB: string): number {
  const [yA, mA, dA] = dateStrA.split('-').map(Number);
  const [yB, mB, dB] = dateStrB.split('-').map(Number);
  const utcA = Date.UTC(yA, mA - 1, dA);
  const utcB = Date.UTC(yB, mB - 1, dB);
  const msPerDay = 86_400_000;
  return Math.round((utcB - utcA) / msPerDay);
}

export function calculateStreak(
  lastPlayedDate: string | null,
  currentStreak: number,
  longestStreak: number,
  todayStr: string,
): StreakCalculationResult {
  if (!lastPlayedDate) {
    const nextCurrent = 1;
    return {
      currentStreak: nextCurrent,
      longestStreak: Math.max(longestStreak, nextCurrent),
      streakChange: 'reset',
    };
  }

  const diff = getDaysDifference(lastPlayedDate, todayStr);

  if (diff === 0) {
    const nextCurrent = currentStreak > 0 ? currentStreak : 1;
    return {
      currentStreak: nextCurrent,
      longestStreak: Math.max(longestStreak, nextCurrent),
      streakChange: 'unchanged',
    };
  }

  if (diff === 1) {
    const nextCurrent = (currentStreak > 0 ? currentStreak : 0) + 1;
    return {
      currentStreak: nextCurrent,
      longestStreak: Math.max(longestStreak, nextCurrent),
      streakChange: 'incremented',
    };
  }

  const nextCurrent = 1;
  return {
    currentStreak: nextCurrent,
    longestStreak: Math.max(longestStreak, nextCurrent),
    streakChange: 'reset',
  };
}
