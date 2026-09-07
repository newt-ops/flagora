import Redis, { type Redis as RedisClient } from 'ioredis';

let redisClient: RedisClient | null = null;

export async function initRedis(url: string): Promise<RedisClient> {
  if (redisClient) {
    return redisClient;
  }

  if (url === 'memory') {
    const { default: RedisMock } = await import('ioredis-mock');
    redisClient = new RedisMock() as unknown as RedisClient;
    return redisClient;
  }

  const client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    connectTimeout: 5000,
  });

  client.on('error', () => {
    void 0;
  });

  try {
    await client.connect();
    redisClient = client;
    return redisClient;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Redis connection error';
    process.stderr.write(`Warning: Failed to connect to Redis (${message}). Falling back to in-memory store.\n`);
    try {
      client.disconnect();
    } catch {
      void 0;
    }
    const { default: RedisMock } = await import('ioredis-mock');
    redisClient = new RedisMock() as unknown as RedisClient;
    return redisClient;
  }
}

export function getRedis(): RedisClient {
  if (!redisClient) {
    throw new Error('Redis is not initialized');
  }
  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
