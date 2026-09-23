import { spawnSync } from 'node:child_process';
import path from 'node:path';

const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
const databaseUrl = [
  process.env.DATABASE_URL,
  process.env.POSTGRES_PRISMA_URL,
  process.env.POSTGRES_URL,
  process.env.POSTGRES_URL_NON_POOLING,
].find((value) => value?.trim());
const isPostgres = /^postgres(?:ql)?:\/\//i.test(databaseUrl ?? '');
const schema = isPostgres
  ? 'prisma/schema.postgresql.prisma'
  : 'prisma/schema.prisma';

if (isVercel && !isPostgres) {
  console.error(
    'Vercel requires a persistent PostgreSQL DATABASE_URL. Refusing to deploy with ephemeral SQLite storage.'
  );
  process.exit(1);
}

const env = databaseUrl
  ? { ...process.env, DATABASE_URL: databaseUrl }
  : process.env;
const prismaCli = path.resolve('node_modules', 'prisma', 'build', 'index.js');

function runPrisma(args) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    env,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

runPrisma(['generate', '--schema', schema]);

if (isVercel) {
  runPrisma(['db', 'push', '--schema', schema, '--skip-generate']);
}
