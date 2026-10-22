import * as fs from 'node:fs';
import * as path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { TEST_DATA_DIR, TEST_DB_NAME, TEST_PG_PORT, TEST_PG_DUMP, TEST_TOOLS_DIR } from './constants';

const FAKE_PG_DUMP = `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "pg_dump (PostgreSQL) 18.0"
  exit 0
fi
file=""
while [ $# -gt 0 ]; do
  if [ "$1" = "--file" ]; then
    file="$2"
  fi
  shift
done
if [ -z "$file" ]; then
  echo "missing --file" >&2
  exit 1
fi
echo "fake backup content" > "$file"
exit 0
`;

export default async function globalSetup(): Promise<void> {
  fs.mkdirSync(TEST_TOOLS_DIR, { recursive: true });
  fs.writeFileSync(TEST_PG_DUMP, FAKE_PG_DUMP, { mode: 0o755 });

  const postgres = new EmbeddedPostgres({
    databaseDir: TEST_DATA_DIR,
    user: 'postgres',
    password: 'postgres',
    port: TEST_PG_PORT,
    persistent: true,
  });

  if (!fs.existsSync(path.join(TEST_DATA_DIR, 'PG_VERSION'))) {
    await postgres.initialise();
  }
  await postgres.start();
  try {
    await postgres.createDatabase(TEST_DB_NAME);
  } catch {
    /* پایگاه داده از قبل وجود دارد */
  }
}
