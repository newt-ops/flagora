export const BONUS_COINS_REWARD_AMOUNT = 50;
export const BONUS_COINS_DAILY_CAP = 5;

export interface BonusCoinsIntentSuccessResponse {
  ok: true;
  token: string;
  rewardType: 'bonus-coins';
  dailyCap: number;
  coins: number;
}

export interface BonusCoinsIntentCapReachedResponse {
  ok: false;
  error: string;
  message: string;
  dailyCap: number;
  usedCount: number;
  resetAtUtc: string;
}

export type BonusCoinsIntentResponse =
  | BonusCoinsIntentSuccessResponse
  | BonusCoinsIntentCapReachedResponse;

export interface BonusCoinsRedeemRequest {
  token: string;
}

export interface BonusCoinsRedeemSuccessResponse {
  ok: true;
  coinsEarned: number;
  coins: number;
  telegramUserId: number;
}

export interface BonusCoinsRedeemErrorResponse {
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
