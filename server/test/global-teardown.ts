import EmbeddedPostgres from 'embedded-postgres';
import { TEST_DATA_DIR, TEST_PG_PORT } from './constants';

export default async function globalTeardown(): Promise<void> {
  const postgres = new EmbeddedPostgres({
    databaseDir: TEST_DATA_DIR,
    user: 'postgres',
    password: 'postgres',
    port: TEST_PG_PORT,
    persistent: true,
  });
  try {
    await postgres.stop();
  } catch {
    /* سرور از قبل متوقف شده است */
  }
}
