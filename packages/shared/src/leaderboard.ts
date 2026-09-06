export interface LeaderboardEntry {
  rank: number;
  telegramUserId: number;
  displayName: string;
  photoUrl: string | null;
  bestScore: number;
}

export interface LeaderboardMeResponse {
  ranked: boolean;
  rank: number | null;
  bestScore: number;
}
