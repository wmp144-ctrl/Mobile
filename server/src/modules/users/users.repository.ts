import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { USER_SELECT, type PublicUser, type UserRow, toPublicUser } from './user.types';
import { buildPage, resolvePagination, type PageResult } from '../../common/utils/pagination';

export interface ListUsersFilter {
  search?: string;
  roleId?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CreateUserInput {
  username: string;
  fullName: string;
  phone: string | null;
  roleId: string;
  passwordHash: string;
  isActive: boolean;
  mustChangePassword: boolean;
}

export interface UpdateUserInput {
  username?: string;
  fullName?: string;
  phone?: string | null;
  roleId?: string;
  isActive?: boolean;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly db: DatabaseService) {}

  async findById(id: string): Promise<UserRow | null> {
    return this.db.queryOne<UserRow>(
      `SELECT ${USER_SELECT}
         FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [id],
    );
  }

  async findByUsername(username: string): Promise<UserRow | null> {
    return this.db.queryOne<UserRow>(
      `SELECT ${USER_SELECT}
         FROM users u JOIN roles r ON r.id = u.role_id
        WHERE lower(u.username) = lower($1) AND u.deleted_at IS NULL`,
      [username],
    );
  }

  async list(filter: ListUsersFilter): Promise<PageResult<PublicUser>> {
    const request = resolvePagination(filter.page, filter.pageSize);
    const search = filter.search?.trim() || null;
    const roleId = filter.roleId || null;
    const isActive = filter.isActive === undefined ? null : filter.isActive;

    const where = `
      WHERE u.deleted_at IS NULL
        AND ($1::text IS NULL
             OR u.username ILIKE '%' || $1 || '%'
             OR u.full_name ILIKE '%' || $1 || '%'
             OR COALESCE(u.phone, '') ILIKE '%' || $1 || '%')
        AND ($2::uuid IS NULL OR u.role_id = $2)
        AND ($3::boolean IS NULL OR u.is_active = $3)
    `;
    const params = [search, roleId, isActive];

    const countRow = await this.db.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM users u ${where}`,
      params,
    );
    const rows = await this.db.query<UserRow>(
      `SELECT ${USER_SELECT}
         FROM users u JOIN roles r ON r.id = u.role_id
         ${where}
        ORDER BY u.is_active DESC, u.created_at DESC
        LIMIT $4 OFFSET $5`,
      [...params, request.pageSize, request.offset],
    );
    return buildPage(rows.map(toPublicUser), Number(countRow?.count ?? 0), request);
  }

  async insert(input: CreateUserInput): Promise<UserRow> {
    const inserted = await this.db.queryOne<{ id: string }>(
      `INSERT INTO users
         (username, full_name, phone, role_id, password_hash, is_active, must_change_password, password_changed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       RETURNING id`,
      [
        input.username,
        input.fullName,
        input.phone,
        input.roleId,
        input.passwordHash,
        input.isActive,
        input.mustChangePassword,
      ],
    );
    const row = inserted ? await this.findById(inserted.id) : null;
    if (!row) throw new Error('ایجاد کاربر ناموفق بود.');
    return row;
  }

  async update(id: string, version: number, changes: UpdateUserInput): Promise<UserRow | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (column: string, value: unknown): void => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };

    if (changes.username !== undefined) set('username', changes.username);
    if (changes.fullName !== undefined) set('full_name', changes.fullName);
    if (changes.phone !== undefined) set('phone', changes.phone);
    if (changes.roleId !== undefined) set('role_id', changes.roleId);
    if (changes.isActive !== undefined) set('is_active', changes.isActive);

    if (sets.length === 0) return this.findById(id);

    sets.push('version = version + 1', 'updated_at = now()');
    params.push(id, version);
    const idIndex = params.length - 1;
    const versionIndex = params.length;

    const updated = await this.db.queryOne<{ id: string }>(
      `UPDATE users
          SET ${sets.join(', ')}
        WHERE id = $${idIndex} AND version = $${versionIndex} AND deleted_at IS NULL
        RETURNING id`,
      params,
    );
    if (!updated) return null;
    return this.findById(id);
  }

  async setPassword(id: string, passwordHash: string, mustChangePassword: boolean): Promise<void> {
    await this.db.query(
      `UPDATE users
          SET password_hash = $2, must_change_password = $3, password_changed_at = now(),
              failed_login_attempts = 0, locked_until = NULL, version = version + 1, updated_at = now()
        WHERE id = $1`,
      [id, passwordHash, mustChangePassword],
    );
  }

  async softDelete(id: string): Promise<void> {
    await this.db.query(
      `UPDATE users
          SET deleted_at = now(), is_active = false, version = version + 1, updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
  }

  async resetExpiredLock(id: string): Promise<void> {
    await this.db.query(
      `UPDATE users
          SET failed_login_attempts = 0, locked_until = NULL
        WHERE id = $1 AND locked_until IS NOT NULL AND locked_until <= now()`,
      [id],
    );
  }

  async recordLoginSuccess(id: string): Promise<void> {
    await this.db.query(
      `UPDATE users
          SET last_login_at = now(), failed_login_attempts = 0, locked_until = NULL, updated_at = now()
        WHERE id = $1`,
      [id],
    );
  }

  async recordLoginFailure(
    id: string,
    maxFailedLogins: number,
    lockMinutes: number,
  ): Promise<{ attempts: number; lockedUntil: Date | null }> {
    const lockUntil = new Date(Date.now() + lockMinutes * 60_000);
    const row = await this.db.queryOne<{ failed_login_attempts: number; locked_until: Date | null }>(
      `UPDATE users
          SET failed_login_attempts = failed_login_attempts + 1,
              locked_until = CASE WHEN failed_login_attempts + 1 >= $2 THEN $3 ELSE locked_until END,
              updated_at = now()
        WHERE id = $1
        RETURNING failed_login_attempts, locked_until`,
      [id, maxFailedLogins, lockUntil],
    );
    return {
      attempts: row?.failed_login_attempts ?? 0,
      lockedUntil: row?.locked_until ?? null,
    };
  }

  async revokeSessions(userId: string, reason: string, exceptSessionId?: string): Promise<number> {
    const result = await this.db.query<{ id: string }>(
      `UPDATE sessions
          SET revoked_at = now(), revoked_reason = $2
        WHERE user_id = $1 AND revoked_at IS NULL
          AND ($3::uuid IS NULL OR id <> $3)
        RETURNING id`,
      [userId, reason, exceptSessionId ?? null],
    );
    return result.length;
  }

  async countActiveUsersWithManagePermission(): Promise<number> {
    const row = await this.db.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.deleted_at IS NULL AND u.is_active = true
          AND (r.permissions ? '*' OR r.permissions ? 'users.manage')`,
    );
    return Number(row?.count ?? 0);
  }

  async countUsersByRole(roleId: string): Promise<number> {
    const row = await this.db.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM users WHERE role_id = $1 AND deleted_at IS NULL`,
      [roleId],
    );
    return Number(row?.count ?? 0);
  }

  async countAll(): Promise<number> {
    const row = await this.db.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM users WHERE deleted_at IS NULL`,
    );
    return Number(row?.count ?? 0);
  }

  async countActive(): Promise<number> {
    const row = await this.db.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM users WHERE deleted_at IS NULL AND is_active = true`,
    );
    return Number(row?.count ?? 0);
  }
}
