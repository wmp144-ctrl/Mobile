import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { execFile } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { promisify } from 'node:util';
import { APP_CONFIG, APP_VERSION, type AppConfig } from '../../config/configuration';
import { AppException, ErrorCodes } from '../../common/errors/app.exception';
import { timestampForFileName } from '../../common/utils/dates';
import { DatabaseService } from '../../database/database.service';
import { AuditService, type AuditActor } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { SettingsService, type FullSettings } from '../settings/settings.service';

const execFileAsync = promisify(execFile);
const BUNDLE_NAME_PATTERN = /^backup-\d{8}-\d{6}(-\d+)?$/;
const LEGACY_NAME_PATTERN = /^backup-\d{8}-\d{6}(-\d+)?\.dump$/;
const BACKUP_FORMAT = 'repair-workshop-backup';
const BACKUP_FORMAT_VERSION = 1;
const ENCRYPTION_SALT = 'repair-workshop-backup-v1';
const MAX_SCHEDULE_WINDOW_MINUTES = 90;

export type DownloadableFile = 'database' | 'settings' | 'manifest';

interface ManifestEntry {
  name: string;
  size: number;
  sha256?: string;
  iv?: string;
  tag?: string;
}

interface BackupManifest {
  format: string;
  version: number;
  appVersion: string;
  createdAt: string;
  encrypted: boolean;
  includesSettings: boolean;
  includesFiles: boolean;
  database: ManifestEntry | null;
  settings: ManifestEntry | null;
  files: ManifestEntry[];
}

interface SettingsExport {
  version: number;
  exportedAt: string;
  appSettings: Record<string, unknown>;
  fieldDefinitions: Record<string, unknown>[];
  optionLists: Record<string, unknown>[];
}

export interface BackupBundleDto {
  name: string;
  createdAt: string;
  sizeBytes: number;
  encrypted: boolean;
  includesSettings: boolean;
  includesFiles: boolean;
  databaseBytes: number;
  filesCount: number;
  filesBytes: number;
  legacy: boolean;
}

