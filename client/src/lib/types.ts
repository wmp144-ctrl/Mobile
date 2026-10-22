export interface PublicUser {
  id: string;
  username: string;
  fullName: string;
  phone: string | null;
  role: { id: string; key: string; nameFa: string };
  permissions: string[];
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  createdAt: string;
  version: number;
}

export interface PublicInfo {
  needsSetup: boolean;
  appName: string;
  version: string;
  workshopName: string;
  serverTime: string;
}

export interface Role {
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

export interface PermissionDefinition {
  key: string;
  label: string;
  group: string;
  future?: boolean;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  username: string | null;
  action: string;
  actionLabel: string;
  entityType: string | null;
  entityId: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditActionSummary {
  key: string;
  label: string;
  count: number;
}

export interface SessionInfo {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

export interface WorkshopSettings {
  name: string;
  address: string;
  phone: string;
}

export interface SecuritySettings {
  idleTimeoutMinutes: number;
  maxFailedLogins: number;
  lockoutMinutes: number;
  sessionDays: number;
}

export interface AppSettings {
  workshop: WorkshopSettings;
  security: SecuritySettings;
  backup: { retentionCount: number };
}

export interface BackupFile {
  name: string;
  sizeBytes: number;
  createdAt: string;
}

export interface BackupStatus {
  pgDumpAvailable: boolean;
  pgDumpVersion: string | null;
  directory: string;
  retentionCount: number;
  scheduledEnabled: boolean;
}

export interface DashboardOverview {
  stats: {
    usersTotal: number;
    usersActive: number;
    sessionsActive: number;
    rolesTotal: number;
    auditToday: number;
    databaseSize: number;
  };
  roleDistribution: { roleName: string; roleKey: string; userCount: number }[];
  recentActivity: AuditLog[];
  server: { version: string; time: string; uptimeSeconds: number; workshopName: string };
  currentUser: { fullName: string; roleNameFa: string };
}

export interface AuthPayload {
  accessToken: string;
  expiresIn: number;
  user: PublicUser;
}
