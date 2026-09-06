import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import {
  calculateStreak,
  getUtcDateString,
  getDaysDifference,
  type PlayerProfile,
} from '@flagora/shared';
import { createRun, finishRun } from './runService.js';

describe('daily play streak rules and integration', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri());
    await client.connect();
    db = client.db('test-streak');
  });

  after(async () => {
    if (client) {
      await client.close();
    }
    if (mongod) {
      await mongod.stop();
    }
  });

  describe('pure streak calculation unit tests', () => {
    it('calculates getDaysDifference correctly across days and months', () => {
      assert.equal(getDaysDifference('2026-09-06', '2026-09-06'), 0);
      assert.equal(getDaysDifference('2026-09-06', '2026-09-07'), 1);
      assert.equal(getDaysDifference('2026-09-05', '2026-09-07'), 2);
      assert.equal(getDaysDifference('2026-08-31', '2026-09-01'), 1);
      assert.equal(getDaysDifference('2026-09-07', '2026-09-06'), -1);
    });

    it('handles first run ever when lastPlayedDate is null', () => {
      const res = calculateStreak(null, 0, 0, '2026-09-07');
      assert.equal(res.currentStreak, 1);
      assert.equal(res.longestStreak, 1);
      assert.equal(res.streakChange, 'reset');
    });

    it('leaves streak unchanged when played on the same day', () => {
      const res = calculateStreak('2026-09-07', 5, 5, '2026-09-07');
      assert.equal(res.currentStreak, 5);
      assert.equal(res.longestStreak, 5);
      assert.equal(res.streakChange, 'unchanged');
    });

    it('increments streak when played the consecutive day after lastPlayedDate', () => {
      const res = calculateStreak('2026-09-06', 3, 5, '2026-09-07');
      assert.equal(res.currentStreak, 4);
      assert.equal(res.longestStreak, 5);
      assert.equal(res.streakChange, 'incremented');

      const res2 = calculateStreak('2026-09-06', 5, 5, '2026-09-07');
      assert.equal(res2.currentStreak, 6);
      assert.equal(res2.longestStreak, 6);
      assert.equal(res2.streakChange, 'incremented');
    });

    it('resets streak to 1 when played two or more days after lastPlayedDate', () => {
      const resGap2 = calculateStreak('2026-09-05', 4, 8, '2026-09-07');
      assert.equal(resGap2.currentStreak, 1);
      assert.equal(resGap2.longestStreak, 8);
      assert.equal(resGap2.streakChange, 'reset');

      const resGap5 = calculateStreak('2026-09-01', 10, 10, '2026-09-07');
      assert.equal(resGap5.currentStreak, 1);
      assert.equal(resGap5.longestStreak, 10);
      assert.equal(resGap5.streakChange, 'reset');
    });
  });

  describe('end-to-end finishRun streak integration', () => {
    it('scenario 1: first run ever sets currentStreak = 1 and lastPlayedDate = today', async () => {
      const profiles = db.collection<PlayerProfile>('profiles');
      const userId = 4001;
      const today = getUtcDateString();

      const profile: PlayerProfile = {
        telegramUserId: userId,
        firstName: 'FirstTimer',
        coins: 0,
        xp: 0,
        level: 1,
        currentStreak: 0,
        longestStreak: 0,
        gamesPlayed: 0,
        bestScore: 0,
        lastPlayedDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await profiles.insertOne(profile);

      const run = await createRun(userId, db);
      const res = await finishRun(run.runId, userId, db);

      assert.equal(res.currentStreak, 1);
      assert.equal(res.longestStreak, 1);
      assert.equal(res.streakChange, 'reset');

      const updated = await profiles.findOne({ telegramUserId: userId });
      assert.equal(updated?.currentStreak, 1);
      assert.equal(updated?.longestStreak, 1);
      assert.equal(updated?.lastPlayedDate, today);
    });

    it('scenario 2: a second run the same day leaves currentStreak unchanged', async () => {
      const profiles = db.collection<PlayerProfile>('profiles');
      const userId = 4002;
      const today = getUtcDateString();

      const profile: PlayerProfile = {
        telegramUserId: userId,
        firstName: 'SameDayRunner',
        coins: 10,
        xp: 50,
        level: 1,
        currentStreak: 3,
        longestStreak: 5,
        gamesPlayed: 2,
        bestScore: 100,
        lastPlayedDate: today,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await profiles.insertOne(profile);

      const run = await createRun(userId, db);
      const res = await finishRun(run.runId, userId, db);

      assert.equal(res.currentStreak, 3);
      assert.equal(res.longestStreak, 5);
      assert.equal(res.streakChange, 'unchanged');

      const updated = await profiles.findOne({ telegramUserId: userId });
      assert.equal(updated?.currentStreak, 3);
      assert.equal(updated?.longestStreak, 5);
      assert.equal(updated?.lastPlayedDate, today);
    });

    it('scenario 3: a run the day after lastPlayedDate increments currentStreak by 1', async () => {
      const profiles = db.collection<PlayerProfile>('profiles');
      const userId = 4003;
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

      const profile: PlayerProfile = {
        telegramUserId: userId,
        firstName: 'ConsecutiveRunner',
        coins: 20,
        xp: 100,
        level: 1,
        currentStreak: 4,
        longestStreak: 4,
        gamesPlayed: 4,
        bestScore: 200,
        lastPlayedDate: yesterday,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await profiles.insertOne(profile);

      const run = await createRun(userId, db);
      const res = await finishRun(run.runId, userId, db);

      assert.equal(res.currentStreak, 5);
      assert.equal(res.longestStreak, 5);
      assert.equal(res.streakChange, 'incremented');

      const updated = await profiles.findOne({ telegramUserId: userId });
      assert.equal(updated?.currentStreak, 5);
      assert.equal(updated?.longestStreak, 5);
      assert.equal(updated?.lastPlayedDate, getUtcDateString());
    });

    it('scenario 4: a run two or more days after lastPlayedDate resets currentStreak to 1, not 0', async () => {
      const profiles = db.collection<PlayerProfile>('profiles');
      const userId = 4004;
      const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);

      const profile: PlayerProfile = {
        telegramUserId: userId,
        firstName: 'GapRunner',
        coins: 50,
        xp: 300,
        level: 1,
        currentStreak: 6,
        longestStreak: 6,
        gamesPlayed: 6,
        bestScore: 350,
        lastPlayedDate: threeDaysAgo,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await profiles.insertOne(profile);

      const run = await createRun(userId, db);
      const res = await finishRun(run.runId, userId, db);

      assert.equal(res.currentStreak, 1);
      assert.equal(res.longestStreak, 6);
      assert.equal(res.streakChange, 'reset');

      const updated = await profiles.findOne({ telegramUserId: userId });
      assert.equal(updated?.currentStreak, 1);
      assert.equal(updated?.longestStreak, 6);
      assert.equal(updated?.lastPlayedDate, getUtcDateString());
    });

    it('scenario 5: longestStreak tracks highest value ever and does not decrease when currentStreak resets', async () => {
      const profiles = db.collection<PlayerProfile>('profiles');
      const userId = 4005;
      const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);

      const profile: PlayerProfile = {
        telegramUserId: userId,
        firstName: 'RecordHolder',
        coins: 100,
        xp: 800,
        level: 2,
        currentStreak: 12,
        longestStreak: 12,
        gamesPlayed: 15,
        bestScore: 900,
        lastPlayedDate: tenDaysAgo,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await profiles.insertOne(profile);

      const run = await createRun(userId, db);
      const res = await finishRun(run.runId, userId, db);

      assert.equal(res.currentStreak, 1);
      assert.equal(res.longestStreak, 12);
      assert.equal(res.streakChange, 'reset');

      const updated = await profiles.findOne({ telegramUserId: userId });
      assert.equal(updated?.currentStreak, 1);
      assert.equal(updated?.longestStreak, 12);
    });

    it('scenario 6: retrying an already-credited finish call does not double-increment the streak', async () => {
      const profiles = db.collection<PlayerProfile>('profiles');
      const userId = 4006;
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

      const profile: PlayerProfile = {
        telegramUserId: userId,
        firstName: 'RetryTester',
        coins: 20,
        xp: 100,
        level: 1,
        currentStreak: 2,
        longestStreak: 2,
        gamesPlayed: 2,
        bestScore: 100,
        lastPlayedDate: yesterday,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await profiles.insertOne(profile);

      const run = await createRun(userId, db);
      const res1 = await finishRun(run.runId, userId, db);

      assert.equal(res1.currentStreak, 3);
      assert.equal(res1.longestStreak, 3);
      assert.equal(res1.streakChange, 'incremented');

      const res2 = await finishRun(run.runId, userId, db);
      assert.deepEqual(res1, res2);

      const updated = await profiles.findOne({ telegramUserId: userId });
      assert.equal(updated?.currentStreak, 3);
      assert.equal(updated?.longestStreak, 3);
      assert.equal(updated?.gamesPlayed, 3);
    });
  });
});
