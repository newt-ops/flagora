import dotenv from 'dotenv';
import { initDatabase, closeDatabase } from '../db/mongo.js';
import { initRedis, closeRedis } from '../db/redis.js';
import { reconcileLeaderboard } from '../leaderboard/leaderboardService.js';

dotenv.config();

const mongoUri = process.env.MONGODB_URI;
const redisUrl = process.env.REDIS_URL;

async function main() {
  if (!mongoUri || !redisUrl) {
    process.stderr.write('Fatal: MONGODB_URI and REDIS_URL environment variables are required.\n');
    process.exit(1);
  }

  try {
    const db = await initDatabase(mongoUri);
    const redis = await initRedis(redisUrl);

    const { count } = await reconcileLeaderboard(db, redis);
    process.stdout.write(`Successfully reconciled leaderboard with ${count} players\n`);

    await closeRedis();
    await closeDatabase();
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown reconciliation error';
    process.stderr.write(`Fatal error during leaderboard reconciliation: ${message}\n`);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  void main();
}
