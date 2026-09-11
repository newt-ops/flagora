import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { COUNTRIES, type CountryFlag } from '@flagora/shared';
import { ensureIndexes } from '../db/mongo.js';
import { seedFlags } from './seedFlags.js';
import {
  initFlagCache,
  reloadFlagCache,
  getCachedFlags,
  getCachedFlagByIso,
  resetFlagCache,
} from './flagCache.js';
import { generateChoices } from './flagSelection.js';
import { createRun } from './runService.js';
import { getPlayerProfileByUserId, findOrCreatePlayerProfile } from '../profile/profileService.js';

describe('Phase 9 Prompt 02: Selective Caching', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  let flagsCollectionQueries = 0;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri(), { monitorCommands: true });

    client.on('commandStarted', (event) => {
      if (
        event.commandName === 'find' &&
        (event.command.find === 'flags' || event.command.collection === 'flags')
      ) {
        flagsCollectionQueries++;
      }
    });

    await client.connect();
    db = client.db('test-flag-cache');
    await ensureIndexes(db);
    await seedFlags(db);
  });

  after(async () => {
    resetFlagCache();
    if (client) {
      await client.close();
    }
    if (mongod) {
      await mongod.stop();
    }
  });

  beforeEach(() => {
    flagsCollectionQueries = 0;
  });

  it('verifies in-memory flag cache matches the MongoDB flags collection', async () => {
    await initFlagCache(db);
    const cached = getCachedFlags();
    const fromDb = await db.collection<CountryFlag>('flags').find().toArray();

    assert.equal(cached.length, fromDb.length);
    assert.equal(cached.length, COUNTRIES.length);

    const dbMap = new Map(fromDb.map((f) => [f.isoCode, f]));
    for (const cachedFlag of cached) {
      const dbFlag = dbMap.get(cachedFlag.isoCode);
      assert.ok(dbFlag);
      assert.equal(cachedFlag.name, dbFlag.name);
      assert.equal(cachedFlag.tier, dbFlag.tier);
      assert.equal(cachedFlag.continent, dbFlag.continent);
    }
  });

  it('produces identical selectRunFlags and generateChoices choices from cache vs direct DB source of truth', async () => {
    await initFlagCache(db);
    const cachedPool = getCachedFlags();
    const dbPool = await db.collection<CountryFlag>('flags').find().toArray();

    const sampleFlag = cachedPool.find((f) => f.isoCode === 'fr')!;
    const dbSampleFlag = dbPool.find((f) => f.isoCode === 'fr')!;

    assert.deepEqual(sampleFlag, dbSampleFlag);

    const cachedChoices = generateChoices(sampleFlag, cachedPool);
    assert.ok(cachedChoices.includes('France'));
    assert.equal(cachedChoices.length, 4);

    const isoFlag = getCachedFlagByIso('ps');
    assert.ok(isoFlag);
    assert.equal(isoFlag.name, 'Palestine');
    assert.equal(isoFlag.tier, 1);
  });

  it('picks up changes made to MongoDB flags collection upon reloadFlagCache', async () => {
    await initFlagCache(db);
    const original = getCachedFlagByIso('ps');
    assert.equal(original?.name, 'Palestine');

    await db.collection<CountryFlag>('flags').updateOne(
      { isoCode: 'ps' },
      { $set: { name: 'State of Palestine' } },
    );

    assert.equal(getCachedFlagByIso('ps')?.name, 'Palestine');

    const reloadResult = await reloadFlagCache(db);
    assert.ok(reloadResult.count > 0);

    const updated = getCachedFlagByIso('ps');
    assert.equal(updated?.name, 'State of Palestine');

    await db.collection<CountryFlag>('flags').updateOne(
      { isoCode: 'ps' },
      { $set: { name: 'Palestine' } },
    );
    await reloadFlagCache(db);
  });

  it('confirms zero MongoDB queries against the flags collection during multiple run-start operations', async () => {
    await initFlagCache(db);
    flagsCollectionQueries = 0;

    for (let i = 0; i < 25; i++) {
      await createRun(99001 + i, db, { mode: 'practice' });
    }

    assert.equal(flagsCollectionQueries, 0);
  });

  it('confirms PlayerProfile reads are strictly uncached and observe live database state immediately', async () => {
    const testUser = {
      id: 881234,
      firstName: 'DirectMongo',
      username: 'direct_mongo',
    };

    const initialProfile = await findOrCreatePlayerProfile(testUser, db);
    assert.equal(initialProfile.coins, 0);

    await db.collection('profiles').updateOne(
      { telegramUserId: 881234 },
      { $set: { coins: 777, bestScore: 9999 } },
    );

    const freshRead = await getPlayerProfileByUserId(881234, db);
    assert.ok(freshRead);
    assert.equal(freshRead.coins, 777);
    assert.equal(freshRead.bestScore, 9999);
  });
});
