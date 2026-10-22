import { HttpStatus, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AppException, ErrorCodes } from '../../common/errors/app.exception';
import { normalizePermissions, PERMISSION_CATALOG } from '../../common/permissions';
import { AuditService, type AuditActor } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { UsersRepository } from '../users/users.repository';
import { CreateRoleDto, UpdateRoleDto } from './roles.dto';
import { RolesRepository, type RoleRow } from './roles.repository';

export interface RoleDto {
  id: string;
  key: string;
  nameFa: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  version: number;
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

function toRoleDto(row: RoleRow): RoleDto {
  return {
    id: row.id,
    key: row.key,
    nameFa: row.name_fa,
    description: row.description,
    permissions: row.permissions ?? [],
    isSystem: row.is_system,
    version: row.version,
    userCount: row.user_count,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

@Injectable()
export class RolesService {
  constructor(
    private readonly roles: RolesRepository,
    private readonly users: UsersRepository,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<RoleDto[]> {
    const rows = await this.roles.list();
    return rows.map(toRoleDto);
  }

  permissionCatalog() {
    return PERMISSION_CATALOG;
  }

  async findById(id: string): Promise<RoleRow | null> {
    return this.roles.findById(id);
  }

  async create(dto: CreateRoleDto, actor: AuditActor): Promise<RoleDto> {
    const permissions = normalizePermissions(dto.permissions);
    if (permissions.length === 0) {
      throw new AppException(ErrorCodes.VALIDATION_ERROR, 'حداقل یک مجوز معتبر انتخاب کنید.', HttpStatus.BAD_REQUEST);
    }
    const key = `custom_${randomBytes(4).toString('hex')}`;
    const created = await this.roles.insert({
      key,
      nameFa: dto.nameFa.trim(),
      description: dto.description?.trim() || null,
      permissions,
    });
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.ROLE_CREATED,
      entityType: 'role',
      entityId: created.id,
      description: `نقش «${created.name_fa}» ایجاد شد.`,
      metadata: { permissions },
    });
    return toRoleDto(created);
  }

  async update(id: string, dto: UpdateRoleDto, actor: AuditActor): Promise<RoleDto> {
    const existing = await this.roles.findById(id);
    if (!existing) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'نقش مورد نظر پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    if (existing.is_system) {
      throw new AppException(
        ErrorCodes.SYSTEM_ROLE,
        'نقش‌های سیستمی قابل ویرایش نیستند؛ برای تغییر سطح دسترسی یک نقش سفارشی بسازید.',
        HttpStatus.CONFLICT,
      );
    }

    const permissions = dto.permissions ? normalizePermissions(dto.permissions) : undefined;
    if (permissions && permissions.length === 0) {
      throw new AppException(ErrorCodes.VALIDATION_ERROR, 'حداقل یک مجوز معتبر انتخاب کنید.', HttpStatus.BAD_REQUEST);
    }

    const updated = await this.roles.update(id, dto.version, {
      nameFa: dto.nameFa?.trim(),
      description: dto.description !== undefined ? dto.description.trim() || null : undefined,
      permissions,
    });
    if (!updated) {
      throw new AppException(
        ErrorCodes.CONFLICT,
        'این نقش توسط کاربر دیگری تغییر کرده است. فهرست را دوباره بارگذاری کنید.',
        HttpStatus.CONFLICT,
      );
    }
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.ROLE_UPDATED,
      entityType: 'role',
      entityId: id,
      description: `نقش «${updated.name_fa}» ویرایش شد.`,
      metadata: { permissions: updated.permissions },
    });
    return toRoleDto(updated);
  }

  async remove(id: string, actor: AuditActor): Promise<{ success: true }> {
    const existing = await this.roles.findById(id);
    if (!existing) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'نقش مورد نظر پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    if (existing.is_system) {
      throw new AppException(ErrorCodes.SYSTEM_ROLE, 'نقش‌های سیستمی قابل حذف نیستند.', HttpStatus.CONFLICT);
    }
    const assigned = await this.users.countUsersByRole(id);
    if (assigned > 0) {
      throw new AppException(
        ErrorCodes.ROLE_IN_USE,
        `این نقش به ${assigned} کاربر اختصاص یافته و قابل حذف نیست.`,
        HttpStatus.CONFLICT,
      );
    }
    await this.roles.remove(id);
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.ROLE_DELETED,
      entityType: 'role',
      entityId: id,
      description: `نقش «${existing.name_fa}» حذف شد.`,
    });
    return { success: true };
  }
}
