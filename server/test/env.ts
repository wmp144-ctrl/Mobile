import * as path from 'node:path';
import { TEST_DATABASE_URL, TEST_PG_DUMP } from './constants';

process.env.NODE_ENV = 'test';
process.env.TZ = 'Asia/Tehran';
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.JWT_SECRET = 'test-only-secret-key-with-more-than-32-characters';
process.env.DB_AUTO_MIGRATE = 'true';
process.env.ACCESS_TOKEN_MINUTES = '15';
process.env.COOKIE_SECURE = 'false';
process.env.BACKUP_DIR = path.resolve(process.cwd(), 'test-backups');
process.env.BACKUP_CRON_ENABLED = 'false';
process.env.PG_DUMP_PATH = TEST_PG_DUMP;
process.env.UPLOADS_DIR = path.resolve(process.cwd(), 'test-uploads');
