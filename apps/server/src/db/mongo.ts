import { MongoClient, type Db } from 'mongodb';

let client: MongoClient | null = null;
let database: Db | null = null;
let memoryServerInstance: { stop: () => Promise<boolean> } | null = null;

export async function initDatabase(uri: string): Promise<Db> {
  if (database) {
    return database;
  }

  let connectionUri = uri;
  if (uri === 'memory') {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create();
    memoryServerInstance = mongod;
    connectionUri = mongod.getUri();
  }

  client = new MongoClient(connectionUri);
  await client.connect();
  database = client.db();

  await ensureIndexes(database);

  return database;
}

export async function ensureIndexes(db: Db): Promise<void> {
  await db.collection('profiles').createIndex({ telegramUserId: 1 }, { unique: true });
  await db.collection('profiles').createIndex({ bestScore: -1 });

  await db.collection('runs').createIndex({ runId: 1 }, { unique: true });
  await db.collection('runs').createIndex({ telegramUserId: 1, createdAt: -1 });

  await db.collection('challenges').createIndex({ challengeId: 1 }, { unique: true });
  await db.collection('challenges').createIndex({ challengerUserId: 1 });
  await db.collection('challenges').createIndex({ opponentUserId: 1 });

  try {
    const existingChallengeIndexes = await db.collection('challenges').indexes();
    const legacyExpiresAt = existingChallengeIndexes.find(
      (idx) => idx.name === 'expiresAt_1' && idx.expireAfterSeconds === undefined,
    );
    if (legacyExpiresAt) {
      await db.collection('challenges').dropIndex('expiresAt_1');
    }
  } catch {
    void 0;
  }

  await db.collection('challenges').createIndex(
    { expiresAt: 1 },
    {
      expireAfterSeconds: 0,
      partialFilterExpression: { status: { $in: ['pending', 'expired'] } },
    },
  );

  await db.collection('battles').createIndex({ battleId: 1 }, { unique: true });
  await db.collection('battles').createIndex({ challengerUserId: 1 });
  await db.collection('battles').createIndex({ opponentUserId: 1 });

  try {
    const existingBattleIndexes = await db.collection('battles').indexes();
    const legacyExpiresAt = existingBattleIndexes.find(
      (idx) => idx.name === 'expiresAt_1' && idx.expireAfterSeconds === undefined,
    );
    if (legacyExpiresAt) {
      await db.collection('battles').dropIndex('expiresAt_1');
    }
  } catch {
    void 0;
  }

  await db.collection('battles').createIndex(
    { expiresAt: 1 },
    {
      expireAfterSeconds: 0,
      partialFilterExpression: { status: { $in: ['waiting', 'expired'] } },
    },
  );

  await db.collection('daily_challenge_definitions').createIndex({ date: 1 }, { unique: true });
  await db.collection('daily_challenge_attempts').createIndex({ telegramUserId: 1, date: 1 }, { unique: true });

  await db.collection('flags').createIndex({ isoCode: 1 }, { unique: true });
  await db.collection('flags').createIndex({ tier: 1 });
}

export function getDatabase(): Db {
  if (!database) {
    throw new Error('Database is not initialized');
  }
  return database;
}

export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    database = null;
  }
  if (memoryServerInstance) {
    await memoryServerInstance.stop();
    memoryServerInstance = null;
  }
}
