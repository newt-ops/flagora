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

  await database.collection('profiles').createIndex({ telegramUserId: 1 }, { unique: true });
  await database.collection('daily_challenge_definitions').createIndex({ date: 1 }, { unique: true });
  await database.collection('daily_challenge_attempts').createIndex({ telegramUserId: 1, date: 1 }, { unique: true });

  return database;
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
