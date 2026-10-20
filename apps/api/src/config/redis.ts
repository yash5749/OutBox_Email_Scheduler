import Redis from 'ioredis';
import { getEnv } from './env';

const env = getEnv();

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true,
  retryStrategy: (times) => {
    if (times > 10) return null;
    return Math.min(times * 200, 5000);
  },
  connectionName: `reachinbox-api-${process.pid}`,
});

export const redisWorker = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true,
  retryStrategy: (times) => {
    if (times > 10) return null;
    return Math.min(times * 200, 5000);
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
  await redis.connect();
  await redisWorker.connect();
}

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
  await redisWorker.quit();
}