/**
 * پایگاه داده توسعه (فقط برای توسعه و آزمایش محلی).
 * در استقرار واقعی از PostgreSQL نصب‌شده روی سرور استفاده می‌شود.
 * اجرا: node scripts/dev-db.mjs
 */
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve('.pgdev-data');
const port = Number(process.env.DEV_DB_PORT ?? 5597);
const database = process.env.DEV_DB_NAME ?? 'repair_workshop';

const postgres = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: true,
});

if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
  await postgres.initialise();
}
await postgres.start();
try {
  await postgres.createDatabase(database);
} catch {
  /* پایگاه داده از قبل وجود دارد */
}
console.log(`[dev-db] PostgreSQL روی پورت ${port} آماده است (پایگاه داده ${database}).`);
console.log('[dev-db] برای توقف Ctrl+C را بزنید.');

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  try {
    await postgres.stop();
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
setInterval(() => undefined, 60_000);
