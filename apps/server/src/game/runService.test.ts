import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import {
  calculateComboMultiplier,
  calculateFlagPoints,
  calculateLeftoverBonus,
  calculateXpEarned,
  calculateCoinsEarned,
  calculateLevel,
  SCORING_CONFIG,
  PROGRESSION_CONFIG,
  type PlayerProfile,
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

describe('runService and Variant C scoring with profile progression', () => {
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

  it('calculates progression formulas accurately for xp, coins, and level', () => {
    assert.equal(calculateXpEarned(0), 0);
    assert.equal(calculateXpEarned(-10), 0);
    assert.equal(calculateXpEarned(9), 0);
    assert.equal(calculateXpEarned(10), 1);
    assert.equal(calculateXpEarned(763), 76);
    assert.equal(calculateXpEarned(1024), 102);

    assert.equal(calculateCoinsEarned(0), 0);
    assert.equal(calculateCoinsEarned(-1), 0);
    assert.equal(calculateCoinsEarned(1), 5);
    assert.equal(calculateCoinsEarned(8), 40);
    assert.equal(calculateCoinsEarned(10), 50);

    assert.equal(calculateLevel(0), 1);
    assert.equal(calculateLevel(-50), 1);
    assert.equal(calculateLevel(499), 1);
    assert.equal(calculateLevel(500), 2);
    assert.equal(calculateLevel(999), 2);
    assert.equal(calculateLevel(1000), 3);
    assert.equal(calculateLevel(1250), 3);
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

  it('updates profile progression on run completion and prevents double-crediting', async () => {
    const profilesCollection = db.collection<PlayerProfile>('profiles');
    const userId = 3001;

    const initialProfile: PlayerProfile = {
      telegramUserId: userId,
      username: 'pro_runner',
      firstName: 'Speedy',
      lastName: null,
      photoUrl: null,
      coins: 50,
      xp: 100,
      level: 1,
      currentStreak: 4,
      longestStreak: 7,
      gamesPlayed: 3,
      bestScore: 200,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await profilesCollection.insertOne(initialProfile);

    const start = await createRun(userId, db);
    const runDoc = await db.collection<GameRun>('runs').findOne({ runId: start.runId });
    assert.ok(runDoc);

    await submitAnswer(start.runId, userId, 0, runDoc.flags[0].isoCode, db);
    await submitAnswer(start.runId, userId, 1, runDoc.flags[1].isoCode, db);

    const finish1 = await finishRun(start.runId, userId, db);

    const expectedXpEarned = Math.floor(finish1.totalScore * PROGRESSION_CONFIG.xpPerScorePoint);
    const expectedCoinsEarned = 2 * PROGRESSION_CONFIG.coinsPerCorrect;

    assert.equal(finish1.correctCount, 2);
    assert.equal(finish1.xpEarned, expectedXpEarned);
    assert.equal(finish1.coinsEarned, expectedCoinsEarned);
    assert.equal(finish1.newXp, 100 + expectedXpEarned);
    assert.equal(finish1.newCoins, 50 + expectedCoinsEarned);
    assert.equal(finish1.newLevel, calculateLevel(100 + expectedXpEarned));
    assert.equal(finish1.bestScore, Math.max(200, finish1.totalScore));

    const updatedProfile1 = await profilesCollection.findOne({ telegramUserId: userId });
    assert.ok(updatedProfile1);
    assert.equal(updatedProfile1.xp, 100 + expectedXpEarned);
    assert.equal(updatedProfile1.coins, 50 + expectedCoinsEarned);
    assert.equal(updatedProfile1.gamesPlayed, 4);
    assert.equal(updatedProfile1.currentStreak, 4);
    assert.equal(updatedProfile1.longestStreak, 7);

    const finish2 = await finishRun(start.runId, userId, db);
    assert.deepEqual(finish1, finish2);

    const updatedProfile2 = await profilesCollection.findOne({ telegramUserId: userId });
    assert.ok(updatedProfile2);
    assert.equal(updatedProfile2.xp, 100 + expectedXpEarned);
    assert.equal(updatedProfile2.coins, 50 + expectedCoinsEarned);
    assert.equal(updatedProfile2.gamesPlayed, 4);
    assert.equal(updatedProfile2.currentStreak, 4);
    assert.equal(updatedProfile2.longestStreak, 7);
  });

  it('updates bestScore only when a new run score beats previous bestScore', async () => {
    const profilesCollection = db.collection<PlayerProfile>('profiles');
    const userId = 3002;

    const initialProfile: PlayerProfile = {
      telegramUserId: userId,
      firstName: 'BestScoreTester',
      coins: 0,
      xp: 0,
      level: 1,
      currentStreak: 0,
      longestStreak: 0,
      gamesPlayed: 0,
      bestScore: 500,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await profilesCollection.insertOne(initialProfile);

    const run1 = await createRun(userId, db);
    await db.collection<GameRun>('runs').updateOne(
      { runId: run1.runId },
      { $set: { runningTotal: 300, startedAt: new Date(Date.now() - 60_000) } },
    );
    const finishLow = await finishRun(run1.runId, userId, db);
    assert.equal(finishLow.totalScore, 300);
    assert.equal(finishLow.bestScore, 500);
    assert.equal(finishLow.isNewBest, false);

    const profileAfterLow = await profilesCollection.findOne({ telegramUserId: userId });
    assert.equal(profileAfterLow?.bestScore, 500);

    const run2 = await createRun(userId, db);
    await db.collection<GameRun>('runs').updateOne(
      { runId: run2.runId },
      { $set: { runningTotal: 800, startedAt: new Date(Date.now() - 60_000) } },
    );
    const finishHigh = await finishRun(run2.runId, userId, db);
    assert.equal(finishHigh.totalScore, 800);
    assert.equal(finishHigh.bestScore, 800);
    assert.equal(finishHigh.isNewBest, true);

    const profileAfterHigh = await profilesCollection.findOne({ telegramUserId: userId });
    assert.equal(profileAfterHigh?.bestScore, 800);

    const run3 = await createRun(userId, db);
    await db.collection<GameRun>('runs').updateOne(
      { runId: run3.runId },
      { $set: { runningTotal: 650, startedAt: new Date(Date.now() - 60_000) } },
    );
    const finishMedium = await finishRun(run3.runId, userId, db);
    assert.equal(finishMedium.totalScore, 650);
    assert.equal(finishMedium.bestScore, 800);
    assert.equal(finishMedium.isNewBest, false);

    const profileAfterMedium = await profilesCollection.findOne({ telegramUserId: userId });
    assert.equal(profileAfterMedium?.bestScore, 800);
  });

  it('increments level and sets leveledUp flag when crossing xpPerLevel threshold', async () => {
    const profilesCollection = db.collection<PlayerProfile>('profiles');
    const userId = 3003;

    const initialProfile: PlayerProfile = {
      telegramUserId: userId,
      firstName: 'LevelUpTester',
      coins: 0,
      xp: 450,
      level: 1,
      currentStreak: 1,
      longestStreak: 1,
      gamesPlayed: 5,
      bestScore: 400,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await profilesCollection.insertOne(initialProfile);

    const run = await createRun(userId, db);
    await db.collection<GameRun>('runs').updateOne(
      { runId: run.runId },
      { $set: { runningTotal: 600, startedAt: new Date(Date.now() - 60_000) } },
    );

    const result = await finishRun(run.runId, userId, db);
    assert.equal(result.xpEarned, 60);
    assert.equal(result.newXp, 510);
    assert.equal(result.newLevel, 2);
    assert.equal(result.leveledUp, true);

    const updatedProfile = await profilesCollection.findOne({ telegramUserId: userId });
    assert.equal(updatedProfile?.xp, 510);
    assert.equal(updatedProfile?.level, 2);
    assert.equal(updatedProfile?.currentStreak, 1);
    assert.equal(updatedProfile?.longestStreak, 1);
  });

  it('handles concurrent finish calls for two runs by the same player atomically', async () => {
    const profilesCollection = db.collection<PlayerProfile>('profiles');
    const userId = 3004;

    const initialProfile: PlayerProfile = {
      telegramUserId: userId,
      firstName: 'ConcurrentTester',
      coins: 10,
      xp: 100,
      level: 1,
      currentStreak: 2,
      longestStreak: 4,
      gamesPlayed: 1,
      bestScore: 250,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await profilesCollection.insertOne(initialProfile);

    const run1 = await createRun(userId, db);
    const run2 = await createRun(userId, db);

    await db.collection<GameRun>('runs').updateOne(
      { runId: run1.runId },
      {
        $set: {
          runningTotal: 400,
          startedAt: new Date(Date.now() - 60_000),
          flags: [{ flagIndex: 0, isoCode: 'FR', name: 'France', tier: 1, choices: [], answered: true, correct: true }],
        },
      },
    );

    await db.collection<GameRun>('runs').updateOne(
      { runId: run2.runId },
      {
        $set: {
          runningTotal: 500,
          startedAt: new Date(Date.now() - 60_000),
          flags: [{ flagIndex: 0, isoCode: 'DE', name: 'Germany', tier: 1, choices: [], answered: true, correct: true }],
        },
      },
    );

    const [res1, res2] = await Promise.all([
      finishRun(run1.runId, userId, db),
      finishRun(run2.runId, userId, db),
    ]);

    const totalExpectedXp = 100 + res1.xpEarned + res2.xpEarned;
    const totalExpectedCoins = 10 + res1.coinsEarned + res2.coinsEarned;

    const finalProfile = await profilesCollection.findOne({ telegramUserId: userId });
    assert.ok(finalProfile);
    assert.equal(finalProfile.xp, totalExpectedXp);
    assert.equal(finalProfile.coins, totalExpectedCoins);
    assert.equal(finalProfile.gamesPlayed, 3);
    assert.equal(finalProfile.bestScore, 500);
    assert.equal(finalProfile.currentStreak, 2);
    assert.equal(finalProfile.longestStreak, 4);
  });
});
