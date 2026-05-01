import { Prisma, PrismaClient } from '@prisma/client';
import { sanitizeEnvValue } from './env-values';

// Resilient Prisma initialization for serverless (Vercel)
// If DATABASE_URL is not set or Prisma fails to init, export a Proxy
// that throws a clear error when any model/method is accessed.

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

let client: PrismaClient | undefined;
let initError: Error | null = null;
const databaseUrl = sanitizeEnvValue(process.env.DATABASE_URL);

if (databaseUrl) {
  try {
    client = globalForPrisma.prisma ?? new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });

    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = client;
  } catch (err) {
    initError = err instanceof Error ? err : new Error(String(err));
    client = undefined;
    console.error('Prisma initialization error:', initError);
  }
} else {
  initError = new Error('DATABASE_URL is not set. Prisma client unavailable.');
}

// Export a proxy so imports don't throw; attempts to use Prisma methods will throw a helpful error.
export const prisma = new Proxy(
  {},
  {
    get(_target, prop: string) {
      if (client) {
        // @ts-ignore - forward to real client
        return (client as any)[prop];
      }
      throw initError || new Error('Prisma client not initialized');
    },
  }
) as unknown as PrismaClient;

// Helper to check whether Prisma initialized successfully
export function isPrismaInitialized(): boolean {
  return !!client && initError === null;
}

// Helper to surface init error for diagnostics
export function getPrismaInitError(): Error | null {
  return initError;
}

const PRISMA_UNAVAILABLE_ERROR_CODES = new Set([
  'P1000', // Authentication failed
  'P1001', // Database unreachable
  'P1002', // Database timeout
  'P1017', // Server closed the connection
  'P2021', // Table does not exist
]);

export function isPrismaUnavailableError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return PRISMA_UNAVAILABLE_ERROR_CODES.has(error.code);
  }

  return false;
}

// PRODUCTION NOTE:
// For AWS RDS with high concurrency, consider:
// 1. Prisma Data Proxy (https://www.prisma.io/data-platform)
// 2. PgBouncer for connection pooling
// 3. Set connection pool size: ?connection_limit=10&pool_timeout=20
//
// Example DATABASE_URL with pooling:
// postgresql://user:pass@host:5432/db?sslmode=require&connection_limit=10&pool_timeout=20
