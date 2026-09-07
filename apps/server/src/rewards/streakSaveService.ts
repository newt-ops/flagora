import type { Db } from 'mongodb';
import {
  type PlayerProfile,
  type StreakStatusResponse,
  type StreakSaveIntentSuccessResponse,
  type StreakSaveRedeemSuccessResponse,
  getUtcDateString,
  getYesterdayUtcDateString,
  isStreakAtRisk,
} from '@flagora/shared';
import {
  issueRewardToken,
  redeemRewardToken,
  verifyRewardToken,
  type RewardTokenServiceOptions,
} from './rewardTokenService.js';
import {
  StreakNotAtRiskError,
  UnauthorizedTokenRedemptionError,
} from './rewardErrors.js';

export async function getStreakStatus(
  telegramUserId: number,
  db: Db,
  options?: { now?: Date },
): Promise<StreakStatusResponse> {
  const profile = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId });

  const currentStreak = profile?.currentStreak ?? 0;
  const longestStreak = profile?.longestStreak ?? 0;
  const lastPlayedDate = profile?.lastPlayedDate ?? null;
  const now = options?.now ?? new Date();
  const todayStr = getUtcDateString(now);

  const atRisk = isStreakAtRisk(lastPlayedDate, currentStreak, todayStr);

  return {
    isAtRisk: atRisk,
    currentStreak,
    longestStreak,
    lastPlayedDate,
  };
}

export async function requestStreakSaveIntent(
  telegramUserId: number,
  db: Db,
  options?: RewardTokenServiceOptions,
): Promise<StreakSaveIntentSuccessResponse> {
  const status = await getStreakStatus(telegramUserId, db, { now: options?.now });

  if (!status.isAtRisk) {
    throw new StreakNotAtRiskError('Streak is not currently at risk');
  }

  const token = await issueRewardToken(telegramUserId, 'streak-save', options);

  return {
    ok: true,
    token,
    rewardType: 'streak-save',
    dailyCap: 1,
    currentStreak: status.currentStreak,
    longestStreak: status.longestStreak,
  };
}

export async function redeemStreakSave(
  token: string,
  callerUserId: number,
  db: Db,
  options?: RewardTokenServiceOptions,
): Promise<StreakSaveRedeemSuccessResponse> {
  const preview = verifyRewardToken(token, options);
  if (preview.telegramUserId !== callerUserId) {
    throw new UnauthorizedTokenRedemptionError();
  }

  const status = await getStreakStatus(callerUserId, db, { now: options?.now });
  if (!status.isAtRisk) {
    throw new StreakNotAtRiskError('Streak is no longer at risk');
  }

  const verified = await redeemRewardToken(token, 'streak-save', options);
  if (verified.telegramUserId !== callerUserId) {
    throw new UnauthorizedTokenRedemptionError();
  }

  const now = options?.now ?? new Date();
  const yesterdayStr = getYesterdayUtcDateString(now);

  const profilesCollection = db.collection<PlayerProfile>('profiles');
  await profilesCollection.updateOne(
    { telegramUserId: callerUserId },
    {
      $set: {
        lastPlayedDate: yesterdayStr,
        updatedAt: new Date(),
      },
    },
  );

  return {
    ok: true,
    saved: true,
    lastPlayedDate: yesterdayStr,
    currentStreak: status.currentStreak,
    longestStreak: status.longestStreak,
    telegramUserId: callerUserId,
  };
}
