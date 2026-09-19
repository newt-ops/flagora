import { getDatabase } from '../db/mongo.js';
import type { Collection, Db } from 'mongodb';

export interface Subscription {
  telegramUserId: number;
  status: 'active' | 'expired';
  currentPeriodEnd: Date;
  telegramChargeId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const COLLECTION_NAME = 'subscriptions';

function getCollection(db?: Db): Collection<Subscription> {
  const targetDb = db ?? getDatabase();
  if (!targetDb) {
    throw new Error('Database connection not established');
  }
  return targetDb.collection<Subscription>(COLLECTION_NAME);
}

export async function getSubscription(telegramUserId: number, db?: Db): Promise<Subscription | null> {
  try {
    const collection = getCollection(db);
    const result = await collection.findOne({ telegramUserId });
    return result;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('Unexpected collection')) {
      return null;
    }
    throw err;
  }
}

export async function hasActiveSubscription(telegramUserId: number, db?: Db): Promise<boolean> {
  const sub = await getSubscription(telegramUserId, db);
  if (!sub) return false;
  return sub.status === 'active' && sub.currentPeriodEnd > new Date();
}

export async function hasEarlyAccess(
  playerOrUserId: number | { telegramUserId: number },
  db?: Db,
): Promise<boolean> {
  const telegramUserId =
    typeof playerOrUserId === 'number'
      ? playerOrUserId
      : playerOrUserId.telegramUserId;
  return hasActiveSubscription(telegramUserId, db);
}

export async function processSuccessfulPayment(
  telegramUserId: number,
  telegramChargeId: string,
  db?: Db,
): Promise<Subscription> {
  const collection = getCollection(db);
  const existingSub = await getSubscription(telegramUserId, db);
  const now = new Date();

  let newPeriodEnd: Date;
  if (existingSub && existingSub.currentPeriodEnd > now) {
    newPeriodEnd = new Date(existingSub.currentPeriodEnd);
    newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
  } else {
    newPeriodEnd = new Date(now);
    newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
  }

  const result = await collection.findOneAndUpdate(
    { telegramUserId },
    {
      $set: {
        status: 'active',
        currentPeriodEnd: newPeriodEnd,
        telegramChargeId,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: 'after' },
  );

  if (!result) {
    throw new Error('Failed to update subscription');
  }

  return result as Subscription;
}
