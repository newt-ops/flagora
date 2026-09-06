import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import {
  calculateComboMultiplier,
  calculateFlagPoints,
  calculateLeftoverBonus,
  SCORING_CONFIG,
} from '@flagora/shared';
import { createRun, submitAnswer, finishRun } from './runService.js';
import {
  RunNotFoundError,
  UnauthorizedRunAccessError,
  RunAlreadyFinishedError,
  FlagAlreadyAnsweredError,
  TimeExpiredError,
  InvalidFlagIndexError,
  type GameRun,
} from './runTypes.js';

describe('runService and Variant C scoring', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri());
    await client.connect();
    db = client.db('test-runs');
  });

  after(async () => {
    if (client) {
      await client.close();
    }
    if (mongod) {
      await mongod.stop();
    }
  });

  it('calculates combo multiplier with cap at 1.5x', () => {
    assert.equal(calculateComboMultiplier(0), 1.0);
    assert.equal(calculateComboMultiplier(1), 1.1);
    assert.equal(calculateComboMultiplier(2), 1.2);
    assert.equal(calculateComboMultiplier(3), 1.3);
    assert.equal(calculateComboMultiplier(4), 1.4);
    assert.equal(calculateComboMultiplier(5), 1.5);
    assert.equal(calculateComboMultiplier(6), 1.5);
    assert.equal(calculateComboMultiplier(10), 1.5);
  });

  it('calculates flag points correctly based on tier and combo', () => {
    assert.equal(calculateFlagPoints(1, 0), 50);
    assert.equal(calculateFlagPoints(1, 1), 55);
    assert.equal(calculateFlagPoints(1, 5), 75);
    assert.equal(calculateFlagPoints(2, 0), 75);
    assert.equal(calculateFlagPoints(2, 3), 98);
    assert.equal(calculateFlagPoints(3, 0), 100);
    assert.equal(calculateFlagPoints(3, 5), 150);
    assert.equal(calculateFlagPoints(4, 0), 150);
    assert.equal(calculateFlagPoints(4, 5), 225);
  });

  it('calculates leftover bonus based on remaining seconds', () => {
    assert.equal(calculateLeftoverBonus(0), 0);
    assert.equal(calculateLeftoverBonus(-500), 0);
    assert.equal(calculateLeftoverBonus(999), 0);
    assert.equal(calculateLeftoverBonus(1000), 10);
    assert.equal(calculateLeftoverBonus(15234), 150);
    assert.equal(calculateLeftoverBonus(60000), 600);
  });

  it('starts a run with 10 flags without revealing correct answers', async () => {
    const userId = 1001;
    const startResponse = await createRun(userId, db);

    assert.ok(startResponse.runId);
    assert.equal(startResponse.flags.length, 10);
    assert.equal(startResponse.runDurationMs, SCORING_CONFIG.runDurationMs);

    for (const flag of startResponse.flags) {
      assert.ok(flag.isoCode);
      assert.equal(flag.choices.length, 4);
      assert.equal('name' in flag, false);
      assert.equal('correct' in flag, false);
      assert.equal('tier' in flag, false);
    }
  });

  it('never returns the correct country name in start, answer, or finish responses', async () => {
    const userId = 1002;
    const startResponse = await createRun(userId, db);
    const runDoc = await db.collection<GameRun>('runs').findOne({ runId: startResponse.runId });
    assert.ok(runDoc);

    const firstFlagCorrectName = runDoc.flags[0].name;

    const startString = JSON.stringify(startResponse);
    assert.equal(startString.includes(`"name":"${firstFlagCorrectName}"`), false);

    const answerResponse = await submitAnswer(
      startResponse.runId,
      userId,
      0,
      runDoc.flags[0].isoCode,
      db,
    );
    const answerString = JSON.stringify(answerResponse);
    assert.equal(answerString.includes(firstFlagCorrectName), false);
    assert.equal('name' in answerResponse, false);
    assert.equal('isoCode' in answerResponse, false);

    const finishResponse = await finishRun(startResponse.runId, userId, db);
    const finishString = JSON.stringify(finishResponse);
    assert.equal(finishString.includes(firstFlagCorrectName), false);
  });

  it('executes a full 10-answer run matching hand-calculated Variant C scoring', async () => {
    const userId = 1003;
    const startResponse = await createRun(userId, db);
    const runId = startResponse.runId;

    const collection = db.collection<GameRun>('runs');
    const runDoc = await collection.findOne({ runId });
    assert.ok(runDoc);

    const answerPattern = [true, true, false, true, true, true, true, true, true, false];
    let expectedRunningTotal = 0;
    let currentCombo = 0;
    let expectedMaxCombo = 0;

    for (let i = 0; i < 10; i++) {
      const isCorrect = answerPattern[i];
      const flag = runDoc.flags[i];
      const choiceToSubmit = isCorrect ? flag.isoCode : 'INVALID_GUESS';

      if (isCorrect) {
        currentCombo += 1;
        const multiplier = 1 + Math.min(currentCombo, 5) * 0.1;
        const points = Math.round(SCORING_CONFIG.tierBasePoints[flag.tier] * multiplier);
        expectedRunningTotal += points;
      } else {
        currentCombo = 0;
      }

      if (currentCombo > expectedMaxCombo) {
        expectedMaxCombo = currentCombo;
      }

      const answerResult = await submitAnswer(runId, userId, i, choiceToSubmit, db);

      assert.equal(answerResult.correct, isCorrect);
      assert.equal(answerResult.comboCount, currentCombo);
      assert.equal(answerResult.runningTotal, expectedRunningTotal);
    }

    const finishResult = await finishRun(runId, userId, db);
    assert.equal(finishResult.correctCount, 8);
    assert.equal(finishResult.maxCombo, expectedMaxCombo);
    assert.equal(finishResult.totalScore, expectedRunningTotal + finishResult.leftoverBonus);
  });

  it('resets combo on wrong answer and uses comboCount 1 on subsequent correct answer', async () => {
    const userId = 1004;
    const startResponse = await createRun(userId, db);
    const runId = startResponse.runId;
    const runDoc = await db.collection<GameRun>('runs').findOne({ runId });
    assert.ok(runDoc);

    const ans1 = await submitAnswer(runId, userId, 0, runDoc.flags[0].isoCode, db);
    assert.equal(ans1.correct, true);
    assert.equal(ans1.comboCount, 1);

    const ans2 = await submitAnswer(runId, userId, 1, 'WRONG_ISO', db);
    assert.equal(ans2.correct, false);
    assert.equal(ans2.comboCount, 0);
    assert.equal(ans2.pointsThisFlag, 0);

    const ans3 = await submitAnswer(runId, userId, 2, runDoc.flags[2].isoCode, db);
    assert.equal(ans3.correct, true);
    assert.equal(ans3.comboCount, 1);
    assert.equal(ans3.pointsThisFlag, Math.round(SCORING_CONFIG.tierBasePoints[runDoc.flags[2].tier] * 1.1));
  });

  it('rejects answering the same flagIndex twice', async () => {
    const userId = 1005;
    const startResponse = await createRun(userId, db);
    const runId = startResponse.runId;
    const runDoc = await db.collection<GameRun>('runs').findOne({ runId });
    assert.ok(runDoc);

    await submitAnswer(runId, userId, 0, runDoc.flags[0].isoCode, db);

    await assert.rejects(
      async () => {
        await submitAnswer(runId, userId, 0, runDoc.flags[0].isoCode, db);
      },
      (error: unknown) => {
        assert.ok(error instanceof FlagAlreadyAnsweredError);
        return true;
      },
    );
  });

  it('rejects answering after the 60s server timer has elapsed', async () => {
    const userId = 1006;
    const startResponse = await createRun(userId, db);
    const runId = startResponse.runId;
    const runDoc = await db.collection<GameRun>('runs').findOne({ runId });
    assert.ok(runDoc);

    const expiredStartTime = new Date(Date.now() - 65_000);
    await db.collection<GameRun>('runs').updateOne(
      { runId },
      { $set: { startedAt: expiredStartTime } },
    );

    await assert.rejects(
      async () => {
        await submitAnswer(runId, userId, 0, runDoc.flags[0].isoCode, db);
      },
      (error: unknown) => {
        assert.ok(error instanceof TimeExpiredError);
        return true;
      },
    );

    const updatedDoc = await db.collection<GameRun>('runs').findOne({ runId });
    assert.equal(updatedDoc?.status, 'expired');
  });

  it('rejects invalid flagIndex and unauthorized user', async () => {
    const userId = 1007;
    const startResponse = await createRun(userId, db);
    const runId = startResponse.runId;

    await assert.rejects(
      async () => {
        await submitAnswer(runId, userId, -1, 'US', db);
      },
      (error: unknown) => error instanceof InvalidFlagIndexError,
    );

    await assert.rejects(
      async () => {
        await submitAnswer(runId, userId, 10, 'US', db);
      },
      (error: unknown) => error instanceof InvalidFlagIndexError,
    );

    const differentUserId = 9999;
    await assert.rejects(
      async () => {
        await submitAnswer(runId, differentUserId, 0, 'US', db);
      },
      (error: unknown) => error instanceof UnauthorizedRunAccessError,
    );

    await assert.rejects(
      async () => {
        await finishRun(runId, differentUserId, db);
      },
      (error: unknown) => error instanceof UnauthorizedRunAccessError,
    );

    await assert.rejects(
      async () => {
        await submitAnswer('non-existent-run', userId, 0, 'US', db);
      },
      (error: unknown) => error instanceof RunNotFoundError,
    );
  });

  it('rejects answering on already finished run and returns idempotent finish score', async () => {
    const userId = 1008;
    const startResponse = await createRun(userId, db);
    const runId = startResponse.runId;
    const runDoc = await db.collection<GameRun>('runs').findOne({ runId });
    assert.ok(runDoc);

    const finishResult1 = await finishRun(runId, userId, db);
    const finishResult2 = await finishRun(runId, userId, db);

    assert.deepEqual(finishResult1, finishResult2);

    await assert.rejects(
      async () => {
        await submitAnswer(runId, userId, 0, runDoc.flags[0].isoCode, db);
      },
      (error: unknown) => error instanceof RunAlreadyFinishedError,
    );
  });

  it('ensures PlayerProfile is provably untouched across a complete run lifecycle', async () => {
    const profileCollection = db.collection('players');
    const playerDoc = {
      telegramUserId: 1009,
      username: 'flag_master',
      firstName: 'Master',
      lastName: 'Flags',
      level: 4,
      xp: 320,
      coins: 150,
      gamesPlayed: 12,
      currentStreak: 3,
      longestStreak: 5,
      lastActiveAt: new Date('2026-09-01T12:00:00.000Z'),
      createdAt: new Date('2026-09-01T12:00:00.000Z'),
      updatedAt: new Date('2026-09-01T12:00:00.000Z'),
    };
    await profileCollection.insertOne(playerDoc);

    const beforeRunProfile = await profileCollection.findOne({ telegramUserId: 1009 });
    const beforeSerialized = JSON.stringify(beforeRunProfile);

    const start = await createRun(1009, db);
    const runDoc = await db.collection<GameRun>('runs').findOne({ runId: start.runId });
    assert.ok(runDoc);

    await submitAnswer(start.runId, 1009, 0, runDoc.flags[0].isoCode, db);
    await submitAnswer(start.runId, 1009, 1, 'WRONG_GUESS', db);
    await finishRun(start.runId, 1009, db);

    const afterRunProfile = await profileCollection.findOne({ telegramUserId: 1009 });
    const afterSerialized = JSON.stringify(afterRunProfile);

    assert.equal(beforeSerialized, afterSerialized);
  });
});
