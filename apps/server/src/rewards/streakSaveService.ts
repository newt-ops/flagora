import type { Db } from 'mongodb';
import type { Redis } from 'ioredis';
import {
  type PlayerProfile,
  type StreakStatusResponse,
  type StreakSaveSuccessResponse,
  STREAK_SAVE_PIN_COST,
  getUtcDateString,
  getYesterdayUtcDateString,
  isStreakAtRisk,
} from '@flagora/shared';
import {
  StreakNotAtRiskError,
  RewardCapReachedError,
  InsufficientPinsError,
} from './rewardErrors.js';
import { hasActiveSubscription } from '../subscription/subscriptionService.js';

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

export interface SaveStreakOptions {
  now?: Date;
  redis?: Redis | null;
}

export async function saveStreak(
  telegramUserId: number,
  db: Db,
  options?: SaveStreakOptions,
): Promise<StreakSaveSuccessResponse> {
  const now = options?.now ?? new Date();
  const todayStr = getUtcDateString(now);
  const yesterdayStr = getYesterdayUtcDateString(now);

  const status = await getStreakStatus(telegramUserId, db, { now });
  if (!status.isAtRisk) {
    throw new StreakNotAtRiskError('Streak is not currently at risk');
  }

  const profilesCollection = db.collection<PlayerProfile>('profiles');
  const profile = await profilesCollection.findOne({ telegramUserId });
  if (!profile) {
    throw new Error('Player profile not found');
  }

  const isPro = await hasActiveSubscription(telegramUserId, db);
  const pinsCost = isPro ? 0 : STREAK_SAVE_PIN_COST;

  if (pinsCost > 0 && (profile.pins ?? 0) < pinsCost) {
    throw new InsufficientPinsError('Insufficient pins to save streak');
  }

  if (options?.redis) {
    const dailyKey = `streak_save:daily:${telegramUserId}:${todayStr}`;
    const used = await options.redis.incr(dailyKey);
    if (used === 1) {
      await options.redis.expire(dailyKey, 86400 * 2);
    } else if (used > 1) {
      const tomorrowMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      throw new RewardCapReachedError(
        telegramUserId,
        'streak-save',
        1,
        used,
        tomorrowMidnight.toISOString(),
        'Daily streak save limit reached',
      );
    }
  }

  const updateResult = await profilesCollection.findOneAndUpdate(
    pinsCost > 0
      ? { telegramUserId, pins: { $gte: pinsCost } }
      : { telegramUserId },
    {
      $inc: pinsCost > 0 ? { pins: -pinsCost } : {},
      $set: {
        lastPlayedDate: yesterdayStr,
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' },
  );

  const updatedDoc = (updateResult && 'value' in updateResult ? updateResult.value : updateResult) as PlayerProfile | null;
  if (!updatedDoc) {
    throw new InsufficientPinsError('Insufficient pins to save streak');
  }

  const newPins = updatedDoc.pins ?? 0;

  return {
    ok: true,
    saved: true,
    pinsDeducted: pinsCost,
    pins: newPins,
    currentStreak: status.currentStreak,
    longestStreak: status.longestStreak,
    lastPlayedDate: yesterdayStr,
    telegramUserId,
  };
}
