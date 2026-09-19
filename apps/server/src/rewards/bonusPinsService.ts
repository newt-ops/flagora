import type { Db } from 'mongodb';
import {
  type PlayerProfile,
  type BonusPinsIntentSuccessResponse,
  type BonusPinsRedeemSuccessResponse,
  BONUS_PINS_REWARD_AMOUNT,
  BONUS_PINS_DAILY_CAP,
} from '@flagora/shared';
import {
  issueRewardToken,
  redeemRewardToken,
  verifyRewardToken,
  type RewardTokenServiceOptions,
} from './rewardTokenService.js';
import { UnauthorizedTokenRedemptionError } from './rewardErrors.js';
import { notifyPublicRewardPayout } from '../telegram/telegramService.js';

export async function requestBonusPinsIntent(
  telegramUserId: number,
  options?: RewardTokenServiceOptions,
): Promise<BonusPinsIntentSuccessResponse> {
  const token = await issueRewardToken(telegramUserId, 'bonus-pins', options);
  return {
    ok: true,
    token,
    rewardType: 'bonus-pins',
    dailyCap: BONUS_PINS_DAILY_CAP,
    pins: BONUS_PINS_REWARD_AMOUNT,
  };
}

export async function redeemBonusPins(
  token: string,
  callerUserId: number,
  db: Db,
  options?: RewardTokenServiceOptions,
): Promise<BonusPinsRedeemSuccessResponse> {
  const preview = verifyRewardToken(token, options);
  if (preview.telegramUserId !== callerUserId) {
    throw new UnauthorizedTokenRedemptionError();
  }

  const verified = await redeemRewardToken(token, 'bonus-pins', options);

  if (verified.telegramUserId !== callerUserId) {
    throw new UnauthorizedTokenRedemptionError();
  }

  const profilesCollection = db.collection<PlayerProfile>('profiles');
  const updateResult = await profilesCollection.findOneAndUpdate(
    { telegramUserId: callerUserId },
    {
      $inc: { pins: BONUS_PINS_REWARD_AMOUNT },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: 'after' },
  );

  const finalPins = updateResult?.pins ?? BONUS_PINS_REWARD_AMOUNT;

  void notifyPublicRewardPayout(
    'bonus-pins',
    options ? { channelId: (options as { channelId?: string | number }).channelId } : undefined,
  );

  return {
    ok: true,
    pinsEarned: BONUS_PINS_REWARD_AMOUNT,
    pins: finalPins,
    telegramUserId: callerUserId,
  };
}
