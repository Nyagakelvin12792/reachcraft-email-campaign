import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL_ENV);
const tmpDbPath = '/tmp/dev.db';

// Support Vercel serverless SQLite by copying seed.db to /tmp/dev.db
if (isServerless) {
  try {
    const tmpDir = path.dirname(tmpDbPath);
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    if (!fs.existsSync(tmpDbPath)) {
      const candidatePaths = [
        path.join(process.cwd(), 'prisma/seed.db'),
        path.join(process.cwd(), 'prisma/dev.db'),
        path.resolve('./prisma/seed.db'),
        path.resolve('./prisma/dev.db'),
        path.join(__dirname, 'prisma/seed.db'),
        path.join(__dirname, '../prisma/seed.db'),
        path.join(__dirname, '../../prisma/seed.db'),
        path.join(__dirname, '../../../prisma/seed.db'),
        path.join(__dirname, '../../../../prisma/seed.db'),
      ];

      let found = false;
      for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
          try {
            fs.copyFileSync(p, tmpDbPath);
            const stat = fs.statSync(tmpDbPath);
            console.log(`Successfully initialized SQLite database at ${tmpDbPath} from ${p} (${stat.size} bytes)`);
            found = true;
            break;
          } catch (e) {
            console.warn(`Could not copy seed DB from ${p} to /tmp:`, e);
          }
        }
      }
      if (!found) {
        console.warn('⚠️ Warning: seed.db was not found in any candidate path in serverless container:', candidatePaths);
      }
    }
  } catch (err) {
    console.error('Error ensuring /tmp SQLite database exists:', err);
  }

  process.env.DATABASE_URL = `file:${tmpDbPath}`;
}

const dbUrl = isServerless ? `file:${tmpDbPath}` : process.env.DATABASE_URL;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: dbUrl ? { db: { url: dbUrl } } : undefined,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
