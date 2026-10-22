import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Pool } from 'pg';

const MIGRATION_LOCK_ID = 74012001;

function resolveMigrationsDir(): string {
  const candidates = [
    path.join(__dirname, 'migrations'),
    path.join(process.cwd(), 'src', 'database', 'migrations'),
    path.join(process.cwd(), 'dist', 'database', 'migrations'),
  ];
  const found = candidates.find((dir) => fs.existsSync(dir));
  if (!found) {
    throw new Error(`پوشه مهاجرت‌های پایگاه داده پیدا نشد: ${candidates.join(', ')}`);
  }
  return found;
}

/**
 * اجرای مهاجرت‌های SQL به‌صورت افزایشی.
 * هر فایل فقط یک‌بار و داخل تراکنش اجرا می‌شود؛ قفل advisory مانع اجرای هم‌زمان
 * توسط چند نمونه سرور می‌شود.
 */
export async function runMigrations(pool: Pool): Promise<string[]> {
  const dir = resolveMigrationsDir();
  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  const client = await pool.connect();
  const appliedNow: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const result = await client.query<{ id: string }>('SELECT id FROM schema_migrations');
    const applied = new Set(result.rows.map((row) => row.id));

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
        await client.query('COMMIT');
        appliedNow.push(file);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`اجرای مهاجرت ${file} ناموفق بود: ${(error as Error).message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => undefined);
    client.release();
  }
  return appliedNow;
}
