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

export interface DeviceSettings {
  intakePrefix: string;
  defaultDueDays: number;
}

export interface AppSettings {
  workshop: WorkshopSettings;
  security: SecuritySettings;
  backup: { retentionCount: number };
  devices: DeviceSettings;
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
    devicesTotal: number;
    devicesActive: number;
    devicesReady: number;
    devicesDeliveredToday: number;
    devicesOverdue: number;
    devicesCreatedToday: number;
    customersTotal: number;
  };
  statusBreakdown: { key: string; label: string; tone: string; count: number }[];
  roleDistribution: { roleName: string; roleKey: string; userCount: number }[];
  recentActivity: AuditLog[];
  recentDevices: DeviceSummary[];
  server: { version: string; time: string; uptimeSeconds: number; workshopName: string };
  currentUser: { fullName: string; roleNameFa: string };
}

export interface Customer {
  id: string;
  fullName: string;
  phone: string | null;
  phoneSecondary: string | null;
  jobTitle: string | null;
  nationalId: string | null;
  address: string | null;
  notes: string | null;
  version: number;
  deviceCount: number;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceStatusInfo {
  key: string;
  label: string;
  tone: string;
}

export interface DeviceSummary {
  id: string;
  intakeCode: string;
  status: DeviceStatusInfo;
  equipmentType: { key: string; label: string };
  manufacturer: { key: string; label: string } | null;
  model: string | null;
  serialNumber: string | null;
  imei1: string | null;
  imei2: string | null;
  owner: { id: string; fullName: string; phone: string | null; jobTitle: string | null };
  broughtBy: { name: string; phone: string | null; job: string | null };
  technician: { id: string; fullName: string } | null;
  receivedAt: string;
  dueAt: string | null;
  deliveredAt: string | null;
  statusChangedAt: string;
  reportedProblem: string;
  hasPassword: boolean;
  operationCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
}

export interface DeviceStatusHistoryEntry {
  id: string;
  fromStatus: { key: string; label: string } | null;
  toStatus: { key: string; label: string };
  note: string | null;
  changedByName: string | null;
  changedAt: string;
}

export interface DeviceOperationEntry {
  id: string;
  operationType: { key: string; label: string };
  title: string;
  performedAt: string;
  technicianId: string | null;
  technicianName: string | null;
  description: string | null;
  dataSizeBytes: number | null;
  storagePath: string | null;
  result: { key: string; label: string };
  deviceStatusAfter: { key: string; label: string } | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface DeviceFileEntry {
  id: string;
  label: string;
  path: string;
  storageKind: string;
  relatedOperationId: string | null;
  relatedOperationTitle: string | null;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceNoteEntry {
  id: string;
  body: string;
  createdByName: string | null;
  createdAt: string;
}

export interface DeviceImageEntry {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  caption: string | null;
  uploadedByName: string | null;
  createdAt: string;
  url: string;
}

export interface DeviceDetail extends DeviceSummary {
  physicalCondition: string | null;
  accessories: string[];
  lockStatus: { key: string; label: string };
  notes: string | null;
  customFields: Record<string, unknown>;
  statusHistory: DeviceStatusHistoryEntry[];
  operations: DeviceOperationEntry[];
  files: DeviceFileEntry[];
  technicianNotes: DeviceNoteEntry[];
  images: DeviceImageEntry[];
}

export interface DuplicateDevice {
  id: string;
  intakeCode: string;
  receivedAt: string;
  status: { key: string; label: string };
  model: string | null;
  imei1: string | null;
  imei2: string | null;
  serialNumber: string | null;
  ownerName: string;
}

export interface FieldOptionValue {
  value: string;
  label: string;
}

export interface FieldDefinition {
  id: string;
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'multi_select' | 'checkbox' | 'password';
  group: string;
  placeholder: string | null;
  isSystem: boolean;
  isEnabled: boolean;
  isRequired: boolean;
  isLocked: boolean;
  options: FieldOptionValue[];
  sortOrder: number;
}

export interface OptionItem {
  id: string;
  key: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  usageCount: number;
}

export interface TechnicianOption {
  id: string;
  fullName: string;
  roleName: string;
}

export interface DeviceConfigData {
  fields: FieldDefinition[];
  options: Record<string, OptionItem[]>;
  technicians: TechnicianOption[];
}

export interface AuthPayload {
  accessToken: string;
  expiresIn: number;
  user: PublicUser;
}
