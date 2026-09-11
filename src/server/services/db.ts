import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

// Support Vercel serverless SQLite by copying seed.db to /tmp/dev.db
if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const tmpDir = '/tmp';
  const tmpDbPath = path.join(tmpDir, 'dev.db');

  if (!fs.existsSync(tmpDbPath)) {
    const candidatePaths = [
      path.resolve(process.cwd(), 'prisma/seed.db'),
      path.resolve(process.cwd(), 'prisma/dev.db'),
      path.join(__dirname, '../../prisma/seed.db'),
      path.join(__dirname, '../../../prisma/seed.db'),
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          fs.copyFileSync(p, tmpDbPath);
          break;
        } catch (e) {
          console.warn('Could not copy seed DB to /tmp:', e);
        }
      }
    }
  }

  process.env.DATABASE_URL = `file:${tmpDbPath}`;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
