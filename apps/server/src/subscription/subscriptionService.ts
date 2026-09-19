import { getDatabase } from '../db/mongo.js';
import { Collection } from 'mongodb';

export interface Subscription {
  telegramUserId: number;
  status: 'active' | 'expired';
  currentPeriodEnd: Date;
  telegramChargeId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const COLLECTION_NAME = 'subscriptions';

function getCollection(): Collection<Subscription> {
  const db = getDatabase();
  if (!db) {
    throw new Error('Database connection not established');
  }
  return db.collection<Subscription>(COLLECTION_NAME);
}

export async function getSubscription(telegramUserId: number): Promise<Subscription | null> {
  const db = getDatabase();
  const result = await db.collection<Subscription>('subscriptions').findOne({ telegramUserId });
  return result;
}

export async function hasActiveSubscription(telegramUserId: number): Promise<boolean> {
  const sub = await getSubscription(telegramUserId);
  if (!sub) return false;
  return sub.status === 'active' && sub.currentPeriodEnd > new Date();
}

export async function processSuccessfulPayment(
  telegramUserId: number, 
  telegramChargeId: string
): Promise<Subscription> {
  const collection = getCollection();
  const existingSub = await getSubscription(telegramUserId);
  const now = new Date();
  
  let newPeriodEnd: Date;
  if (existingSub && existingSub.currentPeriodEnd > now) {
    // Extend existing
    newPeriodEnd = new Date(existingSub.currentPeriodEnd);
    newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
  } else {
    // Start new
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
        updatedAt: now
      },
      $setOnInsert: {
        createdAt: now
      }
    },
    { upsert: true, returnDocument: 'after' }
  );

  if (!result) {
    throw new Error('Failed to update subscription');
  }

  return result as Subscription;
}
