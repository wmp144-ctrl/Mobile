import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import ExcelJS from 'exceljs';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { AppException, ErrorCodes } from '../../common/errors/app.exception';
import { findDeviceStatus } from '../../common/device-status';
import { SecretBox } from '../../common/utils/crypto';
import { addDays, jalaliYear } from '../../common/utils/jalali';
import type { PageResult } from '../../common/utils/pagination';
import { AuditService, type AuditActor } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { StorageService } from '../storage/storage.service';
import { CustomersRepository } from '../customers/customers.repository';
import { SettingsService } from '../settings/settings.service';
import {
  ChangeDeviceStatusDto,
  CreateDeviceDto,
  CreateDeviceFileDto,
  CreateOperationDto,
  ListDevicesQueryDto,
  UpdateDeviceDto,
  UpdateDeviceFileDto,
  UpdateOperationDto,
  DuplicateCheckQueryDto,
} from './devices.dto';
import { DeviceConfigService } from './device-config.service';
import { DevicesRepository, type DeviceInput, type OperationInput } from './devices.repository';
import {
  toDeviceSummary,
  type DeviceDetailDto,
  type DeviceRow,
  type DeviceSummaryDto,
  type DuplicateDeviceDto,
} from './devices.types';
import type { AuthUser } from '../users/user.types';
import { hasPermission, PERMISSIONS } from '../../common/permissions';

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/** فایل تصویری که Multer در حافظه تحویل می‌دهد */
export interface UploadedImageFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function clean(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeImei(value: string | undefined | null): string | null {
  if (!value) return null;
  const latin = value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/\D/g, '');
  return latin.length > 0 ? latin : null;
}

