import type { LeaderboardEntry, LeaderboardMeResponse } from '@flagora/shared';

export function shouldShowPinnedMyRank(
  myRank: LeaderboardMeResponse | null,
  topEntries: LeaderboardEntry[],
  currentUserId: number,
): boolean {
  if (!myRank || !myRank.ranked) {
    return false;
  }
  const isAlreadyInTop = topEntries.some((entry) => entry.telegramUserId === currentUserId);
  return !isAlreadyInTop;
}

export function isUnrankedPlayer(myRank: LeaderboardMeResponse | null): boolean {
  return !myRank || !myRank.ranked;
}

export function getRankBadgeClass(rank: number): string {
  if (rank === 1) {
    return 'bg-tg-button text-tg-button-text font-extrabold';
  }
  if (rank === 2) {
    return 'bg-tg-button/20 text-tg-button font-bold';
  }
  if (rank === 3) {
    return 'bg-tg-button/10 text-tg-button font-bold';
  }
  return 'bg-tg-bg text-tg-hint';
}
