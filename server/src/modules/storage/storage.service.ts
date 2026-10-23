import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import * as crypto from 'node:crypto';
import type { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { AppException, ErrorCodes } from '../../common/errors/app.exception';
import { jalaliYear } from '../../common/utils/jalali';
import { AuditService, type AuditActor } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { SettingsService } from '../settings/settings.service';
import type { UpdateSettingsDto } from '../settings/settings.dto';
import type {
  CreateStorageLocationDto,
  StorageConfigDto,
  UpdateStorageLocationDto,
} from './storage.dto';
import { StorageRepository, type StorageCheckResult } from './storage.repository';
import {
  toStorageFile,
  toStorageLocation,
  type DeviceStorageSummaryDto,
  type OpenTicketDto,
  type OpenTicketResultDto,
  type StorageFileDto,
  type StorageFilePage,
  type StorageFolderPreviewDto,
  type StorageHealthDto,
  type StorageLocationDto,
  type StorageLocationRow,
} from './storage.types';

const HEALTH_TIMEOUT_MS = 3_000;
const DEFAULT_SUBFOLDERS = ['Original', 'Backup', 'Recovered', 'Reports', 'Images', 'Documents'];
const TICKET_TTL_MS = 60_000;

interface DeviceFolderTarget {
  id: string;
  intakeCode: string;
  receivedAt: Date;
}

function clean(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** حذف جداکننده انتهایی مسیر بدون آسیب به ریشه درایو یا اشتراک شبکه */
export function normalizeRootPath(input: string): string {
  const trimmed = input.trim().replace(/\0/g, '');
  if (/^[A-Za-z]:$/.test(trimmed)) return `${trimmed}\\`;
  if (/^[A-Za-z]:[\\/]$/.test(trimmed)) return trimmed.replace('/', '\\');
  if (/^\\\\[^\\]+\\[^\\]+\\$/.test(trimmed)) return trimmed.slice(0, -1);
  return trimmed.replace(/[\\/]+$/, '');
}

function isWindowsPath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');
}

export function joinStoragePath(root: string, segments: string[]): string {
  return isWindowsPath(root) ? path.win32.join(root, ...segments) : path.posix.join(root, ...segments);
}

export function splitRelativePath(value: string): string[] {
  return value
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function sanitizeSegment(segment: string): string {
  const value = segment.trim();
  if (!value || value === '.' || value === '..') {
    throw new AppException(
      ErrorCodes.VALIDATION_ERROR,
      'ساختار پوشه شامل بخش غیرمجاز است.',
      HttpStatus.BAD_REQUEST,
    );
  }
  if (/[<>:"|?*\u0000-\u001F]/.test(value) || value.includes('..')) {
    throw new AppException(
      ErrorCodes.VALIDATION_ERROR,
      'نام پوشه شامل نویسه غیرمجاز است.',
      HttpStatus.BAD_REQUEST,
    );
  }
  return value;
}

/** محاسبه حجم پوشه با محدودیت عمق و تعداد برای جلوگیری از کندی مسیرهای شبکه */
async function directorySize(target: string, depth = 0, counter = { entries: 0 }): Promise<number> {
  if (depth > 8 || counter.entries > 5_000) return 0;
  let total = 0;
  let entries: Dirent[];
  try {
    entries = await fs.readdir(target, { withFileTypes: true, encoding: 'utf8' });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    counter.entries += 1;
    if (counter.entries > 5_000) break;
    const full = path.join(target, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      total += await directorySize(full, depth + 1, counter);
    } else if (entry.isFile()) {
      try {
        const stat = await fs.stat(full);
        total += stat.size;
      } catch {
        /* فایل در حال حذف یا بدون دسترسی */
      }
    }
  }
  return total;
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`پاسخی از ${label} در زمان مجاز دریافت نشد.`)),
      HEALTH_TIMEOUT_MS,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function storageKindFor(kind: string): string {
  if (kind === 'nas') return 'network';
  if (kind === 'external') return 'external';
  return 'local';
}

function ticketHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private ensuringDefault: Promise<void> | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly repo: StorageRepository,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /** ایجاد محل پیش‌فرض از STORAGE_ROOT در اولین اجرا */
  async ensureDefaultLocation(): Promise<void> {
    if (this.ensuringDefault) return this.ensuringDefault;
    this.ensuringDefault = (async () => {
      const count = await this.repo.countLocations();
      if (count > 0) {
        const current = await this.repo.findDefaultLocation();
        if (!current) await this.repo.promoteFirstDefault();
        return;
      }
      await this.repo.createLocation(
        {
          name: 'حافظه اصلی سرور',
          rootPath: normalizeRootPath(this.config.storageRoot),
          clientRoot: null,
          kind: 'server',
          driveLetter: null,
          volumeLabel: null,
          volumeId: null,
          hostName: null,
          notes: 'این محل به‌صورت خودکار از مسیر STORAGE_ROOT ساخته شده است.',
          isDefault: true,
          isActive: true,
        },
        null,
      );
    })().finally(() => {
      this.ensuringDefault = null;
    });
    return this.ensuringDefault;
  }

  async listLocations(includeInactive = false): Promise<StorageLocationDto[]> {
    await this.ensureDefaultLocation();
    const rows = await this.repo.listLocations(includeInactive);
    const settings = await this.settings.getAll();
    return Promise.all(
      rows.map(async (row) => {
        const health = await this.checkAndSave(row, settings.storage.lowSpaceGb);
        return toStorageLocation(row, health);
      }),
    );
  }

  async getLocation(id: string, actor?: AuditActor): Promise<StorageLocationDto> {
    const row = await this.requireLocation(id);
    const settings = await this.settings.getAll();
    const health = await this.checkAndSave(row, settings.storage.lowSpaceGb);
    if (actor) {
      await this.audit.log({
        actor,
        action: AUDIT_ACTIONS.STORAGE_LOCATION_CHECKED,
        entityType: 'storage_location',
        entityId: id,
        description: `سلامت محل ذخیره‌سازی «${row.name}» بررسی شد.`,
        metadata: { available: health.available, error: health.error },
      });
    }
    return toStorageLocation(row, health);
  }

  async createLocation(
    dto: CreateStorageLocationDto,
    actor: AuditActor,
  ): Promise<StorageLocationDto> {
    const rootPath = normalizeRootPath(dto.rootPath);
    if (!rootPath || rootPath.includes('\0')) {
      throw new AppException(
        ErrorCodes.VALIDATION_ERROR,
        'مسیر ریشه محل ذخیره‌سازی معتبر نیست.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const existing = await this.repo.listLocations(true);
    if (existing.some((item) => item.root_path.toLowerCase() === rootPath.toLowerCase())) {
      throw new AppException(
        ErrorCodes.DUPLICATE,
        'محل ذخیره‌سازی دیگری با همین مسیر ریشه ثبت شده است.',
        HttpStatus.CONFLICT,
      );
    }

    const created = await this.repo.createLocation(
      {
        name: dto.name.trim(),
        rootPath,
        clientRoot: clean(dto.clientRoot),
        kind: dto.kind ?? 'server',
        driveLetter: clean(dto.driveLetter),
        volumeLabel: clean(dto.volumeLabel),
        volumeId: clean(dto.volumeId),
        hostName: clean(dto.hostName),
        notes: clean(dto.notes),
        isDefault: dto.isDefault ?? existing.length === 0,
        isActive: dto.isActive ?? true,
      },
      actor.id,
    );
    if (!created) {
      throw new AppException(
        ErrorCodes.INTERNAL,
        'ایجاد محل ذخیره‌سازی ناموفق بود.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.STORAGE_LOCATION_CREATED,
      entityType: 'storage_location',
      entityId: created.id,
      description: `محل ذخیره‌سازی «${created.name}» با مسیر ${created.root_path} ثبت شد.`,
      metadata: { rootPath, isDefault: created.is_default },
    });
    return this.getLocation(created.id);
  }

  async updateLocation(
    id: string,
    dto: UpdateStorageLocationDto,
    actor: AuditActor,
  ): Promise<StorageLocationDto> {
    const existing = await this.requireLocation(id);
    if (dto.isDefault === false && existing.is_default) {
      throw new AppException(
        ErrorCodes.VALIDATION_ERROR,
        'برای برداشتن پیش‌فرض، محل ذخیره‌سازی دیگری را پیش‌فرض کنید.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.isActive === false && existing.is_default) {
      throw new AppException(
        ErrorCodes.VALIDATION_ERROR,
        'محل ذخیره‌سازی پیش‌فرض را نمی‌توان غیرفعال کرد.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.rootPath !== undefined) {
      const rootPath = normalizeRootPath(dto.rootPath);
      if (!rootPath || rootPath.includes('\0')) {
        throw new AppException(
          ErrorCodes.VALIDATION_ERROR,
          'مسیر ریشه محل ذخیره‌سازی معتبر نیست.',
          HttpStatus.BAD_REQUEST,
        );
      }
      const others = await this.repo.listLocations(true);
      if (
        others.some(
          (item) =>
            item.id !== id && item.root_path.toLowerCase() === rootPath.toLowerCase(),
        )
      ) {
        throw new AppException(
          ErrorCodes.DUPLICATE,
          'محل ذخیره‌سازی دیگری با همین مسیر ریشه ثبت شده است.',
          HttpStatus.CONFLICT,
        );
      }
    }

    const updated = await this.repo.updateLocation(id, dto.version, {
      name: dto.name !== undefined ? dto.name.trim() : undefined,
      rootPath: dto.rootPath !== undefined ? normalizeRootPath(dto.rootPath) : undefined,
      clientRoot: dto.clientRoot !== undefined ? clean(dto.clientRoot) : undefined,
      kind: dto.kind,
      driveLetter: dto.driveLetter !== undefined ? clean(dto.driveLetter) : undefined,
      volumeLabel: dto.volumeLabel !== undefined ? clean(dto.volumeLabel) : undefined,
      volumeId: dto.volumeId !== undefined ? clean(dto.volumeId) : undefined,
      hostName: dto.hostName !== undefined ? clean(dto.hostName) : undefined,
      notes: dto.notes !== undefined ? clean(dto.notes) : undefined,
      isDefault: dto.isDefault,
      isActive: dto.isActive,
    });
    if (!updated) {
      const stillThere = await this.repo.findLocation(id);
      if (!stillThere) {
        throw new AppException(
          ErrorCodes.NOT_FOUND,
          'محل ذخیره‌سازی پیدا نشد.',
          HttpStatus.NOT_FOUND,
        );
      }
      throw new AppException(
        ErrorCodes.CONFLICT,
        'این محل ذخیره‌سازی توسط کاربر دیگری تغییر کرده است. صفحه را دوباره بارگذاری کنید.',
        HttpStatus.CONFLICT,
        { currentVersion: stillThere.version },
      );
    }
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.STORAGE_LOCATION_UPDATED,
      entityType: 'storage_location',
      entityId: id,
      description: `محل ذخیره‌سازی «${existing.name}» ویرایش شد.`,
      metadata: { fields: Object.keys(dto).filter((key) => key !== 'version') },
    });
    return this.getLocation(id);
  }

  async deleteLocation(id: string, actor: AuditActor): Promise<{ deleted: true }> {
    const existing = await this.requireLocation(id);
    const fileCount = await this.repo.countDeviceFilesForLocation(id);
    if (fileCount > 0) {
      throw new AppException(
        ErrorCodes.STORAGE_LOCATION_IN_USE,
        `این محل دارای ${fileCount} مسیر فایل ثبت‌شده است؛ ابتدا مسیرها را جابه‌جا یا حذف کنید.`,
        HttpStatus.CONFLICT,
        { fileCount },
      );
    }
    const removed = await this.repo.softDeleteLocation(id, existing.version);
    if (!removed) {
      throw new AppException(
        ErrorCodes.CONFLICT,
        'این محل ذخیره‌سازی هم‌زمان تغییر کرده است. صفحه را دوباره بارگذاری کنید.',
        HttpStatus.CONFLICT,
      );
    }
    if (existing.is_default) await this.repo.promoteFirstDefault();
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.STORAGE_LOCATION_DELETED,
      entityType: 'storage_location',
      entityId: id,
      description: `محل ذخیره‌سازی «${existing.name}» حذف شد.`,
      metadata: { rootPath: existing.root_path },
    });
    return { deleted: true };
  }

  async getConfig(): Promise<{
    folderLayout: string;
    subfolders: string[];
    lowSpaceGb: number;
  }> {
    const settings = await this.settings.getAll();
    return settings.storage;
  }

  async updateConfig(dto: StorageConfigDto, actor: AuditActor) {
    const payload: UpdateSettingsDto = {};
    if (dto.folderLayout !== undefined) payload.storageFolderLayout = dto.folderLayout;
    if (dto.subfolders !== undefined) {
      payload.storageSubfolders = [...new Set(dto.subfolders.map((item) => item.trim()))].filter(
        Boolean,
      );
    }
    if (dto.lowSpaceGb !== undefined) payload.storageLowSpaceGb = dto.lowSpaceGb;
    await this.settings.update(payload, actor);
    return this.getConfig();
  }

  /** پیش‌نمایش مسیر و ساختار پوشه دستگاه بدون ساخت آن */
  async previewDeviceFolder(deviceId: string): Promise<StorageFolderPreviewDto> {
    const device = await this.repo.findDeviceBasics(deviceId);
    if (!device) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'پرونده دستگاه پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    const preview = await this.buildPreview({
      id: device.id,
      intakeCode: device.intake_code,
      receivedAt: device.received_at,
    });
    if (!preview) {
      throw new AppException(
        ErrorCodes.VALIDATION_ERROR,
        'هیچ محل ذخیره‌سازی فعالی تعریف نشده است.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return preview;
  }

  /**
   * ساخت پوشه دستگاه هنگام پذیرش.
   * خطای ذخیره‌سازی پذیرش را متوقف نمی‌کند؛ مسیر با وضعیت «در دسترس نیست» ثبت می‌شود.
   */
  async provisionDeviceFolders(
    device: DeviceFolderTarget,
    actor: AuditActor | null,
    force = false,
  ): Promise<StorageFileDto | null> {
    await this.ensureDefaultLocation();
    const existing = await this.repo.findPrimaryDeviceFile(device.id);
    let preview: StorageFolderPreviewDto | null = null;
    try {
      preview = await this.buildPreview(device);
      if (!preview) {
        await this.audit.log({
          actor,
          action: AUDIT_ACTIONS.STORAGE_FOLDER_FAILED,
          entityType: 'device',
          entityId: device.id,
          description: `ساخت پوشه دستگاه ${device.intakeCode} ناموفق بود: محل ذخیره‌سازی فعالی وجود ندارد.`,
        });
        return null;
      }
      if (existing && !force) return toStorageFile(existing);

      await fs.mkdir(preview.serverPath, { recursive: true });
      for (const subfolder of preview.subfolders) {
        await fs.mkdir(joinStoragePath(preview.serverPath, [subfolder]), { recursive: true });
      }
      const size = await directorySize(preview.serverPath);
      if (existing) {
        await this.repo.updateDeviceFileAccess(existing.id, {
          accessStatus: 'ok',
          sizeBytes: size,
          checkedAt: new Date(),
          path: preview.serverPath,
          relativePath: preview.relativePath,
          clientPath: preview.clientPath,
          storageLocationId: preview.location.id,
          storageKind: storageKindFor(preview.location.kind),
        });
        const updated = await this.repo.findDeviceFile(device.id, existing.id);
        return updated ? toStorageFile(updated) : null;
      }
      const id = await this.repo.insertPrimaryDeviceFile(
        device.id,
        {
          label: 'پوشه اصلی دستگاه',
          path: preview.serverPath,
          relativePath: preview.relativePath,
          clientPath: preview.clientPath,
          storageKind: storageKindFor(preview.location.kind),
          category: 'root',
          storageLocationId: preview.location.id,
          sizeBytes: size,
          accessStatus: 'ok',
        },
        actor?.id ?? null,
      );
      await this.audit.log({
        actor,
        action: AUDIT_ACTIONS.STORAGE_FOLDER_CREATED,
        entityType: 'device',
        entityId: device.id,
        description: `پوشه ذخیره‌سازی دستگاه ${device.intakeCode} در ${preview.serverPath} ساخته شد.`,
        metadata: {
          relativePath: preview.relativePath,
          locationId: preview.location.id,
          subfolders: preview.subfolders,
        },
      });
      if (!id) {
        const found = await this.repo.findPrimaryDeviceFile(device.id);
        return found ? toStorageFile(found) : null;
      }
      const created = await this.repo.findDeviceFile(device.id, id);
      return created ? toStorageFile(created) : null;
    } catch (error) {
      const message = (error as Error).message;
      this.logger.warn(`ساخت پوشه دستگاه ${device.intakeCode} ناموفق بود: ${message}`);
      if (!existing && preview) {
        await this.repo
          .insertPrimaryDeviceFile(
            device.id,
            {
              label: 'پوشه اصلی دستگاه',
              path: preview.serverPath,
              relativePath: preview.relativePath,
              clientPath: preview.clientPath,
              storageKind: storageKindFor(preview.location.kind),
              category: 'root',
              storageLocationId: preview.location.id,
              sizeBytes: null,
              accessStatus: 'unavailable',
            },
            actor?.id ?? null,
          )
          .catch(() => undefined);
      } else if (existing) {
        await this.repo
          .updateDeviceFileAccess(existing.id, {
            accessStatus: 'unavailable',
            sizeBytes: existing.size_bytes === null ? null : Number(existing.size_bytes),
            checkedAt: new Date(),
          })
          .catch(() => undefined);
      }
      await this.audit.log({
        actor,
        action: AUDIT_ACTIONS.STORAGE_FOLDER_FAILED,
        entityType: 'device',
        entityId: device.id,
        description: `ساخت پوشه دستگاه ${device.intakeCode} ناموفق بود.`,
        metadata: { error: message },
      });
      return null;
    }
  }

  async provisionDeviceById(deviceId: string, actor: AuditActor): Promise<StorageFileDto | null> {
    const device = await this.repo.findDeviceBasics(deviceId);
    if (!device) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'پرونده دستگاه پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    return this.provisionDeviceFolders(
      { id: device.id, intakeCode: device.intake_code, receivedAt: device.received_at },
      actor,
      true,
    );
  }

  /** تبدیل محل ذخیره‌سازی و مسیر نسبی به مسیر کامل سرور و کلاینت */
  async resolveFileLocation(
    locationId: string,
    relativePath: string,
    clientPathOverride?: string | null,
  ): Promise<{
    path: string;
    clientPath: string | null;
    relativePath: string;
    storageKind: string;
    storageLocationId: string;
  }> {
    const location = await this.requireLocation(locationId);
    if (!location.is_active) {
      throw new AppException(
        ErrorCodes.VALIDATION_ERROR,
        'محل ذخیره‌سازی انتخاب‌شده غیرفعال است.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const segments = splitRelativePath(relativePath);
    if (segments.length === 0) {
      throw new AppException(
        ErrorCodes.VALIDATION_ERROR,
        'مسیر نسبی داخل محل ذخیره‌سازی الزامی است.',
        HttpStatus.BAD_REQUEST,
      );
    }
    segments.forEach(sanitizeSegment);
    return {
      path: joinStoragePath(location.root_path, segments),
      clientPath:
        clean(clientPathOverride) ??
        (location.client_root ? joinStoragePath(location.client_root, segments) : null),
      relativePath: segments.join('/'),
      storageKind: storageKindFor(location.kind),
      storageLocationId: location.id,
    };
  }

  async getDeviceSummary(deviceId: string): Promise<DeviceStorageSummaryDto> {
    const files = await this.repo.listDeviceFiles(deviceId);
    const primary = files.find((file) => file.isPrimary) ?? null;
    const lastChecked = files
      .map((file) => file.lastCheckedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .pop();
    return {
      filesTotal: files.length,
      totalBytes: files.reduce((sum, file) => sum + (file.sizeBytes ?? 0), 0),
      unavailableCount: files.filter((file) => file.accessStatus !== 'ok').length,
      lastCheckedAt: lastChecked ?? null,
      primaryFolder: primary
        ? {
            id: primary.id,
            path: primary.path,
            clientPath: primary.clientPath,
            accessStatus: primary.accessStatus,
            locationName: primary.storageLocation?.name ?? null,
          }
        : null,
    };
  }

  async checkDeviceFile(
    deviceId: string,
    fileId: string,
    actor: AuditActor,
  ): Promise<StorageFileDto> {
    const file = await this.repo.findDeviceFile(deviceId, fileId);
    if (!file) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'مسیر فایل پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    const target = await this.resolveFileTarget(file);
    let accessStatus: 'ok' | 'missing' | 'unavailable' = 'unavailable';
    let size: number | null = null;
    let errorMessage: string | null = null;
    try {
      await withTimeout(fs.access(target.path, fs.constants.R_OK), target.path);
      const stat = await fs.stat(target.path);
      if (stat.isDirectory()) {
        size = await directorySize(target.path);
      } else {
        size = stat.size;
      }
      accessStatus = 'ok';
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const message = (error as Error).message;
      errorMessage = message;
      accessStatus = code === 'ENOENT' ? 'missing' : 'unavailable';
      if (target.locationOnline === false) accessStatus = 'unavailable';
    }
    const checkedAt = new Date();
    await this.repo.updateDeviceFileAccess(fileId, {
      accessStatus,
      sizeBytes: size,
      checkedAt,
      path: target.path,
    });
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.STORAGE_FILE_CHECKED,
      entityType: 'device',
      entityId: deviceId,
      description: `دسترسی به مسیر «${file.label}» بررسی شد: ${
        accessStatus === 'ok' ? 'در دسترس' : accessStatus === 'missing' ? 'یافت نشد' : 'غیرقابل دسترسی'
      }.`,
      metadata: { fileId, accessStatus, sizeBytes: size, error: errorMessage },
    });
    if (accessStatus !== 'ok' && file.is_primary) {
      const locationId = file.storage_location_id;
      if (locationId) {
        const location = await this.repo.findLocation(locationId);
        if (location) await this.checkAndSave(location, (await this.settings.getAll()).storage.lowSpaceGb);
      }
    }
    const updated = await this.repo.findDeviceFile(deviceId, fileId);
    return toStorageFile(updated ?? file);
  }

  async searchFiles(filter: {
    search?: string;
    deviceId?: string;
    backupStatus?: string;
    accessStatus?: string;
    page?: number;
    pageSize?: number;
  }): Promise<StorageFilePage> {
    return this.repo.searchFiles(filter);
  }

  async createFileOpenTicket(
    deviceId: string,
    fileId: string,
    actor: AuditActor,
  ): Promise<OpenTicketDto> {
    const file = await this.repo.findDeviceFile(deviceId, fileId);
    if (!file) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'مسیر فایل پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    const target = await this.resolveFileTarget(file);
    const token = await this.issueTicket({
      path: target.path,
      clientPath: target.clientPath,
      deviceFileId: file.id,
      actor,
    });
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.STORAGE_OPEN_REQUESTED,
      entityType: 'device',
      entityId: deviceId,
      description: `درخواست بازکردن پوشه «${file.label}» برای برنامه کمکی ثبت شد.`,
      metadata: { fileId },
    });
    return token;
  }

  async createLocationOpenTicket(locationId: string, actor: AuditActor): Promise<OpenTicketDto> {
    const location = await this.requireLocation(locationId);
    const token = await this.issueTicket({
      path: location.root_path,
      clientPath: location.client_root,
      deviceFileId: null,
      actor,
    });
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.STORAGE_OPEN_REQUESTED,
      entityType: 'storage_location',
      entityId: locationId,
      description: `درخواست بازکردن ریشه محل ذخیره‌سازی «${location.name}» ثبت شد.`,
    });
    return token;
  }

  async consumeOpenTicket(token: string): Promise<OpenTicketResultDto> {
    if (!token || token.length < 20 || token.length > 200) {
      throw new AppException(
        ErrorCodes.OPEN_TICKET_INVALID,
        'بلیت بازکردن پوشه معتبر نیست یا منقضی شده است.',
        HttpStatus.GONE,
      );
    }
    const result = await this.repo.consumeOpenTicket(ticketHash(token));
    if (!result) {
      throw new AppException(
        ErrorCodes.OPEN_TICKET_INVALID,
        'بلیت بازکردن پوشه معتبر نیست یا قبلاً استفاده شده است.',
        HttpStatus.GONE,
      );
    }
    return result;
  }

  private async issueTicket(input: {
    path: string;
    clientPath: string | null;
    deviceFileId: string | null;
    actor: AuditActor;
  }): Promise<OpenTicketDto> {
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + TICKET_TTL_MS);
    await this.repo.createOpenTicket({
      tokenHash: ticketHash(token),
      path: input.path,
      clientPath: input.clientPath,
      deviceFileId: input.deviceFileId,
      requestedBy: input.actor.id,
      expiresAt,
    });
    return {
      token,
      expiresAt: expiresAt.toISOString(),
      path: input.path,
      clientPath: input.clientPath,
    };
  }

  private async resolveFileTarget(file: {
    path: string;
    client_path: string | null;
    relative_path: string | null;
    storage_location_id: string | null;
    alternative_path: string | null;
  }): Promise<{ path: string; clientPath: string | null; locationOnline: boolean | null }> {
    if (file.storage_location_id && file.relative_path) {
      const location = await this.repo.findLocation(file.storage_location_id);
      if (location) {
        const segments = splitRelativePath(file.relative_path);
        return {
          path: joinStoragePath(location.root_path, segments),
          clientPath: location.client_root
            ? joinStoragePath(location.client_root, segments)
            : file.client_path,
          locationOnline: location.last_check_ok ?? null,
        };
      }
    }
    return { path: file.path, clientPath: file.client_path, locationOnline: null };
  }

  private async requireLocation(id: string): Promise<StorageLocationRow> {
    const location = await this.repo.findLocation(id);
    if (!location) {
      throw new AppException(
        ErrorCodes.NOT_FOUND,
        'محل ذخیره‌سازی پیدا نشد.',
        HttpStatus.NOT_FOUND,
      );
    }
    return location;
  }

  private async buildPreview(device: DeviceFolderTarget): Promise<StorageFolderPreviewDto | null> {
    const location = await this.repo.findDefaultLocation();
    if (!location || !location.is_active) return null;
    const settings = await this.settings.getAll();
    const year = jalaliYear(device.receivedAt);
    const layout = settings.storage.folderLayout || '{year}/{intakeCode}';
    const segments = layout
      .replace(/\{year\}/g, String(year))
      .replace(/\{intakeCode\}/g, device.intakeCode)
      .replace(/\\/g, '/')
      .split('/')
      .filter((segment) => segment.trim().length > 0)
      .map(sanitizeSegment);
    if (segments.length === 0) segments.push(String(year), device.intakeCode);
    const relativePath = segments.join('/');
    const subfolders = [
      ...new Set(
        (settings.storage.subfolders.length > 0 ? settings.storage.subfolders : DEFAULT_SUBFOLDERS)
          .map((item) => item.trim())
          .filter(Boolean)
          .map(sanitizeSegment),
      ),
    ];
    return {
      location: {
        id: location.id,
        name: location.name,
        kind: location.kind,
        rootPath: location.root_path,
        clientRoot: location.client_root,
      },
      relativePath,
      serverPath: joinStoragePath(location.root_path, segments),
      clientPath: location.client_root
        ? joinStoragePath(location.client_root, segments)
        : null,
      subfolders,
    };
  }

  private async checkAndSave(
    row: StorageLocationRow,
    lowSpaceGb: number,
  ): Promise<StorageHealthDto> {
    const result = await this.checkPath(row, lowSpaceGb);
    await this.repo.saveLocationCheck(row.id, result).catch(() => undefined);
    return {
      available: result.available,
      writable: result.writable,
      totalBytes: result.totalBytes,
      freeBytes: result.freeBytes,
      usedBytes: result.usedBytes,
      usagePercent: result.usagePercent,
      lowSpace: result.lowSpace,
      checkedAt: result.checkedAt.toISOString(),
      lastSuccessAt: result.available
        ? result.checkedAt.toISOString()
        : row.last_success_at
          ? row.last_success_at.toISOString()
          : null,
      error: result.error,
    };
  }

  private async checkPath(
    row: StorageLocationRow,
    lowSpaceGb: number,
  ): Promise<StorageCheckResult> {
    const checkedAt = new Date();
    const root = normalizeRootPath(row.root_path);
    try {
      await withTimeout(fs.access(root, fs.constants.R_OK), root);
    } catch (error) {
      return {
        available: false,
        writable: false,
        totalBytes: null,
        freeBytes: null,
        usedBytes: null,
        usagePercent: null,
        lowSpace: false,
        error: (error as Error).message,
        checkedAt,
      };
    }

    // ظرفیت در برخی فایل‌سیستم‌ها/سیستم‌عامل‌ها از statfs در دسترس نیست؛
    // نبود آن نباید به معنی قطع بودن حافظه باشد.
    let totalBytes: number | null = null;
    let freeBytes: number | null = null;
    let usedBytes: number | null = null;
    let usagePercent: number | null = null;
    try {
      const stats = await withTimeout(fs.statfs(root), root);
      totalBytes = Number(stats.bsize) * Number(stats.blocks);
      freeBytes = Number(stats.bsize) * Number(stats.bavail);
      usedBytes = Math.max(totalBytes - freeBytes, 0);
      usagePercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 1000) / 10 : null;
    } catch {
      totalBytes = null;
      freeBytes = null;
      usedBytes = null;
      usagePercent = null;
    }

    let writable = true;
    let error: string | null = null;
    try {
      const probe = path.join(root, `.repair-health-${crypto.randomUUID()}`);
      await withTimeout(fs.writeFile(probe, 'ok', { flag: 'wx' }), root);
      await fs.unlink(probe).catch(() => undefined);
    } catch (writeError) {
      writable = false;
      error = `مسیر قابل خواندن است اما نوشتن در آن ممکن نیست: ${(writeError as Error).message}`;
    }

    return {
      available: true,
      writable,
      totalBytes,
      freeBytes,
      usedBytes,
      usagePercent,
      lowSpace: freeBytes !== null && freeBytes < lowSpaceGb * 1024 ** 3,
      error,
      checkedAt,
    };
  }
}