export interface BackupRunDto {
  id: string;
  bundleName: string;
  operation: 'backup' | 'restore';
  trigger: 'manual' | 'scheduled' | 'pre_restore';
  status: 'success' | 'failed';
  encrypted: boolean;
  includesFiles: boolean;
  durationMs: number | null;
  error: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface BackupStatusDto {
  pgDumpAvailable: boolean;
  pgDumpVersion: string | null;
  pgRestoreAvailable: boolean;
  pgRestoreVersion: string | null;
  directory: string;
  retentionCount: number;
  scheduledEnabled: boolean;
  scheduleTime: string;
  encryptionAvailable: boolean;
  lastSuccessAt: string | null;
  lastSuccessName: string | null;
  lastFailureAt: string | null;
  lastFailureMessage: string | null;
}

export interface BackupListDto {
  items: BackupBundleDto[];
  status: BackupStatusDto;
  runs: BackupRunDto[];
}

export interface RestoreResultDto {
  bundleName: string;
  restoredAt: string;
  database: boolean;
  settingsRestored: boolean;
  filesRestored: number;
  filesSkipped: number;
  safetyBackup: string | null;
}

export interface BackupOptions {
  includeFiles?: boolean;
}

interface BackupRunRow {
  id: string;
  bundle_name: string;
  operation: 'backup' | 'restore';
  trigger_source: 'manual' | 'scheduled' | 'pre_restore';
  status: 'success' | 'failed';
  encrypted: boolean;
  includes_files: boolean;
  duration_ms: number | null;
  error: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: Date;
}

@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);
  private scheduledRunning = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly db: DatabaseService,
  ) {}

  // ---------------------------------------------------------------- گزارش وضعیت

  async list(): Promise<BackupListDto> {
    const settings = await this.settings.getAll();
    const directory = this.backupDirectory(settings);
    const [items, status, runs] = await Promise.all([
      this.readBundles(directory),
      this.buildStatus(settings, directory),
      this.readRuns(),
    ]);
    return { items, status, runs };
  }

  private async buildStatus(
    settings: FullSettings,
    directory: string,
  ): Promise<BackupStatusDto> {
    const [dump, restore, lastSuccess, lastFailure] = await Promise.all([
      this.detectTool(this.config.pgDumpPath),
      this.detectTool(this.config.pgRestorePath),
      this.db.queryOne<BackupRunRow>(
        `SELECT * FROM backup_runs
          WHERE operation = 'backup' AND status = 'success'
          ORDER BY created_at DESC LIMIT 1`,
      ),
      this.db.queryOne<BackupRunRow>(
        `SELECT * FROM backup_runs WHERE status = 'failed'
          ORDER BY created_at DESC LIMIT 1`,
      ),
    ]);
    return {
      pgDumpAvailable: dump.available,
      pgDumpVersion: dump.version,
      pgRestoreAvailable: restore.available,
      pgRestoreVersion: restore.version,
      directory,
      retentionCount: settings.backup.retentionCount,
      scheduledEnabled: settings.backup.scheduleEnabled && this.config.backupCronEnabled,
      scheduleTime: settings.backup.scheduleTime,
      encryptionAvailable: this.encryptionKey() !== null,
      lastSuccessAt: lastSuccess?.created_at.toISOString() ?? null,
      lastSuccessName: lastSuccess?.bundle_name ?? null,
      lastFailureAt: lastFailure?.created_at.toISOString() ?? null,
      lastFailureMessage: lastFailure?.error ?? null,
    };
  }

  private async readRuns(): Promise<BackupRunDto[]> {
    const rows = await this.db.query<BackupRunRow>(
      `SELECT r.*, u.full_name AS created_by_name
         FROM backup_runs r
         LEFT JOIN users u ON u.id = r.created_by
        ORDER BY r.created_at DESC
        LIMIT 15`,
    );
    return rows.map((row) => ({
      id: row.id,
      bundleName: row.bundle_name,
      operation: row.operation,
      trigger: row.trigger_source,
      status: row.status,
      encrypted: row.encrypted,
      includesFiles: row.includes_files,
      durationMs: row.duration_ms,
      error: row.error,
      createdBy: row.created_by_name,
      createdAt: row.created_at.toISOString(),
    }));
  }

  // ---------------------------------------------------------------- ایجاد پشتیبان

  async create(
    actor: AuditActor | null,
    trigger: 'manual' | 'scheduled' | 'pre_restore' = 'manual',
    options: BackupOptions = {},
  ): Promise<BackupBundleDto> {
    const startedAt = Date.now();
    const settings = await this.settings.getAll();
    const directory = this.backupDirectory(settings);
    const includeFiles = options.includeFiles ?? settings.backup.includeFiles;
    const name = await this.uniqueBundleName(directory);
    const staging = path.join(directory, `.tmp-${name}-${crypto.randomBytes(4).toString('hex')}`);
    const encrypted = settings.backup.encrypt;
    const key = encrypted ? this.encryptionKey() : null;

    try {
      await fs.promises.mkdir(directory, { recursive: true });
      const dump = await this.detectTool(this.config.pgDumpPath);
      if (!dump.available) {
        throw new AppException(
          ErrorCodes.PG_DUMP_MISSING,
          'ابزار pg_dump روی سرور پیدا نشد. مسیر آن را با PG_DUMP_PATH تنظیم کنید.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      if (encrypted && !key) {
        throw new AppException(
          ErrorCodes.BACKUP_ENCRYPTION_UNAVAILABLE,
          'رمزنگاری پشتیبان فعال است اما عبارت عبور (BACKUP_PASSPHRASE) روی سرور تنظیم نشده است.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      await fs.promises.mkdir(staging, { recursive: true });

      const database = await this.dumpDatabase(path.join(staging, 'database.dump'));

      let settingsEntry: ManifestEntry | null = null;
      if (settings.backup.includeSettings) {
        const exported = await this.exportSettings();
        const settingsPath = path.join(staging, 'settings.json');
        await fs.promises.writeFile(settingsPath, JSON.stringify(exported, null, 2), 'utf8');
        settingsEntry = { name: 'settings.json', size: (await fs.promises.stat(settingsPath)).size };
      }

      let files: ManifestEntry[] = [];
      if (includeFiles) {
        files = await this.copyDeviceFiles(staging);
      }

      const manifest: BackupManifest = {
        format: BACKUP_FORMAT,
        version: BACKUP_FORMAT_VERSION,
        appVersion: APP_VERSION,
        createdAt: new Date().toISOString(),
        encrypted,
        includesSettings: settings.backup.includeSettings,
        includesFiles: includeFiles,
        database,
        settings: settingsEntry,
        files,
      };

      if (key) {
        manifest.database = await this.encryptEntry(staging, manifest.database!, key);
        if (manifest.settings) {
          manifest.settings = await this.encryptEntry(staging, manifest.settings, key);
        }
        manifest.files = await Promise.all(
          manifest.files.map((entry) => this.encryptEntry(staging, entry, key)),
        );
      }

      await fs.promises.writeFile(
        path.join(staging, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf8',
      );
      const finalPath = path.join(directory, name);
      await fs.promises.rename(staging, finalPath);

      const bundle = await this.readBundle(directory, name);
      await this.recordRun({
        bundleName: name,
        operation: 'backup',
        trigger,
        status: 'success',
        encrypted,
        includesFiles: includeFiles,
        durationMs: Date.now() - startedAt,
        error: null,
        actor,
        metadata: { sizeBytes: bundle?.sizeBytes ?? 0, retentionCount: settings.backup.retentionCount },
      });
      await this.prune(directory, settings.backup.retentionCount);

      if (actor) {
        await this.audit.log({
          actor,
          action: AUDIT_ACTIONS.BACKUP_CREATED,
          entityType: 'backup',
          entityId: name,
          description: trigger === 'scheduled'
            ? 'نسخه پشتیبان خودکار ایجاد شد.'
            : 'نسخه پشتیبان ایجاد شد.',
          metadata: {
            name,
            encrypted,
            includeFiles,
            sizeBytes: bundle?.sizeBytes ?? 0,
          },
        });
      }
      return bundle ?? {
        name,
        createdAt: manifest.createdAt,
        sizeBytes: 0,
        encrypted,
        includesSettings: settings.backup.includeSettings,
        includesFiles: includeFiles,
        databaseBytes: manifest.database?.size ?? 0,
        filesCount: manifest.files.length,
        filesBytes: manifest.files.reduce((sum, file) => sum + file.size, 0),
        legacy: false,
      };
    } catch (error) {
      await fs.promises.rm(staging, { recursive: true, force: true }).catch(() => undefined);
      await this.recordRun({
        bundleName: name,
        operation: 'backup',
        trigger,
        status: 'failed',
        encrypted,
        includesFiles: includeFiles,
        durationMs: Date.now() - startedAt,
        error: (error as Error).message.slice(0, 500),
        actor,
        metadata: null,
      }).catch(() => undefined);
      if (actor) {
        await this.audit
          .log({
            actor,
            action: AUDIT_ACTIONS.BACKUP_FAILED,
            entityType: 'backup',
            entityId: name,
            description: 'ایجاد نسخه پشتیبان ناموفق بود.',
            metadata: { error: (error as Error).message.slice(0, 500) },
          })
          .catch(() => undefined);
      }
      if (error instanceof AppException) throw error;
      throw new AppException(
        ErrorCodes.BACKUP_FAILED,
        'ایجاد نسخه پشتیبان ناموفق بود. دسترسی پوشه و تنظیمات پایگاه داده را بررسی کنید.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async dumpDatabase(target: string): Promise<ManifestEntry> {
    await execFileAsync(
      this.config.pgDumpPath,
      ['--format=custom', '--no-owner', '--file', target, this.config.databaseUrl],
      { timeout: 30 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 },
    );
    const stats = await fs.promises.stat(target);
    return {
      name: 'database.dump',
      size: stats.size,
      sha256: await this.hashFile(target),
    };
  }

  private async exportSettings(): Promise<SettingsExport> {
    const [settingsRows, fields, options] = await Promise.all([
      this.db.query<{ key: string; value: unknown }>('SELECT key, value FROM app_settings'),
      this.db.query<Record<string, unknown>>(
        `SELECT entity, field_key, label_fa, field_type, group_name, placeholder, is_system,
                is_enabled, is_required, is_locked, options, sort_order, is_searchable, is_reportable
           FROM field_definitions ORDER BY entity, sort_order, created_at`,
      ),
      this.db.query<Record<string, unknown>>(
        `SELECT category, value_key, label_fa, sort_order, is_active, is_system
           FROM option_lists ORDER BY category, sort_order`,
      ),
    ]);
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      appSettings: Object.fromEntries(settingsRows.map((row) => [row.key, row.value])),
      fieldDefinitions: fields,
      optionLists: options,
    };
  }

  /** کپی فایل‌های دستگاه‌ها (تصاویر و پیوست‌های ذخیره‌شده روی سرور) داخل بسته پشتیبان */
  private async copyDeviceFiles(staging: string): Promise<ManifestEntry[]> {
    const uploads = this.config.uploadsDir;
    if (!fs.existsSync(uploads)) return [];
    const target = path.join(staging, 'uploads');
    await fs.promises.cp(uploads, target, { recursive: true, force: true });
    const entries: ManifestEntry[] = [];
    const walk = async (directory: string): Promise<void> => {
      const items = await fs.promises.readdir(directory, { withFileTypes: true });
      for (const item of items) {
        const absolute = path.join(directory, item.name);
        if (item.isDirectory()) {
          await walk(absolute);
          continue;
        }
        if (!item.isFile()) continue;
        const relative = path.relative(staging, absolute).split(path.sep).join('/');
        const stats = await fs.promises.stat(absolute);
        entries.push({
          name: relative,
          size: stats.size,
          sha256: await this.hashFile(absolute),
        });
      }
    };
    await walk(target);
    return entries;
  }

  // ---------------------------------------------------------------- رمزنگاری

  private encryptionKey(): Buffer | null {
    if (!this.config.backupPassphrase) return null;
    return crypto.scryptSync(this.config.backupPassphrase, ENCRYPTION_SALT, 32);
  }

  private async encryptEntry(
    directory: string,
    entry: ManifestEntry,
    key: Buffer,
  ): Promise<ManifestEntry> {
    const source = path.join(directory, entry.name);
    const target = `${source}.enc`;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const hash = crypto.createHash('sha256');
    let size = 0;
    await pipeline(
      fs.createReadStream(source),
      new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          hash.update(chunk);
          size += chunk.length;
          callback(null, chunk);
        },
      }),
      cipher,
      fs.createWriteStream(target),
    );
    await fs.promises.rm(source, { force: true });
    return {
      name: `${entry.name}.enc`,
      size: (await fs.promises.stat(target)).size,
      sha256: hash.digest('hex'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    };
  }

  private async decryptTo(
    bundlePath: string,
    entry: ManifestEntry,
    target: string,
    key: Buffer,
  ): Promise<void> {
    if (!entry.iv || !entry.tag) {
      throw new AppException(
        ErrorCodes.BACKUP_INVALID,
        'اطلاعات رمزنگاری نسخه پشتیبان کامل نیست.',
        HttpStatus.CONFLICT,
      );
    }
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(entry.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(entry.tag, 'base64'));
    try {
      await pipeline(
        fs.createReadStream(path.join(bundlePath, entry.name)),
        decipher,
        fs.createWriteStream(target),
      );
    } catch {
      throw new AppException(
        ErrorCodes.BACKUP_INVALID,
        'رمزگشایی نسخه پشتیبان ناموفق بود؛ عبارت عبور BACKUP_PASSPHRASE صحیح نیست.',
        HttpStatus.CONFLICT,
      );
    }
  }

  private async readManifest(bundlePath: string): Promise<BackupManifest> {
    const manifestPath = path.join(bundlePath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new AppException(
        ErrorCodes.BACKUP_INVALID,
        'ساختار نسخه پشتیبان معتبر نیست (manifest.json پیدا نشد).',
        HttpStatus.CONFLICT,
      );
    }
    const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8')) as BackupManifest;
    if (manifest.format !== BACKUP_FORMAT) {
      throw new AppException(
        ErrorCodes.BACKUP_INVALID,
        'ساختار نسخه پشتیبان معتبر نیست.',
        HttpStatus.CONFLICT,
      );
    }
    if (manifest.version > BACKUP_FORMAT_VERSION) {
      throw new AppException(
        ErrorCodes.BACKUP_INVALID,
        'این نسخه پشتیبان با نسخه جدیدتری از نرم‌افزار ساخته شده است.',
        HttpStatus.CONFLICT,
      );
    }
    return manifest;
  }

  // ---------------------------------------------------------------- فهرست و دانلود

  private backupDirectory(settings: FullSettings): string {
    const custom = settings.backup.directory.trim();
    return custom ? path.resolve(custom) : this.config.backupDir;
  }

  private async uniqueBundleName(directory: string): Promise<string> {
    const base = `backup-${timestampForFileName()}`;
    let name = base;
    let suffix = 1;
    while (fs.existsSync(path.join(directory, name)) || fs.existsSync(path.join(directory, `${name}.dump`))) {
      name = `${base}-${suffix}`;
      suffix += 1;
    }
    return name;
  }

  private async readBundles(directory: string): Promise<BackupBundleDto[]> {
    try {
      await fs.promises.mkdir(directory, { recursive: true });
    } catch {
      // مسیر تنظیم‌شده در دسترس نیست؛ فهرست خالی برگردانده می‌شود تا وضعیت خطا نمایش داده شود
      return [];
    }
    const names = await fs.promises.readdir(directory).catch(() => [] as string[]);
    const bundles: BackupBundleDto[] = [];
    for (const name of names) {
      if (LEGACY_NAME_PATTERN.test(name)) {
        const stats = await fs.promises.stat(path.join(directory, name)).catch(() => null);
        if (!stats) continue;
        bundles.push({
          name,
          createdAt: stats.mtime.toISOString(),
          sizeBytes: stats.size,
          encrypted: false,
          includesSettings: false,
          includesFiles: false,
          databaseBytes: stats.size,
          filesCount: 0,
          filesBytes: 0,
          legacy: true,
        });
        continue;
      }
      if (!BUNDLE_NAME_PATTERN.test(name)) continue;
      const bundle = await this.readBundle(directory, name);
      if (bundle) bundles.push(bundle);
    }
    return bundles.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private async readBundle(directory: string, name: string): Promise<BackupBundleDto | null> {
    const bundlePath = path.join(directory, name);
    try {
      const manifest = await this.readManifest(bundlePath);
      let sizeBytes = 0;
      const walk = async (target: string): Promise<void> => {
        const stats = await fs.promises.stat(target);
        if (stats.isDirectory()) {
          const children = await fs.promises.readdir(target);
          for (const child of children) await walk(path.join(target, child));
          return;
        }
        sizeBytes += stats.size;
      };
      await walk(bundlePath);
      return {
        name,
        createdAt: manifest.createdAt,
        sizeBytes,
        encrypted: manifest.encrypted,
        includesSettings: manifest.includesSettings,
        includesFiles: manifest.includesFiles,
        databaseBytes: manifest.database?.size ?? 0,
        filesCount: manifest.files.length,
        filesBytes: manifest.files.reduce((sum, file) => sum + file.size, 0),
        legacy: false,
      };
    } catch {
      return null;
    }
  }

  async resolveDownload(
    name: string,
    file: DownloadableFile,
    actor: AuditActor,
  ): Promise<{ streamPath: string; fileName: string; encrypted: boolean }> {
    const settings = await this.settings.getAll();
    const directory = this.backupDirectory(settings);
    if (LEGACY_NAME_PATTERN.test(name)) {
      if (file !== 'database') {
        throw new AppException(ErrorCodes.NOT_FOUND, 'فایل پشتیبان پیدا نشد.', HttpStatus.NOT_FOUND);
      }
      const legacy = path.join(directory, name);
      if (!fs.existsSync(legacy)) {
        throw new AppException(ErrorCodes.NOT_FOUND, 'فایل پشتیبان پیدا نشد.', HttpStatus.NOT_FOUND);
      }
      await this.logDownload(name, actor);
      return { streamPath: legacy, fileName: name, encrypted: false };
    }
    if (!BUNDLE_NAME_PATTERN.test(name)) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'فایل پشتیبان پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    const bundlePath = path.join(directory, name);
    const manifest = await this.readManifest(bundlePath);
    const entry =
      file === 'database' ? manifest.database : file === 'settings' ? manifest.settings : null;
    if (file === 'manifest') {
      await this.logDownload(name, actor);
      return {
        streamPath: path.join(bundlePath, 'manifest.json'),
        fileName: `${name}-manifest.json`,
        encrypted: false,
      };
    }
    if (!entry) {
      throw new AppException(
        ErrorCodes.NOT_FOUND,
        'این فایل در نسخه پشتیبان موجود نیست.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (entry.name.endsWith('.enc')) {
      throw new AppException(
        ErrorCodes.BACKUP_ENCRYPTED,
        'این نسخه پشتیبان رمزنگاری شده است؛ دانلود مستقیم امکان ندارد. برای بازیابی از همان سرور استفاده کنید یا پوشه پشتیبان را کپی کنید.',
        HttpStatus.CONFLICT,
      );
    }
    await this.logDownload(name, actor);
    return {
      streamPath: path.join(bundlePath, entry.name),
      fileName: file === 'settings' ? `${name}-settings.json` : `${name}-database.dump`,
      encrypted: false,
    };
  }

  private async logDownload(name: string, actor: AuditActor): Promise<void> {
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.BACKUP_DOWNLOADED,
      entityType: 'backup',
      entityId: name,
      description: 'نسخه پشتیبان دانلود شد.',
    });
  }

  // ---------------------------------------------------------------- بازیابی

  async restore(
    name: string,
    actor: AuditActor,
    options: { restoreDatabase?: boolean; restoreSettings?: boolean; restoreFiles?: boolean } = {},
  ): Promise<RestoreResultDto> {
    const startedAt = Date.now();
    const restoreDatabase = options.restoreDatabase ?? true;
    const restoreSettings = options.restoreSettings ?? true;
    const restoreFiles = options.restoreFiles ?? false;

    if (!BUNDLE_NAME_PATTERN.test(name)) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'نسخه پشتیبان پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    const settings = await this.settings.getAll();
    const directory = this.backupDirectory(settings);
    const bundlePath = path.join(directory, name);
    if (!fs.existsSync(bundlePath)) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'نسخه پشتیبان پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    const manifest = await this.readManifest(bundlePath);
    const key = manifest.encrypted ? this.encryptionKey() : null;
    if (manifest.encrypted && !key) {
      throw new AppException(
        ErrorCodes.BACKUP_ENCRYPTION_UNAVAILABLE,
        'این نسخه پشتیبان رمزنگاری شده است و عبارت عبور BACKUP_PASSPHRASE روی سرور تنظیم نشده است.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const safety = await this.create(actor, 'pre_restore').catch((error: Error) => {
      throw new AppException(
        ErrorCodes.BACKUP_FAILED,
        `پیش از بازیابی، تهیه نسخه پشتیبان ایمن ناموفق بود و بازیابی متوقف شد: ${error.message}`,
        HttpStatus.CONFLICT,
      );
    });

    const tempFiles: string[] = [];
    let databaseRestored = false;
    let settingsRestored = false;
    let filesRestored = 0;
    let filesSkipped = 0;

    try {
      if (restoreDatabase) {
        if (!manifest.database) {
          throw new AppException(
            ErrorCodes.BACKUP_INVALID,
            'داده پایگاه داده در این نسخه پشتیبان موجود نیست.',
            HttpStatus.CONFLICT,
          );
        }
        const restoreTool = await this.detectTool(this.config.pgRestorePath);
        if (!restoreTool.available) {
          throw new AppException(
            ErrorCodes.PG_RESTORE_MISSING,
            'ابزار pg_restore روی سرور پیدا نشد. مسیر آن را با PG_RESTORE_PATH تنظیم کنید.',
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }
        const dumpPath = path.join(bundlePath, `.restore-${crypto.randomBytes(6).toString('hex')}.dump`);
        tempFiles.push(dumpPath);
        if (key) {
          await this.decryptTo(bundlePath, manifest.database, dumpPath, key);
        } else {
          await fs.promises.copyFile(path.join(bundlePath, manifest.database.name), dumpPath);
        }
        await execFileAsync(
          this.config.pgRestorePath,
          ['--clean', '--if-exists', '--no-owner', '--single-transaction', '--dbname', this.config.databaseUrl, dumpPath],
          { timeout: 30 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 },
        );
        databaseRestored = true;
      }

      if (restoreSettings && manifest.settings) {
        let raw: string;
        if (key) {
          const temp = path.join(bundlePath, `.restore-${crypto.randomBytes(6).toString('hex')}.json`);
          tempFiles.push(temp);
          await this.decryptTo(bundlePath, manifest.settings, temp, key);
          raw = await fs.promises.readFile(temp, 'utf8');
        } else {
          raw = await fs.promises.readFile(path.join(bundlePath, manifest.settings.name), 'utf8');
        }
        const exported = JSON.parse(raw) as SettingsExport;
        await this.restoreSettings(exported);
        settingsRestored = true;
      }

      if (restoreFiles && manifest.files.length > 0) {
        const uploadsRoot = path.resolve(this.config.uploadsDir);
        for (const entry of manifest.files) {
          const relative = entry.name.replace(/^uploads[\\/]/, '');
          const target = path.resolve(uploadsRoot, relative);
          if (!target.startsWith(`${uploadsRoot}${path.sep}`) || relative.includes('..')) {
            filesSkipped += 1;
            continue;
          }
          if (fs.existsSync(target)) {
            filesSkipped += 1;
            continue;
          }
          await fs.promises.mkdir(path.dirname(target), { recursive: true });
          if (key) {
            await this.decryptTo(bundlePath, entry, target, key);
          } else {
            await fs.promises.copyFile(path.join(bundlePath, entry.name), target);
          }
          filesRestored += 1;
        }
      }

      await this.recordRun({
        bundleName: name,
        operation: 'restore',
        trigger: 'manual',
        status: 'success',
        encrypted: manifest.encrypted,
        includesFiles: restoreFiles,
        durationMs: Date.now() - startedAt,
        error: null,
        actor,
        metadata: {
          restoreDatabase,
          restoreSettings,
          restoreFiles,
          filesRestored,
          filesSkipped,
          safetyBackup: safety.name,
        },
      });
      await this.audit.log({
        actor,
        action: AUDIT_ACTIONS.BACKUP_RESTORED,
        entityType: 'backup',
        entityId: name,
        description: 'نسخه پشتیبان بازیابی شد.',
        metadata: { restoreDatabase, restoreSettings, restoreFiles, safetyBackup: safety.name },
      });

      return {
        bundleName: name,
        restoredAt: new Date().toISOString(),
        database: databaseRestored,
        settingsRestored,
        filesRestored,
        filesSkipped,
        safetyBackup: safety.name,
      };
    } catch (error) {
      await this.recordRun({
        bundleName: name,
        operation: 'restore',
        trigger: 'manual',
        status: 'failed',
        encrypted: manifest.encrypted,
        includesFiles: restoreFiles,
        durationMs: Date.now() - startedAt,
        error: (error as Error).message.slice(0, 500),
        actor,
        metadata: { restoreDatabase, restoreSettings, restoreFiles },
      }).catch(() => undefined);
      await this.audit
        .log({
          actor,
          action: AUDIT_ACTIONS.BACKUP_RESTORE_FAILED,
          entityType: 'backup',
          entityId: name,
          description: 'بازیابی نسخه پشتیبان ناموفق بود.',
          metadata: { error: (error as Error).message.slice(0, 500) },
        })
        .catch(() => undefined);
      if (error instanceof AppException) throw error;
      throw new AppException(
        ErrorCodes.BACKUP_FAILED,
        `بازیابی ناموفق بود: ${(error as Error).message.slice(0, 300)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } finally {
      await Promise.all(tempFiles.map((file) => fs.promises.rm(file, { force: true })));
    }
  }

  private async restoreSettings(exported: SettingsExport): Promise<void> {
    await this.db.withTransaction(async (client) => {
      for (const [key, value] of Object.entries(exported.appSettings ?? {})) {
        await client.query(
          `INSERT INTO app_settings (key, value, updated_at)
           VALUES ($1, $2::jsonb, now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
          [key, JSON.stringify(value)],
        );
      }
      for (const field of exported.fieldDefinitions ?? []) {
        await client.query(
          `INSERT INTO field_definitions
             (entity, field_key, label_fa, field_type, group_name, placeholder, is_system,
              is_enabled, is_required, is_locked, options, sort_order, is_searchable, is_reportable)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14)
           ON CONFLICT (entity, field_key) DO UPDATE SET
             label_fa = EXCLUDED.label_fa,
             group_name = EXCLUDED.group_name,
             placeholder = EXCLUDED.placeholder,
             is_enabled = EXCLUDED.is_enabled,
             is_required = EXCLUDED.is_required,
             options = EXCLUDED.options,
             sort_order = EXCLUDED.sort_order,
             is_searchable = EXCLUDED.is_searchable,
             is_reportable = EXCLUDED.is_reportable,
             updated_at = now()`,
          [
            field.entity ?? 'device',
            field.field_key,
            field.label_fa,
            field.field_type,
            field.group_name,
            field.placeholder,
            field.is_system ?? false,
            field.is_enabled ?? true,
            field.is_required ?? false,
            field.is_locked ?? false,
            JSON.stringify(field.options ?? []),
            field.sort_order ?? 0,
            field.is_searchable ?? true,
            field.is_reportable ?? true,
          ],
        );
      }
      for (const option of exported.optionLists ?? []) {
        await client.query(
          `INSERT INTO option_lists (category, value_key, label_fa, sort_order, is_active, is_system)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (category, value_key) DO UPDATE SET
             label_fa = EXCLUDED.label_fa,
             sort_order = EXCLUDED.sort_order,
             is_active = EXCLUDED.is_active,
             updated_at = now()`,
          [
            option.category,
            option.value_key,
            option.label_fa,
            option.sort_order ?? 0,
            option.is_active ?? true,
            option.is_system ?? false,
          ],
        );
      }
    });
  }

  // ---------------------------------------------------------------- پشتیبان خودکار

  @Interval(60_000)
  async scheduledTick(): Promise<void> {
    if (this.scheduledRunning || !this.config.backupCronEnabled) return;
    this.scheduledRunning = true;
    try {
      const settings = await this.settings.getAll();
      if (!settings.backup.scheduleEnabled) return;
      if (!this.isWithinScheduleWindow(settings)) return;
      const latest = await this.db.queryOne<{ created_at: Date }>(
        `SELECT created_at FROM backup_runs
          WHERE trigger_source = 'scheduled'
          ORDER BY created_at DESC LIMIT 1`,
      );
      const today = this.localDayKey(new Date(), settings.appearance.timezone);
      if (latest && this.localDayKey(latest.created_at, settings.appearance.timezone) === today) {
        return;
      }
      const file = await this.create(null, 'scheduled');
      this.logger.log(`پشتیبان‌گیری خودکار انجام شد: ${file.name}`);
    } catch (error) {
      this.logger.error(`پشتیبان‌گیری خودکار ناموفق بود: ${(error as Error).message}`);
    } finally {
      this.scheduledRunning = false;
    }
  }

  private isWithinScheduleWindow(settings: FullSettings): boolean {
    const match = settings.backup.scheduleTime.match(/^(\d{2}):(\d{2})$/);
    if (!match) return false;
    const now = this.localClock(new Date(), settings.appearance.timezone);
    const target = Number(match[1]) * 60 + Number(match[2]);
    const current = now.hour * 60 + now.minute;
    return current >= target && current <= target + MAX_SCHEDULE_WINDOW_MINUTES;
  }

  private localClock(date: Date, timeZone: string): { hour: number; minute: number } {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    return {
      hour: Number(parts.find((part) => part.type === 'hour')?.value ?? 0),
      minute: Number(parts.find((part) => part.type === 'minute')?.value ?? 0),
    };
  }

  private localDayKey(date: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  // ---------------------------------------------------------------- ابزارهای کمکی

  private async recordRun(input: {
    bundleName: string;
    operation: 'backup' | 'restore';
    trigger: 'manual' | 'scheduled' | 'pre_restore';
    status: 'success' | 'failed';
    encrypted: boolean;
    includesFiles: boolean;
    durationMs: number;
    error: string | null;
    actor: AuditActor | null;
    metadata: Record<string, unknown> | null;
  }): Promise<void> {
    const params = [
      input.bundleName,
      input.operation,
      input.trigger,
      input.status,
      input.encrypted,
      input.includesFiles,
      input.durationMs,
      input.error,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.actor?.id ?? null,
    ];
    const sql = `INSERT INTO backup_runs
         (bundle_name, operation, trigger_source, status, encrypted, includes_files,
          duration_ms, error, metadata, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)`;
    try {
      await this.db.query(sql, params);
    } catch (error) {
      // اگر نسخه پشتیبان قدیمی‌تری بازیابی شده باشد، جدول تاریخچه ممکن است وجود نداشته باشد
      if ((error as { code?: string }).code !== '42P01') throw error;
      await this.ensureRunTable();
      await this.db.query(sql, params);
    }
  }

  /** ساخت دوباره جدول تاریخچه پس از بازیابی نسخه‌های قدیمی (پیش از اجرای مهاجرت جدید) */
  private async ensureRunTable(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS backup_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        bundle_name text NOT NULL,
        operation text NOT NULL DEFAULT 'backup',
        trigger_source text NOT NULL DEFAULT 'manual',
        status text NOT NULL,
        encrypted boolean NOT NULL DEFAULT false,
        includes_files boolean NOT NULL DEFAULT false,
        duration_ms integer,
        error text,
        metadata jsonb,
        created_by uuid REFERENCES users (id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS backup_runs_created_idx ON backup_runs (created_at DESC);
    `);
  }

  private async prune(directory: string, retentionCount: number): Promise<void> {
    const bundles = (await this.readBundles(directory)).filter((bundle) => !bundle.legacy);
    const limit = Math.max(1, retentionCount);
    for (const bundle of bundles.slice(limit)) {
      await fs.promises
        .rm(path.join(directory, bundle.name), { recursive: true, force: true })
        .catch(() => undefined);
    }
  }

  private async hashFile(filePath: string): Promise<string> {
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(filePath)) {
      hash.update(chunk as Buffer);
    }
    return hash.digest('hex');
  }

  private async detectTool(
    command: string,
  ): Promise<{ available: boolean; version: string | null }> {
    try {
      const { stdout } = await execFileAsync(command, ['--version'], { timeout: 5_000 });
      return { available: true, version: stdout.trim() || null };
    } catch {
      return { available: false, version: null };
    }
  }
}
