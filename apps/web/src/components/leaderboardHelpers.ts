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
    return 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30';
  }
  if (rank === 2) {
    return 'bg-slate-300/20 text-slate-200 ring-1 ring-slate-300/30';
  }
  if (rank === 3) {
    return 'bg-amber-700/20 text-amber-500 ring-1 ring-amber-700/30';
  }
  return 'bg-tg-bg text-tg-hint';
}
