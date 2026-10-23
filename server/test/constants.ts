import * as path from 'node:path';

export const TEST_PG_PORT = 5598;
export const TEST_DB_NAME = 'repair_workshop_test';
export const TEST_DATA_DIR = path.resolve(process.cwd(), '.pgtest-data');
export const TEST_DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${TEST_PG_PORT}/${TEST_DB_NAME}`;
export const TEST_TOOLS_DIR = path.resolve(process.cwd(), '.test-tools');
export const TEST_PG_DUMP = path.join(TEST_TOOLS_DIR, 'pg_dump');
export const TEST_PG_RESTORE = path.join(TEST_TOOLS_DIR, 'pg_restore');
