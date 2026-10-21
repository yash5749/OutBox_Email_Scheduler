import Redis from 'ioredis';
import { getEnv } from './env';

const env = getEnv();

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true,
  retryStrategy: (times) => {
    return Math.min(times * 200, 30000);
  },
  connectionName: `reachinbox-api-${process.pid}`,
});

export const redisWorker = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true,
  retryStrategy: (times) => {
    return Math.min(times * 200, 30000);
  },
  connectionName: `reachinbox-worker-${process.pid}`,
});

redis.on('error', (err) => {
  console.error('[Redis] API connection error:', err.message);
});

redisWorker.on('error', (err) => {
  console.error('[Redis] Worker connection error:', err.message);
});

export async function connectRedis(): Promise<void> {
  if (redis.status === 'wait') {
    await redis.connect();
  } else if (redis.status === 'end') {
    // Recreate the client if it was closed
    throw new Error('Redis client was closed, need to restart process');
  }

  if (redisWorker.status === 'wait') {
    await redisWorker.connect();
  } else if (redisWorker.status === 'end') {
    throw new Error('Redis worker client was closed, need to restart process');
  }
}

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
  await redisWorker.quit();
}
