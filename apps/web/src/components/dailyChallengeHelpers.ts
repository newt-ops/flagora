import type { DailyChallengeStatusResponse, FinishRunResponse } from '@flagora/shared';

export function isDailyAttempted(status: DailyChallengeStatusResponse | null): boolean {
  return Boolean(status && status.attempted);
}

export function shouldShowPlayAgain(mode?: 'practice' | 'daily'): boolean {
  return mode !== 'daily';
}

export function shouldShowDailyLeaderboardButton(mode?: 'practice' | 'daily'): boolean {
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

export function getLeaderboardTitle(mode: 'global' | 'daily'): string {
  return mode === 'daily' ? 'Daily Leaderboard' : 'Global Leaderboard';
}

export function getLeaderboardSubtitle(mode: 'global' | 'daily'): string {
  return mode === 'daily'
    ? "Ranked by today's challenge score"
    : 'Ranked by all-time best score';
}
