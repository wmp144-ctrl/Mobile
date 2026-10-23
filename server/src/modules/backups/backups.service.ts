import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { AppException, ErrorCodes } from '../../common/errors/app.exception';
import { timestampForFileName } from '../../common/utils/dates';
import { AuditService, type AuditActor } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { SettingsService } from '../settings/settings.service';

const execFileAsync = promisify(execFile);
const BACKUP_NAME_PATTERN = /^backup-\d{8}-\d{6}(-\d+)?\.dump$/;

export interface BackupFileDto {
  name: string;
  sizeBytes: number;
  createdAt: string;
}

export interface BackupStatusDto {
  pgDumpAvailable: boolean;
  pgDumpVersion: string | null;
  directory: string;
  retentionCount: number;
  scheduledEnabled: boolean;
}

export interface BackupListDto {
  items: BackupFileDto[];
  status: BackupStatusDto;
}

@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<BackupListDto> {
    const files = await this.readFiles();
    const [status, settings] = await Promise.all([this.detectPgDump(), this.settings.getAll()]);
    return {
      items: files,
      status: {
        ...status,
        directory: this.config.backupDir,
        retentionCount: settings.backup.retentionCount,
        scheduledEnabled: this.config.backupCronEnabled,
      },
    };
  }

  async create(actor: AuditActor | null): Promise<BackupFileDto> {
    await fs.promises.mkdir(this.config.backupDir, { recursive: true });
    const pgDump = await this.detectPgDump();
    if (!pgDump.pgDumpAvailable) {
      throw new AppException(
        ErrorCodes.PG_DUMP_MISSING,
        'ابزار pg_dump روی سرور پیدا نشد. مسیر آن را با PG_DUMP_PATH تنظیم کنید.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const baseName = `backup-${timestampForFileName()}`;
    let name = `${baseName}.dump`;
    let suffix = 1;
    while (fs.existsSync(path.join(this.config.backupDir, name))) {
      name = `${baseName}-${suffix}.dump`;
      suffix += 1;
    }
    const filePath = path.join(this.config.backupDir, name);

    try {
      await execFileAsync(
        this.config.pgDumpPath,
        ['--format=custom', '--no-owner', '--file', filePath, this.config.databaseUrl],
        { timeout: 10 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 },
      );
    } catch (error) {
      await fs.promises.rm(filePath, { force: true }).catch(() => undefined);
      if (actor) {
        await this.audit.log({
          actor,
          action: AUDIT_ACTIONS.BACKUP_FAILED,
          entityType: 'backup',
          description: 'ایجاد نسخه پشتیبان پایگاه داده ناموفق بود.',
          metadata: { error: (error as Error).message.slice(0, 500) },
        });
      }
      throw new AppException(
        ErrorCodes.BACKUP_FAILED,
        'ایجاد نسخه پشتیبان ناموفق بود. دسترسی پوشه و تنظیمات پایگاه داده را بررسی کنید.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const file = await this.statFile(name);
    const settings = await this.settings.getAll();
    await this.prune(settings.backup.retentionCount);
    if (actor) {
      await this.audit.log({
        actor,
        action: AUDIT_ACTIONS.BACKUP_CREATED,
        entityType: 'backup',
        entityId: name,
        description: 'نسخه پشتیبان پایگاه داده ایجاد شد.',
        metadata: { name, sizeBytes: file?.sizeBytes ?? 0 },
      });
    }
    return file ?? { name, sizeBytes: 0, createdAt: new Date().toISOString() };
  }

  async resolveDownload(name: string, actor: AuditActor): Promise<{ filePath: string; fileName: string }> {
    if (!BACKUP_NAME_PATTERN.test(name)) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'فایل پشتیبان پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    const filePath = path.join(this.config.backupDir, name);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(`${path.resolve(this.config.backupDir)}${path.sep}`)) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'فایل پشتیبان پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    if (!fs.existsSync(resolved)) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'فایل پشتیبان پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.BACKUP_DOWNLOADED,
      entityType: 'backup',
      entityId: name,
      description: 'نسخه پشتیبان دانلود شد.',
    });
    return { filePath: resolved, fileName: name };
  }

  @Cron('0 3 * * *', { name: 'daily-database-backup' })
  async scheduledBackup(): Promise<void> {
    if (!this.config.backupCronEnabled) return;
    try {
      const file = await this.create(null);
      this.logger.log(`پشتیبان‌گیری خودکار انجام شد: ${file.name}`);
    } catch (error) {
      this.logger.error(`پشتیبان‌گیری خودکار ناموفق بود: ${(error as Error).message}`);
    }
  }

  private async readFiles(): Promise<BackupFileDto[]> {
    await fs.promises.mkdir(this.config.backupDir, { recursive: true });
    const names = await fs.promises.readdir(this.config.backupDir);
    const files = await Promise.all(
      names
        .filter((name) => BACKUP_NAME_PATTERN.test(name))
        .map((name) => this.statFile(name)),
    );
    return files
      .filter((file): file is BackupFileDto => file !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private async statFile(name: string): Promise<BackupFileDto | null> {
    try {
      const stats = await fs.promises.stat(path.join(this.config.backupDir, name));
      return { name, sizeBytes: stats.size, createdAt: stats.mtime.toISOString() };
    } catch {
      return null;
    }
  }

  /** نگهداری فقط تعداد تعیین‌شده از جدیدترین نسخه‌ها */
  private async prune(retentionCount: number): Promise<void> {
    const files = await this.readFiles();
    const limit = Math.max(1, retentionCount);
    await Promise.all(
      files.slice(limit).map((file) =>
        fs.promises.rm(path.join(this.config.backupDir, file.name), { force: true }),
      ),
    );
  }

  private async detectPgDump(): Promise<{ pgDumpAvailable: boolean; pgDumpVersion: string | null }> {
    try {
      const { stdout } = await execFileAsync(this.config.pgDumpPath, ['--version'], {
        timeout: 5_000,
      });
      return { pgDumpAvailable: true, pgDumpVersion: stdout.trim() || null };
    } catch {
      return { pgDumpAvailable: false, pgDumpVersion: null };
    }
  }
}
