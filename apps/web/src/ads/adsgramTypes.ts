import type {
  BonusCoinsRedeemSuccessResponse,
  StreakSaveRedeemSuccessResponse,
} from '@flagora/shared';

export type RewardType = 'bonus-coins' | 'streak-save';

export interface ShowPromiseResult {
  done: boolean;
  description: string;
  state: string;
  error: boolean;
}

export type AdsgramEvent =
  | 'onReward'
  | 'onSkip'
  | 'onError'
  | 'onBannerNotFound'
  | 'onStart'
  | string;

export interface AdsgramController {
  show(): Promise<ShowPromiseResult>;
  addEventListener?(event: AdsgramEvent, handler: (data?: unknown) => void): void;
  removeEventListener?(event: AdsgramEvent, handler: (data?: unknown) => void): void;
  destroy?(): void;
}

export interface AdsgramInitOptions {
  blockId: string;
  debug?: boolean;
  debugBannerType?: string;
  debugConsole?: boolean;
}

export type AdOutcome =
  | {
      status: 'rewarded';
      rewardType: 'bonus-coins';
      data: BonusCoinsRedeemSuccessResponse;
    }
  | {
      status: 'rewarded';
      rewardType: 'streak-save';
      data: StreakSaveRedeemSuccessResponse;
    }
  | {
      status: 'cap_reached';
      rewardType: RewardType;
      dailyCap: number;
      usedCount: number;
      resetAtUtc?: string;
      message: string;
    }
  | {
      status: 'not_at_risk';
      rewardType: 'streak-save';
      message: string;
    }
  | {
      status: 'unavailable';
      rewardType: RewardType;
      message: string;
      reason?: string;
    }
  | {
      status: 'skipped';
      rewardType: RewardType;
      message: string;
    }
  | {
      status: 'error';
      rewardType: RewardType;
      message: string;
      error?: unknown;
    };

export interface ShowRewardedAdOptions {
  controller?: AdsgramController;
  blockId?: string;
  debug?: boolean;
}
