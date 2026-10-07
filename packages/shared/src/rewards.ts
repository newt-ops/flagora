export const STREAK_SAVE_PIN_COST = 50;

export interface StreakStatusResponse {
  isAtRisk: boolean;
  currentStreak: number;
  longestStreak: number;
  lastPlayedDate: string | null;
}

export interface StreakSaveSuccessResponse {
  ok: true;
  saved: true;
  pinsDeducted: number;
  pins: number;
  currentStreak: number;
  longestStreak: number;
  lastPlayedDate: string;
  telegramUserId: number;
}

export interface StreakSaveErrorResponse {
  error: string;
  message: string;
}