function normalizeSerial(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

@Injectable()
export class DevicesService {
  private readonly secretBox: SecretBox;

  constructor(
    @Inject(APP_CONFIG) private readonly appConfig: AppConfig,
    private readonly repo: DevicesRepository,
    private readonly customers: CustomersRepository,
    private readonly config: DeviceConfigService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {
    this.secretBox = new SecretBox(appConfig.deviceSecret);
  }

  list(query: ListDevicesQueryDto): Promise<PageResult<DeviceSummaryDto>> {
    return this.repo.list({
      search: query.search,
      status: query.status,
      equipmentType: query.equipmentType,
      manufacturer: query.manufacturer,
      technicianId: query.technicianId,
      customerId: query.customerId,
      receivedFrom: query.receivedFrom,
      receivedTo: query.receivedTo,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  async duplicates(query: DuplicateCheckQueryDto): Promise<DuplicateDeviceDto[]> {
    return this.repo.findDuplicates({
      imei1: normalizeImei(query.imei1),
      imei2: normalizeImei(query.imei2),
      serialNumber: normalizeSerial(query.serialNumber),
      excludeId: query.excludeId ?? null,
    });
  }

  async getDetail(id: string, viewer?: AuthUser): Promise<DeviceDetailDto> {
    const row = await this.repo.findById(id);
    if (!row) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'پرونده دستگاه پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    const extras = await this.repo.detailAggregates(id);
    const summary = toDeviceSummary(row);
    const canViewFiles = viewer ? canViewStorage(viewer) : false;
    const storageSummary = canViewFiles ? await this.storage.getDeviceSummary(id) : null;
    return {
      ...summary,
      physicalCondition: row.physical_condition,
      accessories: Array.isArray(row.accessories) ? row.accessories : [],
      lockStatus: {
        key: row.lock_status,
        label: row.lock_status_label ?? row.lock_status,
      },
      notes: row.notes,
      customFields: row.custom_fields ?? {},
      ...extras,
      files: canViewFiles ? extras.files : [],
      storageSummary,
    };
  }

  async create(dto: CreateDeviceDto, actor: AuditActor, viewer?: AuthUser): Promise<DeviceDetailDto> {
    const input = await this.buildInput(dto, null);
    const duplicates = await this.repo.findDuplicates({
      imei1: input.imei1,
      imei2: input.imei2,
      serialNumber: input.serialNumber,
    });
    if (duplicates.length > 0 && !dto.allowDuplicate) {
      throw new AppException(
        ErrorCodes.DEVICE_DUPLICATE,
        'دستگاهی با همین IMEI یا شماره سریال قبلاً ثبت شده است. سوابق قبلی را بررسی کنید.',
        HttpStatus.CONFLICT,
        { duplicates },
      );
    }

    const settings = await this.settings.getAll();
    const id = await this.repo.createWithIntakeCode(
      input,
      settings.devices.intakePrefix,
      jalaliYear(input.receivedAt),
      { id: actor.id, username: actor.username },
    );
    const created = await this.repo.findById(id);
    if (created) {
      await this.storage.provisionDeviceFolders(
        { id: created.id, intakeCode: created.intake_code, receivedAt: input.receivedAt },
        actor,
      );
    }

    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.DEVICE_CREATED,
      entityType: 'device',
      entityId: id,
      description: `دستگاه «${created?.model ?? 'بدون مدل'}» با کد پذیرش ${created?.intake_code ?? ''} پذیرش شد.`,
      metadata: {
        customerId: input.customerId,
        equipmentType: input.equipmentType,
        duplicateHistory: duplicates.length,
      },
    });
    return this.getDetail(id, viewer);
  }

  async update(
    id: string,
    dto: UpdateDeviceDto,
    actor: AuditActor,
    viewer?: AuthUser,
  ): Promise<DeviceDetailDto> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'پرونده دستگاه پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    const input = await this.buildInput(dto, existing);
    const identifiersChanged =
      existing.imei1 !== input.imei1 ||
      existing.imei2 !== input.imei2 ||
      existing.serial_number !== input.serialNumber;
    if (identifiersChanged && !dto.allowDuplicate) {
      const duplicates = await this.repo.findDuplicates({
        imei1: input.imei1,
        imei2: input.imei2,
        serialNumber: input.serialNumber,
        excludeId: id,
      });
      if (duplicates.length > 0) {
        throw new AppException(
          ErrorCodes.DEVICE_DUPLICATE,
          'دستگاه دیگری با همین IMEI یا شماره سریال ثبت شده است. سوابق قبلی را بررسی کنید.',
          HttpStatus.CONFLICT,
          { duplicates },
        );
      }
    }

    const updated = await this.repo.update(id, dto.version, input);
    if (!updated) {
      const stillThere = await this.repo.findById(id);
      if (!stillThere) {
        throw new AppException(ErrorCodes.NOT_FOUND, 'پرونده دستگاه پیدا نشد.', HttpStatus.NOT_FOUND);
      }
      throw new AppException(
        ErrorCodes.CONFLICT,
        'این پرونده توسط کاربر دیگری تغییر کرده است. اطلاعات را دوباره بارگذاری کنید.',
        HttpStatus.CONFLICT,
        { currentVersion: stillThere.version },
      );
    }

    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.DEVICE_UPDATED,
      entityType: 'device',
      entityId: id,
      description: `اطلاعات پرونده ${existing.intake_code} ویرایش شد.`,
      metadata: { fields: Object.keys(dto).filter((key) => key !== 'version' && key !== 'allowDuplicate') },
    });
    return this.getDetail(id, viewer);
  }

  async changeStatus(
    id: string,
    dto: ChangeDeviceStatusDto,
    actor: AuditActor,
    viewer?: AuthUser,
  ): Promise<DeviceDetailDto> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'پرونده دستگاه پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    if (existing.status === dto.status) {
      throw new AppException(
        ErrorCodes.VALIDATION_ERROR,
        'وضعیت انتخاب‌شده با وضعیت فعلی دستگاه یکسان است.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const changed = await this.repo.changeStatus(
      id,
      existing.status,
      dto.status,
      clean(dto.note),
      { id: actor.id, username: actor.username },
      dto.version,
    );
    if (!changed) {
      throw new AppException(
        ErrorCodes.CONFLICT,
        'وضعیت این پرونده هم‌زمان توسط کاربر دیگری تغییر کرده است. صفحه را دوباره بارگذاری کنید.',
        HttpStatus.CONFLICT,
      );
    }

    const toLabel = findDeviceStatus(dto.status)?.label ?? dto.status;
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.DEVICE_STATUS_CHANGED,
      entityType: 'device',
      entityId: id,
      description: `وضعیت پرونده ${existing.intake_code} به «${toLabel}» تغییر کرد.`,
      metadata: { from: existing.status, to: dto.status, note: dto.note ?? null },
    });
    return this.getDetail(id, viewer);
  }

  async revealPassword(id: string, actor: AuditActor): Promise<{ password: string | null }> {
    const row = await this.repo.findById(id);
    if (!row) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'پرونده دستگاه پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    const password = this.secretBox.decrypt(row.device_password_cipher);
    if (!password) {
      throw new AppException(
        ErrorCodes.NOT_FOUND,
        'برای این دستگاه رمزی ثبت نشده است.',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.DEVICE_PASSWORD_VIEWED,
      entityType: 'device',
      entityId: id,
      description: `رمز دستگاه پرونده ${row.intake_code} مشاهده شد.`,
    });
    return { password };
  }

  async addOperation(
    id: string,
    dto: CreateOperationDto,
    actor: AuditActor,
    viewer?: AuthUser,
  ): Promise<DeviceDetailDto> {
    const existing = await this.requireDevice(id);
    await this.config.assertOption('operation_type', dto.operationType);
    if (dto.technicianId) await this.assertTechnician(dto.technicianId);
    if (dto.deviceStatusAfter && !findDeviceStatus(dto.deviceStatusAfter)) {
      throw new AppException(
        ErrorCodes.VALIDATION_ERROR,
        'وضعیت نهایی انتخاب‌شده معتبر نیست.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const performedAt = dto.performedAt ? new Date(dto.performedAt) : new Date();
    const input: OperationInput = {
      operationType: dto.operationType,
      title: dto.title.trim(),
      performedAt,
      technicianId: dto.technicianId ?? null,
      description: clean(dto.description),
      dataSizeBytes: dto.dataSizeBytes ?? null,
      storagePath: clean(dto.storagePath),
      result: dto.result ?? 'success',
      deviceStatusAfter: dto.deviceStatusAfter ?? null,
    };
    const created = await this.repo.createOperation(id, input, {
      id: actor.id,
      username: actor.username,
    });

    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.DEVICE_OPERATION_ADDED,
      entityType: 'device',
      entityId: id,
      description: `اقدام «${input.title}» برای پرونده ${existing.intake_code} ثبت شد.`,
      metadata: {
        operationId: created.id,
        operationType: input.operationType,
        result: input.result,
      },
    });
    if (created.statusChanged && input.deviceStatusAfter) {
      await this.audit.log({
        actor,
        action: AUDIT_ACTIONS.DEVICE_STATUS_CHANGED,
        entityType: 'device',
        entityId: id,
        description: `وضعیت پرونده ${existing.intake_code} پس از اقدام «${input.title}» به «${
          findDeviceStatus(input.deviceStatusAfter)?.label ?? input.deviceStatusAfter
        }» تغییر کرد.`,
        metadata: { from: existing.status, to: input.deviceStatusAfter },
      });
    }
    return this.getDetail(id, viewer);
  }

  async updateOperation(
    deviceId: string,
    operationId: string,
    dto: UpdateOperationDto,
    actor: AuditActor,
    viewer?: AuthUser,
  ): Promise<DeviceDetailDto> {
    const device = await this.requireDevice(deviceId);
    const operation = await this.repo.findOperation(deviceId, operationId);
    if (!operation) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'اقدام مورد نظر پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    await this.config.assertOption('operation_type', dto.operationType);
    if (dto.technicianId) await this.assertTechnician(dto.technicianId);

    const updated = await this.repo.updateOperation(deviceId, operationId, dto.version, {
      operationType: dto.operationType,
      title: dto.title.trim(),
      performedAt: dto.performedAt ? new Date(dto.performedAt) : operation.performed_at,
      technicianId: dto.technicianId ?? null,
      description: clean(dto.description),
      dataSizeBytes: dto.dataSizeBytes ?? null,
      storagePath: clean(dto.storagePath),
      result: dto.result ?? operation.result,
    });
    if (!updated) {
      throw new AppException(
        ErrorCodes.CONFLICT,
        'این اقدام توسط کاربر دیگری تغییر کرده است. صفحه را دوباره بارگذاری کنید.',
        HttpStatus.CONFLICT,
      );
    }
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.DEVICE_OPERATION_UPDATED,
      entityType: 'device',
      entityId: deviceId,
      description: `اقدام «${dto.title}» در پرونده ${device.intake_code} ویرایش شد.`,
      metadata: { operationId },
    });
    return this.getDetail(deviceId, viewer);
  }

  async removeOperation(
    deviceId: string,
    operationId: string,
    actor: AuditActor,
    viewer?: AuthUser,
  ): Promise<DeviceDetailDto> {
    const device = await this.requireDevice(deviceId);
    const operation = await this.repo.findOperation(deviceId, operationId);
    if (!operation) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'اقدام مورد نظر پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    await this.repo.softDeleteOperation(deviceId, operationId);
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.DEVICE_OPERATION_REMOVED,
      entityType: 'device',
      entityId: deviceId,
      description: `اقدام «${operation.title}» از پرونده ${device.intake_code} حذف شد.`,
      metadata: { operationId },
    });
    return this.getDetail(deviceId, viewer);
  }

  async addFile(
    deviceId: string,
    dto: CreateDeviceFileDto,
    actor: AuditActor,
    viewer?: AuthUser,
  ): Promise<DeviceDetailDto> {
    const device = await this.requireDevice(deviceId);
    if (dto.relatedOperationId) {
      const operation = await this.repo.findOperation(deviceId, dto.relatedOperationId);
      if (!operation) {
        throw new AppException(
          ErrorCodes.VALIDATION_ERROR,
          'اقدام مرتبط با این فایل در همین پرونده پیدا نشد.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    const input = await this.buildFileInput(dto);
    const file = await this.repo.createFile(
      deviceId,
      {
        label: dto.label.trim(),
        ...input,
        relatedOperationId: dto.relatedOperationId ?? null,
        notes: clean(dto.notes),
      },
      actor.id,
    );
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.DEVICE_FILE_ADDED,
      entityType: 'device',
      entityId: deviceId,
      description: `مسیر فایل «${file?.label ?? dto.label}» برای پرونده ${device.intake_code} ثبت شد.`,
      metadata: {
        fileId: file?.id,
        path: input.path,
        clientPath: input.clientPath,
        relativePath: input.relativePath,
        category: input.category,
        backupStatus: input.backupStatus,
      },
    });
    return this.getDetail(deviceId, viewer);
  }

  async updateFile(
    deviceId: string,
    fileId: string,
    dto: UpdateDeviceFileDto,
    actor: AuditActor,
    viewer?: AuthUser,
  ): Promise<DeviceDetailDto> {
    const device = await this.requireDevice(deviceId);
    const file = await this.repo.findFile(deviceId, fileId);
    if (!file) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'فایل مورد نظر پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    if (dto.relatedOperationId) {
      const operation = await this.repo.findOperation(deviceId, dto.relatedOperationId);
      if (!operation) {
        throw new AppException(
          ErrorCodes.VALIDATION_ERROR,
          'اقدام مرتبط با این فایل در همین پرونده پیدا نشد.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    const input = await this.buildFileInput(dto, file);
    await this.repo.updateFile(deviceId, fileId, {
      label: dto.label.trim(),
      ...input,
      relatedOperationId: dto.relatedOperationId ?? null,
      notes: clean(dto.notes),
    });
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.DEVICE_FILE_UPDATED,
      entityType: 'device',
      entityId: deviceId,
      description: `مسیر فایل «${dto.label}» در پرونده ${device.intake_code} ویرایش شد.`,
      metadata: {
        fileId,
        from: {
          path: file.path,
          clientPath: file.client_path,
          relativePath: file.relative_path,
          alternativePath: file.alternative_path,
          backupStatus: file.backup_status,
        },
        to: {
          path: input.path,
          clientPath: input.clientPath,
          relativePath: input.relativePath,
          alternativePath: input.alternativePath,
          backupStatus: input.backupStatus,
        },
      },
    });
    return this.getDetail(deviceId, viewer);
  }

  async removeFile(
    deviceId: string,
    fileId: string,
    actor: AuditActor,
    viewer?: AuthUser,
  ): Promise<DeviceDetailDto> {
    const device = await this.requireDevice(deviceId);
    const file = await this.repo.findFile(deviceId, fileId);
    if (!file) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'فایل مورد نظر پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    if (file.is_primary) {
      throw new AppException(
        ErrorCodes.VALIDATION_ERROR,
        'پوشه اصلی دستگاه قابل حذف نیست؛ برای بازسازی مسیر از دکمه ایجاد/بازسازی پوشه استفاده کنید.',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.repo.softDeleteFile(deviceId, fileId);
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.DEVICE_FILE_REMOVED,
      entityType: 'device',
      entityId: deviceId,
      description: `مسیر فایل «${file.label}» از پرونده ${device.intake_code} حذف شد.`,
      metadata: {
        fileId,
        path: file.path,
        relativePath: file.relative_path,
        clientPath: file.client_path,
        alternativePath: file.alternative_path,
      },
    });
    return this.getDetail(deviceId, viewer);
  }

  async addNote(
    deviceId: string,
    body: string,
    actor: AuditActor,
    viewer?: AuthUser,
  ): Promise<DeviceDetailDto> {
    const device = await this.requireDevice(deviceId);
    await this.repo.createNote(deviceId, body.trim(), { id: actor.id, username: actor.username });
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.DEVICE_NOTE_ADDED,
      entityType: 'device',
      entityId: deviceId,
      description: `یادداشت تکنسین برای پرونده ${device.intake_code} ثبت شد.`,
    });
    return this.getDetail(deviceId, viewer);
  }

  async removeNote(
    deviceId: string,
    noteId: string,
    actor: AuditActor,
    viewer?: AuthUser,
  ): Promise<DeviceDetailDto> {
    const device = await this.requireDevice(deviceId);
    const removed = await this.repo.deleteNote(deviceId, noteId);
    if (!removed) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'یادداشت مورد نظر پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.DEVICE_NOTE_REMOVED,
      entityType: 'device',
      entityId: deviceId,
      description: `یادداشت تکنسین از پرونده ${device.intake_code} حذف شد.`,
      metadata: { noteId },
    });
    return this.getDetail(deviceId, viewer);
  }

  async addImage(
    deviceId: string,
    file: UploadedImageFile | undefined,
    caption: string | undefined,
    actor: AuditActor,
    viewer?: AuthUser,
  ): Promise<DeviceDetailDto> {
    const device = await this.requireDevice(deviceId);
    if (!file) {
      throw new AppException(
        ErrorCodes.UNSUPPORTED_FILE,
        'فایل تصویری انتخاب نشده است.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!IMAGE_EXTENSIONS[file.mimetype]) {
      throw new AppException(
        ErrorCodes.UNSUPPORTED_FILE,
        'فقط تصویر با قالب JPG، PNG، WEBP یا GIF قابل بارگذاری است.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new AppException(
        ErrorCodes.FILE_TOO_LARGE,
        'حجم تصویر نباید بیشتر از ۶ مگابایت باشد.',
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    const folder = path.join(this.appConfig.uploadsDir, 'devices', deviceId);
    await fs.mkdir(folder, { recursive: true });
    const fileName = `${crypto.randomUUID()}${IMAGE_EXTENSIONS[file.mimetype]}`;
    await fs.writeFile(path.join(folder, fileName), file.buffer);

    const image = await this.repo.insertImage(deviceId, {
      originalName: file.originalname || fileName,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      storagePath: path.join(deviceId, fileName),
      caption: clean(caption),
      uploadedBy: actor.id,
    });
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.DEVICE_IMAGE_ADDED,
      entityType: 'device',
      entityId: deviceId,
      description: `تصویر «${image?.originalName ?? fileName}» به پرونده ${device.intake_code} اضافه شد.`,
      metadata: { imageId: image?.id, sizeBytes: file.size },
    });
    return this.getDetail(deviceId, viewer);
  }

  async resolveImage(
    deviceId: string,
    imageId: string,
  ): Promise<{ filePath: string; mimeType: string; fileName: string }> {
    const image = await this.repo.findImage(deviceId, imageId);
    if (!image) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'تصویر مورد نظر پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    const filePath = path.join(this.appConfig.uploadsDir, 'devices', image.storage_path);
    const resolved = path.resolve(filePath);
    const root = path.resolve(this.appConfig.uploadsDir);
    if (!resolved.startsWith(root)) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'تصویر مورد نظر پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    try {
      await fs.access(resolved);
    } catch {
      throw new AppException(
        ErrorCodes.NOT_FOUND,
        'فایل تصویر روی سرور موجود نیست.',
        HttpStatus.NOT_FOUND,
      );
    }
    return { filePath: resolved, mimeType: image.mime_type, fileName: image.original_name };
  }

  async removeImage(
    deviceId: string,
    imageId: string,
    actor: AuditActor,
    viewer?: AuthUser,
  ): Promise<DeviceDetailDto> {
    const device = await this.requireDevice(deviceId);
    const image = await this.repo.findImage(deviceId, imageId);
    if (!image) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'تصویر مورد نظر پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    await this.repo.deleteImage(deviceId, imageId);
    const filePath = path.join(this.appConfig.uploadsDir, 'devices', image.storage_path);
    await fs.unlink(filePath).catch(() => undefined);
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.DEVICE_IMAGE_REMOVED,
      entityType: 'device',
      entityId: deviceId,
      description: `تصویر «${image.original_name}» از پرونده ${device.intake_code} حذف شد.`,
      metadata: { imageId },
    });
    return this.getDetail(deviceId, viewer);
  }

  getStorageSummary(deviceId: string) {
    return this.storage.getDeviceSummary(deviceId);
  }

  async previewStorage(deviceId: string) {
    await this.requireDevice(deviceId);
    return this.storage.previewDeviceFolder(deviceId);
  }

  async provisionStorage(deviceId: string, actor: AuditActor) {
    await this.requireDevice(deviceId);
    const file = await this.storage.provisionDeviceById(deviceId, actor);
    return { file, summary: await this.storage.getDeviceSummary(deviceId) };
  }

  checkStorageFile(deviceId: string, fileId: string, actor: AuditActor) {
    return this.storage.checkDeviceFile(deviceId, fileId, actor);
  }

  openStorageFile(deviceId: string, fileId: string, actor: AuditActor) {
    return this.storage.createFileOpenTicket(deviceId, fileId, actor);
  }

  async exportExcel(
    query: ListDevicesQueryDto,
    actor: AuditActor,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const rows = await this.repo.listForExport({
      search: query.search,
      status: query.status,
      equipmentType: query.equipmentType,
      manufacturer: query.manufacturer,
      technicianId: query.technicianId,
      customerId: query.customerId,
      receivedFrom: query.receivedFrom,
      receivedTo: query.receivedTo,
    });
    const options = await this.config.listOptions();
    const accessoryLabels = new Map(
      options.accessory.map((option) => [option.key, option.label] as const),
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'سامانه مدیریت تعمیرگاه';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('تجهیزات', {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
    });
    sheet.columns = [
      { header: 'کد پذیرش', key: 'intakeCode', width: 18 },
      { header: 'وضعیت', key: 'status', width: 22 },
      { header: 'نوع تجهیز', key: 'equipmentType', width: 16 },
      { header: 'سازنده', key: 'manufacturer', width: 16 },
      { header: 'مدل', key: 'model', width: 20 },
      { header: 'شماره سریال', key: 'serialNumber', width: 20 },
      { header: 'IMEI 1', key: 'imei1', width: 18 },
      { header: 'IMEI 2', key: 'imei2', width: 18 },
      { header: 'مالک', key: 'owner', width: 22 },
      { header: 'تلفن مالک', key: 'ownerPhone', width: 16 },
      { header: 'آورنده', key: 'broughtBy', width: 20 },
      { header: 'تلفن آورنده', key: 'broughtByPhone', width: 16 },
      { header: 'تکنسین مسئول', key: 'technician', width: 18 },
      { header: 'زمان دریافت', key: 'receivedAt', width: 20 },
      { header: 'تحویل پیش‌بینی‌شده', key: 'dueAt', width: 20 },
      { header: 'تحویل واقعی', key: 'deliveredAt', width: 20 },
      { header: 'مشکل اعلام‌شده', key: 'problem', width: 36 },
      { header: 'لوازم همراه', key: 'accessories', width: 26 },
      { header: 'اقدامات', key: 'operations', width: 12 },
    ];
    sheet.addRows(
      rows.map((row) => ({
        intakeCode: row.intake_code,
        status: toDeviceSummary(row).status.label,
        equipmentType: row.equipment_type_label ?? row.equipment_type,
        manufacturer: row.manufacturer_label ?? '',
        model: row.model ?? '',
        serialNumber: row.serial_number ?? '',
        imei1: row.imei1 ?? '',
        imei2: row.imei2 ?? '',
        owner: row.owner_name,
        ownerPhone: row.owner_phone ?? '',
        broughtBy: row.brought_by_name,
        broughtByPhone: row.brought_by_phone ?? '',
        technician: row.technician_name ?? '',
        receivedAt: formatExcelDate(row.received_at),
        dueAt: row.due_at ? formatExcelDate(row.due_at) : '',
        deliveredAt: row.delivered_at ? formatExcelDate(row.delivered_at) : '',
        problem: row.reported_problem,
        accessories: (row.accessories ?? [])
          .map((key) => accessoryLabels.get(key) ?? key)
          .join('، '),
        operations: row.operation_count,
      })),
    );
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    header.alignment = { horizontal: 'center', vertical: 'middle' };
    header.height = 24;
    sheet.eachRow((row, index) => {
      row.alignment = { vertical: 'middle', horizontal: 'right', wrapText: index === 1 };
    });
    sheet.autoFilter = { from: 'A1', to: 'S1' };

    const buffer = await workbook.xlsx.writeBuffer();
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.DEVICE_EXPORTED,
      description: `خروجی اکسل ${rows.length} پرونده دستگاه تهیه شد.`,
      metadata: { count: rows.length },
    });
    return {
      buffer: Buffer.from(buffer),
      fileName: `devices-${jalaliYear()}-${Date.now()}.xlsx`,
    };
  }

  private async buildFileInput(
    dto: CreateDeviceFileDto,
    existing?: {
      storage_location_id: string | null;
      relative_path: string | null;
      size_bytes: string | null;
      category: string;
      backup_status: string;
      alternative_path: string | null;
    },
  ) {
    let resolved: {
      path: string;
      clientPath: string | null;
      relativePath: string | null;
      storageKind: string;
      storageLocationId: string | null;
    };
    if (dto.storageLocationId && dto.relativePath) {
      resolved = await this.storage.resolveFileLocation(
        dto.storageLocationId,
        dto.relativePath,
        dto.clientPath,
      );
    } else if (dto.storageLocationId || dto.relativePath) {
      throw new AppException(
        ErrorCodes.VALIDATION_ERROR,
        'برای اتصال فایل به محل ذخیره‌سازی، هم محل و هم مسیر نسبی را وارد کنید.',
        HttpStatus.BAD_REQUEST,
      );
    } else {
      const manualPath = clean(dto.path);
      if (!manualPath) {
        throw new AppException(
          ErrorCodes.VALIDATION_ERROR,
          'مسیر فایل الزامی است.',
          HttpStatus.BAD_REQUEST,
        );
      }
      resolved = {
        path: manualPath,
        clientPath: clean(dto.clientPath),
        relativePath: null,
        storageKind: dto.storageKind ?? 'network',
        storageLocationId: null,
      };
    }
    return {
      path: resolved.path,
      clientPath: resolved.clientPath,
      relativePath: resolved.relativePath,
      storageKind: dto.storageKind ?? resolved.storageKind,
      storageLocationId: resolved.storageLocationId,
      category: dto.category ?? existing?.category ?? 'other',
      sizeBytes:
        dto.sizeBytes ?? (existing?.size_bytes === null || existing?.size_bytes === undefined
          ? null
          : Number(existing.size_bytes)),
      backupStatus: dto.backupStatus ?? existing?.backup_status ?? 'none',
      alternativePath:
        dto.alternativePath !== undefined
          ? clean(dto.alternativePath)
          : (existing?.alternative_path ?? null),
    };
  }

  private async requireDevice(id: string) {
    const row = await this.repo.findById(id);
    if (!row) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'پرونده دستگاه پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    return row;
  }

  private async assertTechnician(id: string): Promise<void> {
    const technician = await this.repo.findTechnician(id);
    if (!technician) {
      throw new AppException(
        ErrorCodes.VALIDATION_ERROR,
        'تکنسین انتخاب‌شده پیدا نشد یا غیرفعال است.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async buildInput(
    dto: CreateDeviceDto,
    existing: DeviceRow | null,
  ): Promise<DeviceInput> {
    const customer = await this.customers.findById(dto.customerId);
    if (!customer) {
      throw new AppException(
        ErrorCodes.VALIDATION_ERROR,
        'مشتری انتخاب‌شده پیدا نشد.',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.config.assertOption('equipment_type', dto.equipmentType);
    if (dto.manufacturer) await this.config.assertOption('manufacturer', dto.manufacturer);
    const lockStatus = dto.lockStatus ?? 'unknown';
    await this.config.assertOption('lock_status', lockStatus);
    const accessories = [...new Set(dto.accessories ?? [])];
    await this.config.assertOptions('accessory', accessories);
    if (dto.technicianId) await this.assertTechnician(dto.technicianId);

    const customFields = await this.config.validateCustomFields(
      dto.customFields && typeof dto.customFields === 'object' ? dto.customFields : {},
    );

    const imei1 = normalizeImei(dto.imei1);
    const imei2 = normalizeImei(dto.imei2);
    if (imei1 && imei1.length !== 15) {
      throw new AppException(
        ErrorCodes.VALIDATION_ERROR,
        'IMEI 1 باید دقیقاً ۱۵ رقم باشد.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (imei2 && imei2.length !== 15) {
      throw new AppException(
        ErrorCodes.VALIDATION_ERROR,
        'IMEI 2 باید دقیقاً ۱۵ رقم باشد.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : new Date();
    if (Number.isNaN(receivedAt.getTime())) {
      throw new AppException(
        ErrorCodes.VALIDATION_ERROR,
        'زمان دریافت دستگاه معتبر نیست.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const settings = await this.settings.getAll();
    let dueAt: Date | null = null;
    if (dto.dueAt) {
      dueAt = new Date(dto.dueAt);
      if (Number.isNaN(dueAt.getTime())) {
        throw new AppException(
          ErrorCodes.VALIDATION_ERROR,
          'تاریخ تحویل پیش‌بینی‌شده معتبر نیست.',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (dueAt.getTime() < receivedAt.getTime()) {
        throw new AppException(
          ErrorCodes.VALIDATION_ERROR,
          'تاریخ تحویل پیش‌بینی‌شده نمی‌تواند پیش از زمان دریافت باشد.',
          HttpStatus.BAD_REQUEST,
        );
      }
    } else if (existing === null && settings.devices.defaultDueDays > 0) {
      dueAt = addDays(receivedAt, settings.devices.defaultDueDays);
    }

    let devicePasswordCipher = existing?.device_password_cipher ?? null;
    if (dto.devicePassword !== undefined && dto.devicePassword.trim().length > 0) {
      devicePasswordCipher = this.secretBox.encrypt(dto.devicePassword.trim());
    }
    if ((dto as UpdateDeviceDto).clearDevicePassword) {
      devicePasswordCipher = null;
    }

    return {
      customerId: dto.customerId,
      broughtByName: dto.broughtByName.trim(),
      broughtByJob: clean(dto.broughtByJob),
      broughtByPhone: clean(dto.broughtByPhone),
      equipmentType: dto.equipmentType,
      manufacturer: clean(dto.manufacturer),
      model: clean(dto.model),
      serialNumber: normalizeSerial(dto.serialNumber),
      imei1,
      imei2,
      receivedAt,
      dueAt,
      physicalCondition: clean(dto.physicalCondition),
      accessories,
      lockStatus,
      devicePasswordCipher,
      reportedProblem: dto.reportedProblem.trim(),
      notes: clean(dto.notes),
      technicianId: dto.technicianId ?? null,
      customFields,
    };
  }
}

function canViewStorage(user: AuthUser): boolean {
  return (
    hasPermission(user.permissions, PERMISSIONS.FILES_VIEW) ||
    hasPermission(user.permissions, PERMISSIONS.FILES_MANAGE)
  );
}

function formatExcelDate(value: Date): string {
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value);
}

