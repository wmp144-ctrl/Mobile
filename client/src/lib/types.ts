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
  logo: string;
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

export interface StorageSettings {
  folderLayout: string;
  subfolders: string[];
  lowSpaceGb: number;
}

export interface AppSettings {
  workshop: WorkshopSettings;
  security: SecuritySettings;
  backup: { retentionCount: number };
  devices: DeviceSettings;
  storage: StorageSettings;
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
  relativePath: string | null;
  clientPath: string | null;
  storageKind: string;
  category: string;
  sizeBytes: number | null;
  backupStatus: string;
  alternativePath: string | null;
  accessStatus: string;
  lastCheckedAt: string | null;
  isPrimary: boolean;
  version: number;
  storageLocation: {
    id: string;
    name: string;
    kind: string;
    rootPath: string;
  } | null;
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
  storageSummary: DeviceStorageSummary | null;
  technicianNotes: DeviceNoteEntry[];
  images: DeviceImageEntry[];
}

export interface DeviceStorageSummary {
  filesTotal: number;
  totalBytes: number;
  unavailableCount: number;
  lastCheckedAt: string | null;
  primaryFolder: {
    id: string;
    path: string;
    clientPath: string | null;
    accessStatus: string;
    locationName: string | null;
  } | null;
}

export interface StorageHealth {
  available: boolean;
  writable: boolean;
  totalBytes: number | null;
  freeBytes: number | null;
  usedBytes: number | null;
  usagePercent: number | null;
  lowSpace: boolean;
  checkedAt: string;
  lastSuccessAt: string | null;
  error: string | null;
}

export interface StorageLocation {
  id: string;
  name: string;
  rootPath: string;
  clientRoot: string | null;
  kind: 'server' | 'nas' | 'external';
  driveLetter: string | null;
  volumeLabel: string | null;
  volumeId: string | null;
  hostName: string | null;
  notes: string | null;
  isDefault: boolean;
  isActive: boolean;
  fileCount: number;
  dataBytes: number;
  version: number;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  health: StorageHealth;
}

export interface StorageFileEntry {
  id: string;
  deviceId: string;
  intakeCode: string;
  ownerName: string;
  label: string;
  path: string;
  relativePath: string | null;
  clientPath: string | null;
  storageKind: string;
  category: string;
  sizeBytes: number | null;
  backupStatus: string;
  alternativePath: string | null;
  accessStatus: string;
  lastCheckedAt: string | null;
  isPrimary: boolean;
  notes: string | null;
  version: number;
  storageLocation: {
    id: string;
    name: string;
    kind: string;
    rootPath: string;
  } | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StorageConfig {
  folderLayout: string;
  subfolders: string[];
  lowSpaceGb: number;
}

export interface StorageFolderPreview {
  location: {
    id: string;
    name: string;
    kind: string;
    rootPath: string;
    clientRoot: string | null;
  };
  relativePath: string;
  serverPath: string;
  clientPath: string | null;
  subfolders: string[];
}

export interface OpenTicket {
  token: string;
  expiresAt: string;
  path: string;
  clientPath: string | null;
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

/* ---------- داشبورد تحلیلی و گزارش‌گیری پیشرفته (مرحله ۴) ---------- */

export type ReportDimension =
  | 'equipmentType'
  | 'manufacturer'
  | 'model'
  | 'status'
  | 'job'
  | 'technician'
  | 'month'
  | 'year'
  | 'operationType'
  | 'customer';

export type ReportMetric =
  | 'count'
  | 'delivered'
  | 'failed'
  | 'active'
  | 'customers'
  | 'operations';

export type ReportChartType =
  | 'bar'
  | 'line'
  | 'pie'
  | 'doughnut'
  | 'area'
  | 'stackedBar'
  | 'combo';

export type ReportTableColumn =
  | 'intakeCode'
  | 'ownerName'
  | 'ownerPhone'
  | 'job'
  | 'equipmentType'
  | 'manufacturer'
  | 'model'
  | 'status'
  | 'technician'
  | 'receivedAt'
  | 'dueAt'
  | 'deliveredAt'
  | 'operationCount'
  | 'reportedProblem';

export interface AnalyticsFilter {
  from?: string;
  to?: string;
  year?: number;
  month?: number;
  equipmentType?: string;
  manufacturer?: string;
  model?: string;
  job?: string;
  technicianId?: string;
  status?: string;
  operationType?: string;
}

export interface ReportChartConfig {
  id: string;
  title?: string;
  dimension: ReportDimension;
  metric: ReportMetric;
  chartType: ReportChartType;
}

export interface ReportConfig extends AnalyticsFilter {
  charts: ReportChartConfig[];
  tableColumns?: ReportTableColumn[];
  tableLimit?: number;
}

export interface ReportChartSeries {
  name: string;
  data: number[];
}

export interface ReportChartResult {
  id: string;
  title: string;
  chartType: ReportChartType;
  dimension: ReportDimension;
  metric: ReportMetric;
  categories: string[];
  series: ReportChartSeries[];
  total: number;
  horizontal?: boolean;
}

export interface ReportTableColumnResult {
  key: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'status';
}

export interface ReportTableResult {
  columns: ReportTableColumnResult[];
  rows: Record<string, string | number | null>[];
  total: number;
}

export interface ReportRunResult {
  charts: ReportChartResult[];
  table: ReportTableResult;
  generatedAt: string;
  filters: AnalyticsFilter;
  workshop: { name: string; phone: string; address: string; logo: string };
}

export interface DashboardStats {
  totalEquipment: number;
  receivedToday: number;
  inProgress: number;
  done: number;
  failed: number;
  ready: number;
  delivered: number;
  customers: number;
}

export interface AnalyticsDashboard {
  stats: DashboardStats;
  charts: {
    equipmentTypes: ReportChartResult;
    manufacturers: ReportChartResult;
    monthlyTrend: ReportChartResult;
    yearly: ReportChartResult;
    jobs: ReportChartResult;
    statuses: ReportChartResult;
  };
  recentDevices: ReportTableResult;
  generatedAt: string;
  workshop: { name: string; phone: string; address: string; logo: string };
  currentUser: { fullName: string; roleNameFa: string };
}

export interface AnalyticsOptionItem {
  value: string;
  label: string;
  count?: number;
}

export interface AnalyticsOptions {
  equipmentTypes: AnalyticsOptionItem[];
  manufacturers: AnalyticsOptionItem[];
  models: string[];
  jobs: string[];
  technicians: { value: string; label: string }[];
  operationTypes: AnalyticsOptionItem[];
  statuses: { value: string; label: string; tone: string }[];
  years: { value: number; label: string }[];
  currentYear: number;
  currentMonth: number;
  workshop: { name: string; phone: string; address: string; logo: string };
}

export interface SavedReport {
  id: string;
  name: string;
  description: string | null;
  config: ReportConfig;
  isShared: boolean;
  version: number;
  ownerName: string | null;
  createdAt: string;
  updatedAt: string;
  canManage: boolean;
}
