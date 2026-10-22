import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException, ErrorCodes } from '../../common/errors/app.exception';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import { hashPassword, passwordPolicyError, verifyPassword } from '../../common/utils/security';
import { AuditService, type AuditActor } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { RolesRepository } from '../roles/roles.repository';
import { CreateUserDto, ListUsersQueryDto, UpdateUserDto } from './users.dto';
import { UsersRepository } from './users.repository';
import { toPublicUser, type PublicUser, type UserRow } from './user.types';
import type { PageResult } from '../../common/utils/pagination';

@Injectable()
export class UsersService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly roles: RolesRepository,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListUsersQueryDto): Promise<PageResult<PublicUser>> {
    return this.repo.list({
      search: query.search,
      roleId: query.roleId,
      isActive: query.isActive,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /** فهرست کوتاه نقش‌ها برای انتخاب در فرم کاربر */
  async roleOptions(): Promise<{ id: string; key: string; nameFa: string }[]> {
    const roles = await this.roles.list();
    return roles.map((role) => ({ id: role.id, key: role.key, nameFa: role.name_fa }));
  }

  async getById(id: string): Promise<PublicUser> {
    const row = await this.repo.findById(id);
    if (!row) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'کاربر مورد نظر پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    return toPublicUser(row);
  }

  async create(dto: CreateUserDto, actor: AuditActor): Promise<PublicUser> {
    const policyError = passwordPolicyError(dto.password);
    if (policyError) {
      throw new AppException(ErrorCodes.WEAK_PASSWORD, policyError, HttpStatus.BAD_REQUEST);
    }
    const role = await this.roles.findById(dto.roleId);
    if (!role) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'نقش انتخاب‌شده پیدا نشد.', HttpStatus.BAD_REQUEST);
    }
    const username = dto.username.trim().toLowerCase();
    if (await this.repo.findByUsername(username)) {
      throw new AppException(ErrorCodes.DUPLICATE, 'این نام کاربری قبلاً ثبت شده است.', HttpStatus.CONFLICT);
    }

    const created = await this.repo.insert({
      username,
      fullName: dto.fullName.trim(),
      phone: dto.phone?.trim() || null,
      roleId: dto.roleId,
      passwordHash: await hashPassword(dto.password),
      isActive: dto.isActive ?? true,
      mustChangePassword: dto.mustChangePassword ?? true,
    });

    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.USER_CREATED,
      entityType: 'user',
      entityId: created.id,
      description: `کاربر «${created.full_name}» با نقش «${created.role_name_fa}» ایجاد شد.`,
      metadata: { username: created.username, roleKey: created.role_key },
    });
    return toPublicUser(created);
  }

  async update(id: string, dto: UpdateUserDto, actor: AuditActor): Promise<PublicUser> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'کاربر مورد نظر پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    if (existing.id === actor.id && dto.isActive === false) {
      throw new AppException(
        ErrorCodes.CONFLICT,
        'نمی‌توانید حساب کاربری خودتان را غیرفعال کنید.',
        HttpStatus.CONFLICT,
      );
    }
    if (dto.roleId && dto.roleId !== existing.role_id) {
      const role = await this.roles.findById(dto.roleId);
      if (!role) {
        throw new AppException(ErrorCodes.NOT_FOUND, 'نقش انتخاب‌شده پیدا نشد.', HttpStatus.BAD_REQUEST);
      }
      await this.assertManagerRemains(existing, 'تغییر نقش');
    }
    if (dto.isActive === false && existing.is_active) {
      await this.assertManagerRemains(existing, 'غیرفعال‌سازی');
    }
    if (dto.username && dto.username.toLowerCase() !== existing.username.toLowerCase()) {
      const duplicate = await this.repo.findByUsername(dto.username);
      if (duplicate && duplicate.id !== id) {
        throw new AppException(ErrorCodes.DUPLICATE, 'این نام کاربری قبلاً ثبت شده است.', HttpStatus.CONFLICT);
      }
    }

    const changes = {
      username: dto.username?.trim().toLowerCase(),
      fullName: dto.fullName?.trim(),
      phone: dto.phone !== undefined ? dto.phone.trim() || null : undefined,
      roleId: dto.roleId,
      isActive: dto.isActive,
    };

    const updated = await this.repo.update(id, dto.version, changes);
    if (!updated) {
      const stillThere = await this.repo.findById(id);
      if (!stillThere) {
        throw new AppException(ErrorCodes.NOT_FOUND, 'کاربر مورد نظر پیدا نشد.', HttpStatus.NOT_FOUND);
      }
      throw new AppException(
        ErrorCodes.CONFLICT,
        'اطلاعات این کاربر توسط کاربر دیگری تغییر کرده است. فهرست را دوباره بارگذاری کنید.',
        HttpStatus.CONFLICT,
        { currentVersion: stillThere.version },
      );
    }

    if (updated.is_active === false) {
      await this.repo.revokeSessions(updated.id, 'deactivated');
    }

    const changedFields = Object.entries({
      username: changes.username,
      fullName: changes.fullName,
      phone: changes.phone,
      roleId: changes.roleId,
      isActive: changes.isActive,
    })
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);

    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.USER_UPDATED,
      entityType: 'user',
      entityId: id,
      description: `اطلاعات کاربر «${updated.full_name}» ویرایش شد.`,
      metadata: { changedFields },
    });
    return toPublicUser(updated);
  }

  async resetPassword(id: string, newPassword: string, actor: AuditActor): Promise<{ success: true }> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'کاربر مورد نظر پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    if (existing.id === actor.id) {
      throw new AppException(
        ErrorCodes.CONFLICT,
        'برای تغییر رمز خودتان از بخش حساب کاربری استفاده کنید.',
        HttpStatus.CONFLICT,
      );
    }
    const policyError = passwordPolicyError(newPassword);
    if (policyError) {
      throw new AppException(ErrorCodes.WEAK_PASSWORD, policyError, HttpStatus.BAD_REQUEST);
    }

    await this.repo.setPassword(id, await hashPassword(newPassword), true);
    const revoked = await this.repo.revokeSessions(id, 'password_reset');
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.USER_PASSWORD_RESET,
      entityType: 'user',
      entityId: id,
      description: `رمز عبور کاربر «${existing.full_name}» توسط مدیر بازنشانی شد.`,
      metadata: { revokedSessions: revoked },
    });
    return { success: true };
  }

  async remove(id: string, actor: AuditActor): Promise<{ success: true }> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'کاربر مورد نظر پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    if (existing.id === actor.id) {
      throw new AppException(
        ErrorCodes.CONFLICT,
        'نمی‌توانید حساب کاربری خودتان را حذف کنید.',
        HttpStatus.CONFLICT,
      );
    }
    await this.assertManagerRemains(existing, 'حذف');

    await this.repo.softDelete(id);
    await this.repo.revokeSessions(id, 'deleted');
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.USER_DELETED,
      entityType: 'user',
      entityId: id,
      description: `کاربر «${existing.full_name}» (${existing.username}) حذف شد.`,
    });
    return { success: true };
  }

  /** تأیید رمز عبور کاربر برای بازکردن قفل صفحه */
  async verifyUserPassword(userId: string, password: string): Promise<UserRow | null> {
    const row = await this.repo.findById(userId);
    if (!row) return null;
    const valid = await verifyPassword(password, row.password_hash);
    return valid ? row : null;
  }

  async findByUsernameForAuth(username: string): Promise<UserRow | null> {
    return this.repo.findByUsername(username);
  }

  private async assertManagerRemains(target: UserRow, operation: string): Promise<void> {
    const isManager = hasPermission(target.permissions ?? [], PERMISSIONS.USERS_MANAGE);
    if (!isManager || !target.is_active) return;
    const managers = await this.repo.countActiveUsersWithManagePermission();
    if (managers <= 1) {
      throw new AppException(
        ErrorCodes.LAST_ADMIN,
        `این کاربر تنها مدیر فعال سامانه است و ${operation} او ممکن نیست. ابتدا کاربر دیگری را به عنوان مدیر تعیین کنید.`,
        HttpStatus.CONFLICT,
      );
    }
  }
}
