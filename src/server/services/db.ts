import { PrismaClient } from '@prisma/client';

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL_ENV);
const configuredDatabaseUrl = [
  process.env.DATABASE_URL,
  process.env.POSTGRES_PRISMA_URL,
  process.env.POSTGRES_URL,
  process.env.POSTGRES_URL_NON_POOLING,
].find((value) => value?.trim());

if (isServerless && !/^postgres(?:ql)?:\/\//i.test(configuredDatabaseUrl ?? '')) {
  throw new Error(
    'Persistent PostgreSQL is not configured. Set DATABASE_URL (or a Vercel Postgres URL) before running on Vercel.'
  );
}

if (configuredDatabaseUrl) {
  process.env.DATABASE_URL = configuredDatabaseUrl;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: configuredDatabaseUrl ? { db: { url: configuredDatabaseUrl } } : undefined,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
