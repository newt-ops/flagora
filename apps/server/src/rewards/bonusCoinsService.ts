import type { Db } from 'mongodb';
import {
  type PlayerProfile,
  type BonusCoinsIntentSuccessResponse,
  type BonusCoinsRedeemSuccessResponse,
  BONUS_COINS_REWARD_AMOUNT,
  BONUS_COINS_DAILY_CAP,
} from '@flagora/shared';
import {
  issueRewardToken,
  redeemRewardToken,
  verifyRewardToken,
  type RewardTokenServiceOptions,
} from './rewardTokenService.js';
import { UnauthorizedTokenRedemptionError } from './rewardErrors.js';

export async function requestBonusCoinsIntent(
  telegramUserId: number,
  options?: RewardTokenServiceOptions,
): Promise<BonusCoinsIntentSuccessResponse> {
  const token = await issueRewardToken(telegramUserId, 'bonus-coins', options);
  return {
    ok: true,
    token,
    rewardType: 'bonus-coins',
    dailyCap: BONUS_COINS_DAILY_CAP,
    coins: BONUS_COINS_REWARD_AMOUNT,
  };
}

export async function redeemBonusCoins(
  token: string,
  callerUserId: number,
  db: Db,
  options?: RewardTokenServiceOptions,
): Promise<BonusCoinsRedeemSuccessResponse> {
  const preview = verifyRewardToken(token, options);
  if (preview.telegramUserId !== callerUserId) {
    throw new UnauthorizedTokenRedemptionError();
  }

  const verified = await redeemRewardToken(token, 'bonus-coins', options);

  if (verified.telegramUserId !== callerUserId) {
    throw new UnauthorizedTokenRedemptionError();
  }

  const profilesCollection = db.collection<PlayerProfile>('profiles');
  const updateResult = await profilesCollection.findOneAndUpdate(
    { telegramUserId: callerUserId },
    {
      $inc: { coins: BONUS_COINS_REWARD_AMOUNT },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: 'after' },
  );

  const finalCoins = updateResult?.coins ?? BONUS_COINS_REWARD_AMOUNT;

  return {
    ok: true,
    coinsEarned: BONUS_COINS_REWARD_AMOUNT,
    coins: finalCoins,
    telegramUserId: callerUserId,
  };
}
