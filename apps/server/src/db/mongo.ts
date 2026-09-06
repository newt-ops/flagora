import { MongoClient, type Db } from 'mongodb';

let client: MongoClient | null = null;
let database: Db | null = null;

export async function initDatabase(uri: string): Promise<Db> {
  if (database) {
    return database;
  }

  client = new MongoClient(uri);
  await client.connect();
  database = client.db();

  await database.collection('profiles').createIndex({ telegramUserId: 1 }, { unique: true });

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
}
