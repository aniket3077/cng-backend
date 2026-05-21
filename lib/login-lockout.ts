import { createClient, RedisClientType } from 'redis';

type LoginAttemptRecord = {
  count: number;
  expiresAt: number;
};

const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_THRESHOLD = 5;
const LOGIN_PREFIX = 'failedLogin:';

let redisClient: RedisClientType | null = null;
let redisInitPromise: Promise<void> | null = null;

const memoryAttempts = new Map<string, LoginAttemptRecord>();

function cleanupExpiredMemoryAttempts() {
  const now = Date.now();
  for (const [key, record] of memoryAttempts.entries()) {
    if (record.expiresAt <= now) {
      memoryAttempts.delete(key);
    }
  }
}

async function getRedisClient(): Promise<RedisClientType | null> {
  if (!process.env.REDIS_URL) {
    return null;
  }

  if (redisClient) {
    return redisClient;
  }

  if (!redisInitPromise) {
    redisInitPromise = (async () => {
      try {
        redisClient = createClient({ url: process.env.REDIS_URL });
        redisClient.on('error', (error) => {
          console.error('Login lockout Redis error:', error);
        });
        await redisClient.connect();
      } catch (error) {
        console.warn('Login lockout Redis unavailable, using memory fallback:', error);
        redisClient = null;
      }
    })();
  }

  await redisInitPromise;
  return redisClient;
}

function buildKey(identifier: string) {
  return `${LOGIN_PREFIX}${identifier.toLowerCase()}`;
}

async function readAttemptCount(identifier: string): Promise<number> {
  const client = await getRedisClient();
  const key = buildKey(identifier);

  if (client) {
    const raw = await client.get(key);
    return raw ? Number(raw) || 0 : 0;
  }

  cleanupExpiredMemoryAttempts();
  return memoryAttempts.get(key)?.count || 0;
}

export async function isLoginLocked(identifier: string): Promise<boolean> {
  return (await readAttemptCount(identifier)) >= LOCKOUT_THRESHOLD;
}

export async function registerFailedLogin(identifier: string): Promise<number> {
  const client = await getRedisClient();
  const key = buildKey(identifier);

  if (client) {
    const nextCount = await client.incr(key);
    if (nextCount === 1) {
      await client.expire(key, Math.ceil(LOCKOUT_WINDOW_MS / 1000));
    }
    return nextCount;
  }

  cleanupExpiredMemoryAttempts();
  const current = memoryAttempts.get(key);
  const now = Date.now();
  const nextRecord: LoginAttemptRecord = current && current.expiresAt > now
    ? { count: current.count + 1, expiresAt: current.expiresAt }
    : { count: 1, expiresAt: now + LOCKOUT_WINDOW_MS };
  memoryAttempts.set(key, nextRecord);
  return nextRecord.count;
}

export async function clearFailedLogin(identifier: string): Promise<void> {
  const client = await getRedisClient();
  const key = buildKey(identifier);

  if (client) {
    await client.del(key);
    return;
  }

  memoryAttempts.delete(key);
}
