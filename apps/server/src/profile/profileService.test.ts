import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { findOrCreatePlayerProfile, getPlayerProfileByUserId } from './profileService.js';
import type { TelegramUser } from '../auth/types.js';

describe('profileService', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    client = new MongoClient(uri);
    await client.connect();
    db = client.db('test-flagora');
    await db.collection('profiles').createIndex({ telegramUserId: 1 }, { unique: true });
  });

  after(async () => {
    if (client) {
      await client.close();
    }
    if (mongod) {
      await mongod.stop();
    }
  });

  it('creates a new player profile with default progression fields on first call', async () => {
    const user: TelegramUser = {
      id: 1001,
      firstName: 'Alice',
      lastName: 'Wonder',
      username: 'alice_w',
      photoUrl: 'https://example.com/alice.jpg',
    };

    const profile = await findOrCreatePlayerProfile(user, db);

    assert.equal(profile.telegramUserId, 1001);
    assert.equal(profile.firstName, 'Alice');
    assert.equal(profile.lastName, 'Wonder');
    assert.equal(profile.username, 'alice_w');
    assert.equal(profile.photoUrl, 'https://example.com/alice.jpg');
    assert.equal(profile.coins, 0);
    assert.equal(profile.xp, 0);
    assert.equal(profile.level, 1);
    assert.equal(profile.currentStreak, 0);
    assert.equal(profile.longestStreak, 0);
    assert.equal(profile.gamesPlayed, 0);
    assert.ok(profile.createdAt instanceof Date);
    assert.ok(profile.updatedAt instanceof Date);
  });

  it('preserves progression fields on subsequent call even if display name changes', async () => {
    const collection = db.collection('profiles');
    await collection.updateOne(
      { telegramUserId: 1001 },
      {
        $set: {
          coins: 250,
          xp: 1500,
          level: 4,
          currentStreak: 7,
          longestStreak: 12,
          gamesPlayed: 18,
        },
      },
    );

    const updatedTelegramUser: TelegramUser = {
      id: 1001,
      firstName: 'AliceUpdated',
      lastName: 'WonderUpdated',
      username: 'alice_super',
    };

    const profile = await findOrCreatePlayerProfile(updatedTelegramUser, db);

    assert.equal(profile.telegramUserId, 1001);
    assert.equal(profile.firstName, 'AliceUpdated');
    assert.equal(profile.lastName, 'WonderUpdated');
    assert.equal(profile.username, 'alice_super');
    assert.equal(profile.coins, 250);
    assert.equal(profile.xp, 1500);
    assert.equal(profile.level, 4);
    assert.equal(profile.currentStreak, 7);
    assert.equal(profile.longestStreak, 12);
    assert.equal(profile.gamesPlayed, 18);

    const fetched = await getPlayerProfileByUserId(1001, db);
    assert.ok(fetched);
    assert.equal(fetched.firstName, 'AliceUpdated');
    assert.equal(fetched.coins, 250);
  });

  it('returns null for non-existent profile', async () => {
    const nonExistent = await getPlayerProfileByUserId(999999, db);
    assert.equal(nonExistent, null);
  });
});
