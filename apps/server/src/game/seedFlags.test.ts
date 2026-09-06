import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { seedFlags } from './seedFlags.js';

describe('seedFlags', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri());
    await client.connect();
    db = client.db('test-flags');
  });

  after(async () => {
    if (client) {
      await client.close();
    }
    if (mongod) {
      await mongod.stop();
    }
  });

  it('populates flags collection and is idempotent on re-run', async () => {
    const firstRun = await seedFlags(db);

    assert.equal(firstRun.upserted, 195);
    assert.equal(firstRun.total, 195);

    const secondRun = await seedFlags(db);

    assert.equal(secondRun.upserted, 0);
    assert.equal(secondRun.matched, 195);
    assert.equal(secondRun.total, 195);

    const count = await db.collection('flags').countDocuments();
    assert.equal(count, 195);
  });
});
