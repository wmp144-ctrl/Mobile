import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';

const envFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile, override: false });
}

export const APP_CONFIG = 'APP_CONFIG';
export const APP_VERSION = '1.0.0';
export const APP_NAME = 'سامانه مدیریت تعمیرگاه';

export interface AppConfig {
  env: string;
  isProduction: boolean;
  port: number;
  timezone: string;
  databaseUrl: string;
  dbPoolMax: number;
  dbAutoMigrate: boolean;
  jwtSecret: string;
  accessTokenMinutes: number;
  cookieSecure: boolean;
  backupDir: string;
  pgDumpPath: string;
  backupCronEnabled: boolean;
  clientDist: string;
}

function readInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const isProduction = env.NODE_ENV === 'production';
  const jwtSecret = env.JWT_SECRET ?? '';
  if (jwtSecret.length < 32) {
    throw new Error('متغیر محیطی JWT_SECRET باید حداقل ۳۲ نویسه باشد.');
  }
  const databaseUrl = env.DATABASE_URL ?? '';
  if (!databaseUrl) {
    throw new Error('متغیر محیطی DATABASE_URL تنظیم نشده است.');
  }

  return {
    env: env.NODE_ENV ?? 'development',
    isProduction,
    port: readInt(env.PORT, 3000),
    timezone: env.TZ ?? 'Asia/Tehran',
    databaseUrl,
    dbPoolMax: readInt(env.DB_POOL_MAX, 10),
    dbAutoMigrate: readBool(env.DB_AUTO_MIGRATE, true),
    jwtSecret,
    accessTokenMinutes: readInt(env.ACCESS_TOKEN_MINUTES, 15),
    cookieSecure: readBool(env.COOKIE_SECURE, isProduction),
    backupDir: path.resolve(process.cwd(), env.BACKUP_DIR ?? './backups'),
    pgDumpPath: env.PG_DUMP_PATH ?? 'pg_dump',
    backupCronEnabled: readBool(env.BACKUP_CRON_ENABLED, true),
    clientDist: path.resolve(__dirname, '..', '..', '..', 'client', 'dist'),
  };
}
