import { HttpStatus, Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { AppException, ErrorCodes } from '../../common/errors/app.exception';
import {
  DEVICE_STATUS_CATEGORY,
  OPTION_CATEGORY_LABELS,
  OPTION_CATEGORIES,
  findDeviceStatus,
  type OptionCategory,
} from '../../common/device-status';
import { AuditService, type AuditActor } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import {
  CreateFieldDto,
  CreateOptionDto,
  FieldOptionDto,
  UpdateFieldDto,
  UpdateOptionDto,
} from './device-config.dto';
import {
  FIELD_OPTION_SELECT,
  toDeviceStatus,
  toField,
  toOption,
  type DeviceStatusDto,
  type FieldDefinitionDto,
  type FieldDefinitionRow,
  type OptionDto,
  type OptionRow,
} from './device-config.types';

const OPTION_USAGE_SELECT = `
  CASE o.category
    WHEN 'equipment_type' THEN
      (SELECT COUNT(*)::int FROM devices d WHERE d.equipment_type = o.value_key)
    WHEN 'manufacturer' THEN
      (SELECT COUNT(*)::int FROM devices d WHERE d.manufacturer = o.value_key)
    WHEN 'lock_status' THEN
      (SELECT COUNT(*)::int FROM devices d WHERE d.lock_status = o.value_key)
    WHEN 'accessory' THEN
      (SELECT COUNT(*)::int FROM devices d WHERE d.accessories ? o.value_key)
    WHEN 'operation_type' THEN
      (SELECT COUNT(*)::int FROM device_operations p
        WHERE p.operation_type = o.value_key AND p.deleted_at IS NULL)
    WHEN 'device_status' THEN
      (SELECT COUNT(*)::int FROM devices d WHERE d.status = o.value_key)
    ELSE 0
  END AS usage_count
`;

const OPTION_SELECT = `
  o.id, o.category, o.value_key, o.label_fa, o.sort_order, o.is_active, o.is_system,
  ${OPTION_USAGE_SELECT}
`;

export interface DeviceConfigDto {
  fields: FieldDefinitionDto[];
  options: Record<OptionCategory, OptionDto[]>;
  statuses: DeviceStatusDto[];
  technicians: { id: string; fullName: string; roleName: string }[];
}

@Injectable()
export class DeviceConfigService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async getConfig(): Promise<DeviceConfigDto> {
    const [fields, options, statuses, technicians] = await Promise.all([
      this.listFields(),
      this.listOptions(),
      this.listStatuses(true),
      this.listTechnicians(),
    ]);
    return { fields, options, statuses, technicians };
  }

  /**
   * وضعیت‌های دستگاه از فهرست گزینه‌ها خوانده می‌شوند تا وضعیت‌های سفارشی مدیر
   * هم کنار وضعیت‌های پیش‌فرض در همه فرم‌ها و فیلترها دیده شوند.
   */
  async listStatuses(includeInactive = false): Promise<DeviceStatusDto[]> {
    const rows = await this.db.query<OptionRow>(
      `SELECT ${OPTION_SELECT}
         FROM option_lists o
        WHERE o.category = $1
        ORDER BY o.sort_order ASC, o.label_fa ASC`,
      [DEVICE_STATUS_CATEGORY],
    );
    return rows
      .filter((row) => includeInactive || row.is_active)
      .map((row) => {
        const builtin = findDeviceStatus(row.value_key);
        return toDeviceStatus(
          row,
          builtin ? { tone: builtin.tone, active: builtin.active, closed: builtin.closed } : undefined,
        );
      });
  }

  /** برچسب وضعیت، با اولویت مقدار ذخیره‌شده توسط مدیر */
  async statusLabel(key: string): Promise<string> {
    const row = await this.db.queryOne<{ label_fa: string }>(
      'SELECT label_fa FROM option_lists WHERE category = $1 AND value_key = $2',
      [DEVICE_STATUS_CATEGORY, key],
    );
    return row?.label_fa ?? findDeviceStatus(key)?.label ?? key;
  }

  /** اعتبارسنجی وضعیت انتخاب‌شده؛ وضعیت غیرفعال قابل انتخاب نیست. */
  async assertStatus(key: string): Promise<void> {
    const row = await this.db.queryOne<{ is_active: boolean }>(
      'SELECT is_active FROM option_lists WHERE category = $1 AND value_key = $2',
      [DEVICE_STATUS_CATEGORY, key],
    );
    if (!row || !row.is_active) {
      throw new AppException(
        ErrorCodes.VALIDATION_ERROR,
        'وضعیت انتخاب‌شده معتبر نیست یا غیرفعال شده است.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async listFields(): Promise<FieldDefinitionDto[]> {
    const rows = await this.db.query<FieldDefinitionRow>(
      `SELECT ${FIELD_OPTION_SELECT}
         FROM field_definitions f
        WHERE f.entity = 'device'
        ORDER BY f.sort_order ASC, f.created_at ASC`,
    );
    return rows.map(toField);
  }

  async listOptions(): Promise<Record<OptionCategory, OptionDto[]>> {
    const rows = await this.db.query<OptionRow>(
      `SELECT ${OPTION_SELECT}
         FROM option_lists o
        ORDER BY o.category ASC, o.sort_order ASC, o.label_fa ASC`,
    );
    const grouped = {} as Record<OptionCategory, OptionDto[]>;
    for (const category of OPTION_CATEGORIES) grouped[category] = [];
    for (const row of rows) {
      const category = row.category as OptionCategory;
      if (!grouped[category]) continue;
      grouped[category].push(toOption(row));
    }
    return grouped;
  }

  async listTechnicians(): Promise<{ id: string; fullName: string; roleName: string }[]> {
    const rows = await this.db.query<{ id: string; full_name: string; role_name: string }>(
      `SELECT u.id, u.full_name, r.name_fa AS role_name
         FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.deleted_at IS NULL AND u.is_active = true
        ORDER BY u.full_name ASC`,
    );
    return rows.map((row) => ({ id: row.id, fullName: row.full_name, roleName: row.role_name }));
  }

  async createField(dto: CreateFieldDto, actor: AuditActor): Promise<FieldDefinitionDto> {
    if (['select', 'multi_select'].includes(dto.fieldType) && (dto.options ?? []).length === 0) {
      throw new AppException(
        ErrorCodes.VALIDATION_ERROR,
        'برای فیلد انتخابی باید حداقل یک گزینه تعریف شود.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const nextOrder = await this.db.queryOne<{ next: number }>(
      `SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM field_definitions WHERE entity = 'device'`,
    );
    const row = await this.db.queryOne<FieldDefinitionRow>(
      `INSERT INTO field_definitions
         (entity, field_key, label_fa, field_type, group_name, placeholder, is_system,
          is_enabled, is_required, is_locked, options, sort_order, is_searchable, is_reportable)
       VALUES ('device', $1, $2, $3, $4, $5, false, true, $6, false, $7::jsonb, $8, $9, $10)
       RETURNING ${FIELD_OPTION_SELECT.replace(/f\./g, '')}`,
      [
        `custom_${crypto.randomBytes(5).toString('hex')}`,
        dto.labelFa.trim(),
        dto.fieldType,
        dto.groupName?.trim() || 'اطلاعات تکمیلی',
        dto.placeholder?.trim() || null,
        dto.isRequired ?? false,
        JSON.stringify(normalizeFieldOptions(dto.options)),
        dto.sortOrder ?? (nextOrder?.next ?? 10),
        dto.isSearchable ?? true,
        dto.isReportable ?? true,
      ],
    );
    if (!row) throw new Error('ایجاد فیلد ناموفق بود.');
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.DEVICE_CONFIG_UPDATED,
      entityType: 'field_definition',
      entityId: row.id,
      description: `فیلد سفارشی «${row.label_fa}» به فرم پذیرش اضافه شد.`,
    });
    return toField(row);
  }

  async updateField(id: string, dto: UpdateFieldDto, actor: AuditActor): Promise<FieldDefinitionDto> {
    const existing = await this.findField(id);
    if (existing.is_locked) {
      const lockedChange =
        dto.isEnabled === false || dto.isRequired === false || (dto.options !== undefined);
      if (lockedChange) {
        throw new AppException(
          ErrorCodes.FIELD_LOCKED,
          `فیلد «${existing.label_fa}» از فیلدهای اصلی فرم پذیرش است و غیرفعال یا اختیاری نمی‌شود.`,
          HttpStatus.CONFLICT,
        );
      }
    }
    if (
      !existing.is_system &&
      ['select', 'multi_select'].includes(existing.field_type) &&
      dto.options !== undefined &&
      dto.options.length === 0
    ) {
      throw new AppException(
        ErrorCodes.VALIDATION_ERROR,
        'برای فیلد انتخابی باید حداقل یک گزینه تعریف شود.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (column: string, value: unknown, cast = ''): void => {
      params.push(value);
      sets.push(`${column} = $${params.length}${cast}`);
    };
    if (dto.labelFa !== undefined) set('label_fa', dto.labelFa.trim());
    if (dto.groupName !== undefined) set('group_name', dto.groupName.trim() || 'اطلاعات تکمیلی');
    if (dto.placeholder !== undefined) set('placeholder', dto.placeholder.trim() || null);
    if (dto.isEnabled !== undefined) set('is_enabled', dto.isEnabled);
    if (dto.isRequired !== undefined) set('is_required', dto.isRequired);
    if (dto.isSearchable !== undefined) set('is_searchable', dto.isSearchable);
    if (dto.isReportable !== undefined) set('is_reportable', dto.isReportable);
    if (dto.sortOrder !== undefined) set('sort_order', dto.sortOrder);
    if (dto.options !== undefined && !existing.is_system) {
      set('options', JSON.stringify(normalizeFieldOptions(dto.options)), '::jsonb');
    }
    if (sets.length > 0) {
      sets.push('updated_at = now()');
      params.push(id);
      await this.db.query(
        `UPDATE field_definitions SET ${sets.join(', ')} WHERE id = $${params.length}`,
        params,
      );
    }

    const updated = await this.findField(id);
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.DEVICE_CONFIG_UPDATED,
      entityType: 'field_definition',
      entityId: id,
      description: `تنظیمات فیلد «${updated.label_fa}» تغییر کرد.`,
      metadata: { ...dto },
    });
    return toField(updated);
  }

  async deleteField(id: string, actor: AuditActor): Promise<{ success: true }> {
    const existing = await this.findField(id);
    if (existing.is_system) {
      throw new AppException(
        ErrorCodes.FIELD_LOCKED,
        'فیلدهای اصلی فرم پذیرش قابل حذف نیستند؛ می‌توانید آن‌ها را غیرفعال کنید.',
        HttpStatus.CONFLICT,
      );
    }
    await this.db.query('DELETE FROM field_definitions WHERE id = $1', [id]);
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.DEVICE_CONFIG_UPDATED,
      entityType: 'field_definition',
      entityId: id,
      description: `فیلد سفارشی «${existing.label_fa}» حذف شد.`,
    });
    return { success: true };
  }

  async createOption(dto: CreateOptionDto, actor: AuditActor): Promise<OptionDto> {
    const nextOrder = await this.db.queryOne<{ next: number }>(
      `SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM option_lists WHERE category = $1`,
      [dto.category],
    );
    const row = await this.db.queryOne<OptionRow>(
      `INSERT INTO option_lists (category, value_key, label_fa, sort_order, is_active, is_system)
       VALUES ($1, $2, $3, $4, true, false)
       RETURNING id, category, value_key, label_fa, sort_order, is_active, is_system, 0 AS usage_count`,
      [
        dto.category,
        `c_${crypto.randomBytes(5).toString('hex')}`,
        dto.labelFa.trim(),
        dto.sortOrder ?? (nextOrder?.next ?? 10),
      ],
    );
    if (!row) throw new Error('ایجاد گزینه ناموفق بود.');
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.DEVICE_OPTION_CREATED,
      entityType: 'option_list',
      entityId: row.id,
      description: `گزینه «${row.label_fa}» به فهرست ${OPTION_CATEGORY_LABELS[dto.category as OptionCategory]} اضافه شد.`,
    });
    return toOption(row);
  }

  async updateOption(id: string, dto: UpdateOptionDto, actor: AuditActor): Promise<OptionDto> {
    const existing = await this.findOption(id);
    if (
      existing.category === DEVICE_STATUS_CATEGORY &&
      existing.is_system &&
      dto.isActive === false
    ) {
      throw new AppException(
        ErrorCodes.OPTION_IN_USE,
        'وضعیت‌های پیش‌فرض سامانه قابل غیرفعال‌سازی نیستند؛ می‌توانید عنوان آن‌ها را ویرایش کنید.',
        HttpStatus.CONFLICT,
      );
    }
    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (column: string, value: unknown): void => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };
    if (dto.labelFa !== undefined) set('label_fa', dto.labelFa.trim());
    if (dto.sortOrder !== undefined) set('sort_order', dto.sortOrder);
    if (dto.isActive !== undefined) set('is_active', dto.isActive);
    if (sets.length > 0) {
      sets.push('updated_at = now()');
      params.push(id);
      await this.db.query(`UPDATE option_lists SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    }
    const updated = await this.findOption(id);
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.DEVICE_OPTION_UPDATED,
      entityType: 'option_list',
      entityId: id,
      description: `گزینه «${existing.label_fa}» ویرایش شد.`,
      metadata: { ...dto },
    });
    return toOption(updated);
  }

  async deleteOption(id: string, actor: AuditActor): Promise<{ success: true }> {
    const existing = await this.findOption(id);
    if (existing.is_system) {
      throw new AppException(
        ErrorCodes.OPTION_IN_USE,
        'گزینه‌های پیش‌فرض سامانه قابل حذف نیستند؛ برای پنهان کردن آن‌ها را غیرفعال کنید.',
        HttpStatus.CONFLICT,
      );
    }
    if (existing.usage_count > 0) {
      throw new AppException(
        ErrorCodes.OPTION_IN_USE,
        `این گزینه در ${existing.usage_count} رکورد استفاده شده و قابل حذف نیست؛ می‌توانید آن را غیرفعال کنید.`,
        HttpStatus.CONFLICT,
        { usageCount: existing.usage_count },
      );
    }
    await this.db.query('DELETE FROM option_lists WHERE id = $1', [id]);
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.DEVICE_OPTION_DELETED,
      entityType: 'option_list',
      entityId: id,
      description: `گزینه «${existing.label_fa}» از فهرست حذف شد.`,
    });
    return { success: true };
  }

  /** بررسی معتبر بودن یک مقدار انتخابی فعال در فهرست */
  async assertOption(category: OptionCategory, key: string): Promise<void> {
    const row = await this.db.queryOne<{ id: string }>(
      'SELECT id FROM option_lists WHERE category = $1 AND value_key = $2 AND is_active = true',
      [category, key],
    );
    if (!row) {
      throw new AppException(
        ErrorCodes.VALIDATION_ERROR,
        `مقدار انتخاب‌شده برای «${OPTION_CATEGORY_LABELS[category]}» معتبر نیست.`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async assertOptions(category: OptionCategory, keys: string[]): Promise<void> {
    for (const key of keys) {
      await this.assertOption(category, key);
    }
  }

  /**
   * اعتبارسنجی مقادیر فیلدهای سفارشی بر اساس تعریف فعال آن‌ها.
   * کلیدهای ناشناخته حذف می‌شوند تا داده نامعتبر ذخیره نشود.
   */
  async validateCustomFields(values: Record<string, unknown>): Promise<Record<string, unknown>> {
    const fields = await this.db.query<FieldDefinitionRow>(
      `SELECT ${FIELD_OPTION_SELECT}
         FROM field_definitions f
        WHERE f.entity = 'device' AND f.is_system = false AND f.is_enabled = true`,
    );
    const result: Record<string, unknown> = {};

    for (const field of fields) {
      const raw = values[field.field_key];
      const isEmpty =
        raw === undefined ||
        raw === null ||
        (typeof raw === 'string' && raw.trim().length === 0) ||
        (Array.isArray(raw) && raw.length === 0);

      if (isEmpty) {
        if (field.is_required) {
          throw new AppException(
            ErrorCodes.VALIDATION_ERROR,
            `مقدار فیلد «${field.label_fa}» الزامی است.`,
            HttpStatus.BAD_REQUEST,
          );
        }
        continue;
      }

      const options = Array.isArray(field.options) ? field.options : [];
      switch (field.field_type) {
        case 'number': {
          const value = typeof raw === 'number' ? raw : Number(String(raw));
          if (!Number.isFinite(value)) {
            throw invalidField(field.label_fa, 'باید عدد باشد');
          }
          result[field.field_key] = value;
          break;
        }
        case 'amount': {
          const value = typeof raw === 'number' ? raw : Number(String(raw).replace(/[,٬\s]/g, ''));
          if (!Number.isFinite(value) || value < 0) {
            throw invalidField(field.label_fa, 'باید مبلغی نامنفی باشد');
          }
          result[field.field_key] = Math.round(value * 100) / 100;
          break;
        }
        case 'checkbox': {
          const value = raw === true || raw === 'true' || raw === 1;
          result[field.field_key] = value;
          break;
        }
        case 'date': {
          const value = String(raw).trim();
          if (Number.isNaN(new Date(value).getTime())) {
            throw invalidField(field.label_fa, 'باید تاریخ معتبر باشد');
          }
          result[field.field_key] = value;
          break;
        }
        case 'datetime': {
          const value = String(raw).trim();
          if (Number.isNaN(new Date(value).getTime())) {
            throw invalidField(field.label_fa, 'باید تاریخ و ساعت معتبر باشد');
          }
          result[field.field_key] = value;
          break;
        }
        case 'file': {
          const value = String(raw).trim();
          if (value.length > 500) {
            throw invalidField(field.label_fa, 'مسیر یا نام فایل حداکثر ۵۰۰ نویسه است');
          }
          result[field.field_key] = value;
          break;
        }
        case 'select': {
          const value = String(raw);
          if (!options.some((option) => option.value === value)) {
            throw invalidField(field.label_fa, 'مقدار انتخاب‌شده در فهرست گزینه‌ها نیست');
          }
          result[field.field_key] = value;
          break;
        }
        case 'multi_select': {
          const list = Array.isArray(raw) ? raw.map(String) : [String(raw)];
          if (!list.every((item) => options.some((option) => option.value === item))) {
            throw invalidField(field.label_fa, 'برخی مقادیر انتخاب‌شده در فهرست گزینه‌ها نیست');
          }
          result[field.field_key] = list;
          break;
        }
        default: {
          const value = String(raw).trim();
          if (value.length > 2000) {
            throw invalidField(field.label_fa, 'حداکثر ۲۰۰۰ نویسه مجاز است');
          }
          result[field.field_key] = value;
        }
      }
    }
    return result;
  }

  private async findField(id: string): Promise<FieldDefinitionRow> {
    const row = await this.db.queryOne<FieldDefinitionRow>(
      `SELECT ${FIELD_OPTION_SELECT} FROM field_definitions f WHERE f.id = $1`,
      [id],
    );
    if (!row) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'فیلد مورد نظر پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    return row;
  }

  private async findOption(id: string): Promise<OptionRow> {
    const row = await this.db.queryOne<OptionRow>(
      `SELECT ${OPTION_SELECT} FROM option_lists o WHERE o.id = $1`,
      [id],
    );
    if (!row) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'گزینه مورد نظر پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    return row;
  }
}

function normalizeFieldOptions(options: FieldOptionDto[] | undefined): { value: string; label: string }[] {
  if (!options) return [];
  const seen = new Set<string>();
  const result: { value: string; label: string }[] = [];
  for (const option of options) {
    const value = option.value.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push({ value, label: option.label.trim() });
  }
  return result;
}

function invalidField(label: string, reason: string): AppException {
  return new AppException(
    ErrorCodes.VALIDATION_ERROR,
    `مقدار فیلد «${label}» معتبر نیست: ${reason}.`,
    HttpStatus.BAD_REQUEST,
  );
}
