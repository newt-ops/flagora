import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { ensureIndexes } from './mongo.js';

describe('Phase 9 Prompt 01: Database Indexing Audit', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;

  function planUsesIndex(explainResult: unknown): boolean {
    const raw = JSON.stringify(explainResult);
    const hasIndexScan = raw.includes('"stage":"IXSCAN"') || raw.includes('"stage":"IDHACK"');
    const hasCollScan = raw.includes('"stage":"COLLSCAN"');
    return hasIndexScan && !hasCollScan;
  }

  before(async () => {
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri());
    await client.connect();
    db = client.db('test-indexing');
    await ensureIndexes(db);
  });

  after(async () => {
    if (client) {
      await client.close();
    }
    if (mongod) {
      await mongod.stop();
    }
  });

  it('verifies all expected indexes exist across all collections', async () => {
    const profilesIndexes = await db.collection('profiles').indexes();
    const runsIndexes = await db.collection('runs').indexes();
    const challengesIndexes = await db.collection('challenges').indexes();
    const battlesIndexes = await db.collection('battles').indexes();
    const defsIndexes = await db.collection('daily_challenge_definitions').indexes();
    const attemptsIndexes = await db.collection('daily_challenge_attempts').indexes();
    const flagsIndexes = await db.collection('flags').indexes();

    assert.ok(profilesIndexes.some((idx) => idx.key.telegramUserId === 1 && idx.unique === true));
    assert.ok(profilesIndexes.some((idx) => idx.key.bestScore === -1));

    assert.ok(runsIndexes.some((idx) => idx.key.runId === 1 && idx.unique === true));
    assert.ok(runsIndexes.some((idx) => idx.key.telegramUserId === 1 && idx.key.createdAt === -1));

    assert.ok(challengesIndexes.some((idx) => idx.key.challengeId === 1 && idx.unique === true));
    assert.ok(challengesIndexes.some((idx) => idx.key.challengerUserId === 1));
    assert.ok(challengesIndexes.some((idx) => idx.key.opponentUserId === 1));
    assert.ok(challengesIndexes.some((idx) => idx.key.expiresAt === 1 && idx.expireAfterSeconds === 0));

    assert.ok(battlesIndexes.some((idx) => idx.key.battleId === 1 && idx.unique === true));
    assert.ok(battlesIndexes.some((idx) => idx.key.challengerUserId === 1));
    assert.ok(battlesIndexes.some((idx) => idx.key.opponentUserId === 1));
    assert.ok(battlesIndexes.some((idx) => idx.key.expiresAt === 1 && idx.expireAfterSeconds === 0));

    assert.ok(defsIndexes.some((idx) => idx.key.date === 1 && idx.unique === true));
    assert.ok(attemptsIndexes.some((idx) => idx.key.telegramUserId === 1 && idx.key.date === 1 && idx.unique === true));

    assert.ok(flagsIndexes.some((idx) => idx.key.isoCode === 1 && idx.unique === true));
    assert.ok(flagsIndexes.some((idx) => idx.key.tier === 1));
  });

  it('verifies PlayerProfile queries use index and avoid COLLSCAN', async () => {
    await db.collection('profiles').insertOne({
      telegramUserId: 9901,
      username: 'indexer',
      firstName: 'Index',
      bestScore: 1200,
      createdAt: new Date(),
    });

    const userExplain = await db
      .collection('profiles')
      .find({ telegramUserId: 9901 })
      .explain();
    assert.equal(planUsesIndex(userExplain), true);

    const scoreExplain = await db
      .collection('profiles')
      .find({ bestScore: { $gt: 0 } })
      .sort({ bestScore: -1 })
      .explain();
    assert.equal(planUsesIndex(scoreExplain), true);
  });

  it('verifies GameRun queries use index and avoid COLLSCAN', async () => {
    await db.collection('runs').insertOne({
      runId: 'run-idx-1',
      telegramUserId: 9901,
      mode: 'practice',
      status: 'finished',
      startedAt: new Date(),
      createdAt: new Date(),
    });

    const runIdExplain = await db
      .collection('runs')
      .find({ runId: 'run-idx-1' })
      .explain();
    assert.equal(planUsesIndex(runIdExplain), true);

    const historyExplain = await db
      .collection('runs')
      .find({ telegramUserId: 9901 })
      .sort({ createdAt: -1 })
      .explain();
    assert.equal(planUsesIndex(historyExplain), true);
  });

  it('verifies Challenge participant queries use index and avoid COLLSCAN', async () => {
    await db.collection('challenges').insertOne({
      challengeId: 'c-idx-1',
      challengerUserId: 9901,
      opponentUserId: 9902,
      status: 'pending',
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
    });

    const idExplain = await db
      .collection('challenges')
      .find({ challengeId: 'c-idx-1' })
      .explain();
    assert.equal(planUsesIndex(idExplain), true);

    const challengerExplain = await db
      .collection('challenges')
      .find({ challengerUserId: 9901 })
      .explain();
    assert.equal(planUsesIndex(challengerExplain), true);

    const opponentExplain = await db
      .collection('challenges')
      .find({ opponentUserId: 9902 })
      .explain();
    assert.equal(planUsesIndex(opponentExplain), true);
  });

  it('verifies BattleSession participant queries use index and avoid COLLSCAN', async () => {
    await db.collection('battles').insertOne({
      battleId: 'b-idx-1',
      challengerUserId: 9901,
      opponentUserId: 9902,
      status: 'waiting',
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
    });

    const battleIdExplain = await db
      .collection('battles')
      .find({ battleId: 'b-idx-1' })
      .explain();
    assert.equal(planUsesIndex(battleIdExplain), true);

    const challengerExplain = await db
      .collection('battles')
      .find({ challengerUserId: 9901 })
      .explain();
    assert.equal(planUsesIndex(challengerExplain), true);

    const opponentExplain = await db
      .collection('battles')
      .find({ opponentUserId: 9902 })
      .explain();
    assert.equal(planUsesIndex(opponentExplain), true);
  });

  it('verifies Daily Challenge definitions and attempts use index and avoid COLLSCAN', async () => {
    await db.collection('daily_challenge_definitions').insertOne({
      date: '2026-09-08',
      flags: [],
      createdAt: new Date(),
    });

    await db.collection('daily_challenge_attempts').insertOne({
      telegramUserId: 9901,
      date: '2026-09-08',
      runId: 'daily-run-1',
      createdAt: new Date(),
    });

    const defExplain = await db
      .collection('daily_challenge_definitions')
      .find({ date: '2026-09-08' })
      .explain();
    assert.equal(planUsesIndex(defExplain), true);

    const attemptExplain = await db
      .collection('daily_challenge_attempts')
      .find({ telegramUserId: 9901, date: '2026-09-08' })
      .explain();
    assert.equal(planUsesIndex(attemptExplain), true);
  });

  it('verifies FlagAsset queries use index and avoid COLLSCAN', async () => {
    await db.collection('flags').insertOne({
      isoCode: 'ps',
      name: 'Palestine',
      tier: 1,
      continent: 'Asia',
    });

    const isoExplain = await db
      .collection('flags')
      .find({ isoCode: 'ps' })
      .explain();
    assert.equal(planUsesIndex(isoExplain), true);

    const tierExplain = await db
      .collection('flags')
      .find({ tier: 1 })
      .explain();
    assert.equal(planUsesIndex(tierExplain), true);
  });

  it('verifies TTL indexes expire un-actioned records without affecting completed ones', async () => {
    const challengesIndexes = await db.collection('challenges').indexes();
    const challengeTtl = challengesIndexes.find((idx) => idx.key.expiresAt === 1 && idx.expireAfterSeconds === 0);
    assert.ok(challengeTtl);
    assert.equal(challengeTtl.expireAfterSeconds, 0);

    const challengePartial = challengeTtl.partialFilterExpression as { status?: { $in?: string[] } };
    assert.ok(challengePartial);
    assert.ok(challengePartial.status?.$in?.includes('pending'));
    assert.ok(challengePartial.status?.$in?.includes('expired'));
    assert.equal(challengePartial.status?.$in?.includes('completed'), false);

    const battlesIndexes = await db.collection('battles').indexes();
    const battleTtl = battlesIndexes.find((idx) => idx.key.expiresAt === 1 && idx.expireAfterSeconds === 0);
    assert.ok(battleTtl);
    assert.equal(battleTtl.expireAfterSeconds, 0);

    const battlePartial = battleTtl.partialFilterExpression as { status?: { $in?: string[] } };
    assert.ok(battlePartial);
    assert.ok(battlePartial.status?.$in?.includes('waiting'));
    assert.ok(battlePartial.status?.$in?.includes('expired'));
    assert.equal(battlePartial.status?.$in?.includes('completed'), false);
  });
});
