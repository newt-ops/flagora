import { describe, it, beforeEach, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { hasActiveSubscription, processSuccessfulPayment } from './subscriptionService.js';
import { initDatabase } from '../db/mongo.js';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';

describe('Subscription Service', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri());
    await client.connect();
    db = client.db('test-sub-db');
    
    // We need to override getDb temporarily for the service to use it
    // Actually the standard way here is initDatabase
    await initDatabase(mongod.getUri());
  });

  after(async () => {
    if (client) {
      await client.close();
    }
    if (mongod) {
      await mongod.stop();
    }
  });

  beforeEach(async () => {
    await db.collection('subscriptions').deleteMany({});
  });

  it('returns false for hasActiveSubscription when no subscription exists', async () => {
    const active = await hasActiveSubscription(12345);
    assert.equal(active, false);
  });

  it('creates a new subscription on successful payment', async () => {
    const sub = await processSuccessfulPayment(12345, 'charge_123');
    
    assert.equal(sub.telegramUserId, 12345);
    assert.equal(sub.status, 'active');
    assert.equal(sub.telegramChargeId, 'charge_123');
    
    const expectedEnd = new Date();
    expectedEnd.setMonth(expectedEnd.getMonth() + 1);
    
    assert.ok(Math.abs(sub.currentPeriodEnd.getTime() - expectedEnd.getTime()) < 5000);

    const active = await hasActiveSubscription(12345);
    assert.equal(active, true);
  });

  it('extends an existing active subscription', async () => {
    const firstSub = await processSuccessfulPayment(12345, 'charge_123');
    const secondSub = await processSuccessfulPayment(12345, 'charge_456');
    
    const expectedEnd = new Date(firstSub.currentPeriodEnd);
    expectedEnd.setMonth(expectedEnd.getMonth() + 1);
    
    assert.equal(secondSub.currentPeriodEnd.getTime(), expectedEnd.getTime());
    assert.equal(secondSub.telegramChargeId, 'charge_456');
  });

  it('returns false for hasActiveSubscription when expired', async () => {
    await processSuccessfulPayment(12345, 'charge_123');
    
    await db.collection('subscriptions').updateOne(
      { telegramUserId: 12345 },
      { $set: { currentPeriodEnd: new Date(Date.now() - 1000) } }
    );

    const active = await hasActiveSubscription(12345);
    assert.equal(active, false);
  });
});
