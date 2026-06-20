import { NextRequest, NextResponse } from 'next/server';

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

interface RateLimitOptions {
  headers?: Record<string, string>;
  identifier?: string;
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// In-memory fallback store (used when REDIS_URL is not configured)
// NOTE: In a serverless environment (Vercel) without Redis, rate limiting
// is per-instance and not globally consistent. For production, set REDIS_URL.
// ---------------------------------------------------------------------------
interface MemoryRecord {
  count: number;
  resetTime: number;
}

const memoryStore: Record<string, MemoryRecord> = {};

// Cleanup old entries every hour
setInterval(() => {
  const now = Date.now();
  Object.keys(memoryStore).forEach((key) => {
    if (memoryStore[key].resetTime < now) {
      delete memoryStore[key];
    }
  });
}, 60 * 60 * 1000);

// ---------------------------------------------------------------------------
// Redis-backed helpers (lazy-imported at runtime to avoid hard failures)
// ---------------------------------------------------------------------------
async function redisIncr(key: string): Promise<number> {
  try {
    const redis = await import('./redis-token-blacklist');
    if (redis.redisClient) {
      const result = await redis.redisClient.incr(key);
      return result;
    }
  } catch {
    // Redis not available — fall through to memory
  }
  return -1;
}

async function redisExpire(key: string, seconds: number): Promise<void> {
  try {
    const redis = await import('./redis-token-blacklist');
    if (redis.redisClient) {
      await redis.redisClient.expire(key, seconds);
    }
  } catch {
    // ignore
  }
}

async function redisTtl(key: string): Promise<number> {
  try {
    const redis = await import('./redis-token-blacklist');
    if (redis.redisClient) {
      return await redis.redisClient.ttl(key);
    }
  } catch {
    // ignore
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Rate limiting middleware to prevent brute force attacks.
 *
 * Uses Redis INCR/EXPIRE when REDIS_URL is configured, otherwise falls back
 * to an in-memory store (which is per-instance in serverless — less effective
 * but still provides basic protection).
 */
export async function rateLimit(
  request: NextRequest,
  config: RateLimitConfig,
  options: RateLimitOptions = {}
): Promise<NextResponse | null> {
  const forwarded = request.headers.get('x-forwarded-for') || request.headers.get('x-vercel-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : request.headers.get('x-real-ip') || 'unknown';
  const identifier = options.identifier || ip;
  const key = `rl:${identifier}`;

  const windowSeconds = Math.ceil(config.windowMs / 1000);

  // ---- Try Redis first ----
  const count = await redisIncr(key);

  if (count >= 0) {
    // Redis is available
    if (count === 1) {
      await redisExpire(key, windowSeconds);
    }

    if (count > config.maxRequests) {
      const ttl = await redisTtl(key);
      const retryAfter = ttl >= 0 ? ttl : windowSeconds;
      return buildRateLimitResponse(config, options, retryAfter);
    }

    return null;
  }

  // ---- Fallback to in-memory ----
  const now = Date.now();
  const record = memoryStore[identifier];

  if (!record || record.resetTime < now) {
    memoryStore[identifier] = {
      count: 1,
      resetTime: now + config.windowMs,
    };
    return null;
  }

  if (record.count >= config.maxRequests) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    return buildRateLimitResponse(config, options, retryAfter);
  }

  record.count++;
  return null;
}

function buildRateLimitResponse(
  config: RateLimitConfig,
  options: RateLimitOptions,
  retryAfter: number,
): NextResponse {
  return NextResponse.json(
    {
      error: 'Too many requests',
      message: options.errorMessage || `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
    },
    {
      status: 429,
      headers: {
        ...(options.headers ?? {}),
        'Retry-After': retryAfter.toString(),
        'X-RateLimit-Limit': config.maxRequests.toString(),
        'X-RateLimit-Remaining': '0',
      },
    }
  );
}

/**
 * Predefined rate limit configurations
 */
export const rateLimitConfigs = {
  // For authentication endpoints (login, signup)
  auth: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 10, // 10 attempts per 5 minutes
  },
  // For general API endpoints
  api: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60, // 60 requests per minute
  },
  // For expensive operations (search, complex queries)
  expensive: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10, // 10 requests per minute
  },
};
