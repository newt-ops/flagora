import type { DailyChallengeStatusResponse, FinishRunResponse } from '@flagora/shared';
import { formatSeasonName } from './rankHelpers.js';

export function isDailyAttempted(status: DailyChallengeStatusResponse | null): boolean {
  return Boolean(status && status.attempted);
}

export function shouldShowPlayAgain(mode?: 'practice' | 'daily' | 'challenge' | 'custom'): boolean {
  return mode === 'practice' || mode === 'custom' || mode === undefined;
}

export function shouldShowDailyLeaderboardButton(mode?: 'practice' | 'daily' | 'challenge' | 'custom'): boolean {
  return mode === 'daily';
}

export function getDailyResultSummary(result: FinishRunResponse | null): {
  scoreText: string;
  correctText: string;
  timeText: string;
} | null {
  if (!result) {
    return null;
  }
  const timeSeconds = (result.timeUsedMs / 1000).toFixed(1);
  return {
    scoreText: `${result.totalScore.toLocaleString()} pts`,
    correctText: `${result.correctCount}/10 correct`,
    timeText: `${timeSeconds}s`,
  };
}

export function getLeaderboardTitle(mode: 'global' | 'daily' | 'ranked'): string {
  if (mode === 'daily') {
    return 'Daily Leaderboard';
  }
  if (mode === 'ranked') {
    return 'Ranked Ladder';
  }
  return 'Global Leaderboard';
}

export function getLeaderboardSubtitle(mode: 'global' | 'daily' | 'ranked', season?: string | null): string {
  if (mode === 'daily') {
    return "Ranked by today's challenge score";
  }
  if (mode === 'ranked') {
    const formatted = formatSeasonName(season);
    return `${formatted} Season • Ranked by Battle Rating`;
  }
  return 'Ranked by all-time best score';
}
