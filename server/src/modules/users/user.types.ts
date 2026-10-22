export interface RoleSummary {
  id: string;
  key: string;
  nameFa: string;
}

export interface PublicUser {
  id: string;
  username: string;
  fullName: string;
  phone: string | null;
  role: RoleSummary;
  permissions: string[];
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  createdAt: string;
  version: number;
}

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  phone: string | null;
  roleId: string;
  roleKey: string;
  roleNameFa: string;
  permissions: string[];
  sessionId: string;
  mustChangePassword: boolean;
}

export interface UserRow {
  id: string;
  username: string;
  full_name: string;
  phone: string | null;
  role_id: string;
  role_key: string;
  role_name_fa: string;
  permissions: string[] | null;
  password_hash: string;
  is_active: boolean;
  must_change_password: boolean;
  password_changed_at: Date | null;
  last_login_at: Date | null;
  failed_login_attempts: number;
  locked_until: Date | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export const USER_SELECT = `
  u.id, u.username, u.full_name, u.phone, u.role_id, u.password_hash,
  u.is_active, u.must_change_password, u.password_changed_at, u.last_login_at,
  u.failed_login_attempts, u.locked_until, u.version, u.created_at, u.updated_at,
  r.key AS role_key, r.name_fa AS role_name_fa, r.permissions
`;

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    phone: row.phone,
    role: { id: row.role_id, key: row.role_key, nameFa: row.role_name_fa },
    permissions: row.permissions ?? [],
    isActive: row.is_active,
    mustChangePassword: row.must_change_password,
    lastLoginAt: row.last_login_at ? row.last_login_at.toISOString() : null,
    passwordChangedAt: row.password_changed_at ? row.password_changed_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    version: row.version,
  };
}

export function toAuthUser(row: UserRow, sessionId: string): AuthUser {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    phone: row.phone,
    roleId: row.role_id,
    roleKey: row.role_key,
    roleNameFa: row.role_name_fa,
    permissions: row.permissions ?? [],
    sessionId,
    mustChangePassword: row.must_change_password,
  };
}
