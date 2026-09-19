export const BONUS_PINS_REWARD_AMOUNT = 50;
export const BONUS_PINS_DAILY_CAP = 5;

export interface BonusPinsIntentSuccessResponse {
  ok: true;
  token: string;
  rewardType: 'bonus-pins';
  dailyCap: number;
  pins: number;
}

export interface BonusPinsIntentCapReachedResponse {
  ok: false;
  error: string;
  message: string;
  dailyCap: number;
  usedCount: number;
  resetAtUtc: string;
}

export type BonusPinsIntentResponse =
  | BonusPinsIntentSuccessResponse
  | BonusPinsIntentCapReachedResponse;

export interface BonusPinsRedeemRequest {
  token: string;
}

export interface BonusPinsRedeemSuccessResponse {
  ok: true;
  pinsEarned: number;
  pins: number;
  telegramUserId: number;
}

export interface BonusPinsRedeemErrorResponse {
  error: string;
  message: string;
}

export interface StreakStatusResponse {
  isAtRisk: boolean;
  currentStreak: number;
  longestStreak: number;
  lastPlayedDate: string | null;
}

export interface StreakSaveIntentSuccessResponse {
  ok: true;
  token: string;
  rewardType: 'streak-save';
  dailyCap: number;
  currentStreak: number;
  longestStreak: number;
}

export interface StreakSaveRedeemRequest {
  token: string;
}

export interface StreakSaveRedeemSuccessResponse {
  ok: true;
  saved: true;
  lastPlayedDate: string;
  currentStreak: number;
  longestStreak: number;
  telegramUserId: number;
}
