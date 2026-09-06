import type { FlagTier } from './flags.js';
import type { FinishRunResponse } from './scoring.js';
import type { LeaderboardEntry, LeaderboardMeResponse } from './leaderboard.js';

export interface DailyChallengeFlagItem {
  flagIndex: number;
  isoCode: string;
  name: string;
  tier: FlagTier;
  choices: string[];
}

export interface DailyChallengeDefinition {
  date: string;
  flags: DailyChallengeFlagItem[];
  createdAt: Date;
}

export interface DailyChallengeStatusResponse {
  date: string;
  attempted: boolean;
  runId: string | null;
  status: 'not_attempted' | 'in_progress' | 'finished' | 'expired';
  result: FinishRunResponse | null;
}

export interface DailyLeaderboardResponse {
  date: string;
  top: LeaderboardEntry[];
  me: LeaderboardMeResponse;
}
