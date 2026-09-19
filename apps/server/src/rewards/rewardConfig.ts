import { BONUS_PINS_REWARD_AMOUNT, BONUS_PINS_DAILY_CAP } from '@flagora/shared';

export { BONUS_PINS_REWARD_AMOUNT, BONUS_PINS_DAILY_CAP };

export type RewardType = 'bonus-pins' | 'streak-save';

export interface RewardTypeConfig {
  dailyCap: number;
  rewardPins?: number;
}

export const REWARD_CONFIG: Record<RewardType, RewardTypeConfig> = {
  'bonus-pins': {
    dailyCap: BONUS_PINS_DAILY_CAP,
    rewardPins: BONUS_PINS_REWARD_AMOUNT,
  },
  'streak-save': {
    dailyCap: 1,
  },
} as const;

export function isRewardType(value: string): value is RewardType {
  return Object.prototype.hasOwnProperty.call(REWARD_CONFIG, value);
}

export function getRewardConfig(rewardType: string): RewardTypeConfig | null {
  if (isRewardType(rewardType)) {
    return REWARD_CONFIG[rewardType];
  }
  return null;
}

export function getRewardResetAtUtc(now: Date = new Date()): string {
  const nextDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0),
  );
  return nextDay.toISOString();
}
