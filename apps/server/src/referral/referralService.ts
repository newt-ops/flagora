import type { Db } from 'mongodb';
import type { Redis as RedisClient } from 'ioredis';
import type { Referral, PlayerProfile } from '@flagora/shared';
import { notifyReferralReward } from '../telegram/telegramService.js';

export const REFERRAL_INVITER_COIN_REWARD = 100;
export const REFERRAL_NEW_PLAYER_COIN_REWARD = 50;
export const REFERRAL_DAILY_INVITER_CAP = 10;

export async function initReferralCollection(db: Db): Promise<void> {
  const collection = db.collection<Referral>('referrals');
  await collection.createIndex({ newPlayerTelegramUserId: 1 }, { unique: true });
  await collection.createIndex({ inviterTelegramUserId: 1, status: 1 });
}

export async function registerReferralSignup(
  inviterUserId: number,
  newPlayerUserId: number,
  db: Db,
): Promise<Referral | null> {
  if (
    !inviterUserId ||
    !newPlayerUserId ||
    inviterUserId === newPlayerUserId ||
    inviterUserId <= 0 ||
    newPlayerUserId <= 0
  ) {
    return null;
  }

  const existingProfile = await db
    .collection<PlayerProfile>('profiles')
    .findOne({ telegramUserId: newPlayerUserId });

  if (existingProfile && existingProfile.gamesPlayed > 0) {
    return null;
  }

  const referral: Referral = {
    inviterTelegramUserId: inviterUserId,
    newPlayerTelegramUserId: newPlayerUserId,
    status: 'pending-first-run',
    createdAt: new Date(),
    completedAt: null,
  };

  try {
    await db.collection<Referral>('referrals').insertOne({ ...referral });
    await db.collection<PlayerProfile>('profiles').updateOne(
      { telegramUserId: newPlayerUserId, referredBy: null },
      { $set: { referredBy: inviterUserId } },
    );
    return referral;
  } catch (error: unknown) {
    const err = error as { code?: number; name?: string };
    if (err?.code === 11000 || err?.name === 'MongoServerError') {
      return null;
    }
    throw error;
  }
}

export interface ProcessReferralResult {
  creditedNewPlayer: boolean;
  creditedInviter: boolean;
  inviterCapped: boolean;
}

export async function processReferralOnFirstRun(
  newPlayerUserId: number,
  db: Db,
  redis?: RedisClient,
  options?: { now?: Date },
): Promise<ProcessReferralResult | null> {
  const collection = db.collection<Referral>('referrals');
  const now = options?.now ?? new Date();

  const updated = await collection.findOneAndUpdate(
    { newPlayerTelegramUserId: newPlayerUserId, status: 'pending-first-run' },
    { $set: { status: 'completed', completedAt: now } },
    { returnDocument: 'after' },
  );

  if (!updated) {
    return null;
  }

  await db.collection<PlayerProfile>('profiles').updateOne(
    { telegramUserId: newPlayerUserId },
    { $inc: { coins: REFERRAL_NEW_PLAYER_COIN_REWARD } },
  );

  let isUnderCap = true;
  if (redis) {
    const todayUtc = now.toISOString().slice(0, 10);
    const capKey = `referral:daily:${updated.inviterTelegramUserId}:${todayUtc}`;
    const currentCount = await redis.incr(capKey);
    if (currentCount === 1) {
      await redis.expire(capKey, 172800);
    }
    isUnderCap = currentCount <= REFERRAL_DAILY_INVITER_CAP;
  }

  if (isUnderCap) {
    await db.collection<PlayerProfile>('profiles').updateOne(
      { telegramUserId: updated.inviterTelegramUserId },
      { $inc: { coins: REFERRAL_INVITER_COIN_REWARD, referralCount: 1 } },
    );

    const newPlayerProfile = await db
      .collection<PlayerProfile>('profiles')
      .findOne({ telegramUserId: newPlayerUserId });
    const newPlayerName = newPlayerProfile?.firstName || 'A friend';
    void notifyReferralReward(updated.inviterTelegramUserId, newPlayerName, db);

    return {
      creditedNewPlayer: true,
      creditedInviter: true,
      inviterCapped: false,
    };
  }

  return {
    creditedNewPlayer: true,
    creditedInviter: false,
    inviterCapped: true,
  };
}
