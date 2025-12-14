import { PrismaClient } from '@prisma/client';

// Prisma client singleton pattern for Next.js
// Prevents multiple instances in development (hot reload)

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// PRODUCTION NOTE:
// For AWS RDS with high concurrency, consider:
// 1. Prisma Data Proxy (https://www.prisma.io/data-platform)
// 2. PgBouncer for connection pooling
// 3. Set connection pool size: ?connection_limit=10&pool_timeout=20
//
// Example DATABASE_URL with pooling:
// postgresql://user:pass@host:5432/db?sslmode=require&connection_limit=10&pool_timeout=20
