import type { PageResult } from '../../common/utils/pagination';

export interface StorageLocationRow {
  id: string;
  name: string;
  root_path: string;
  client_root: string | null;
  kind: string;
  drive_letter: string | null;
  volume_label: string | null;
  volume_id: string | null;
  host_name: string | null;
  notes: string | null;
  is_default: boolean;
  is_active: boolean;
  last_checked_at: Date | null;
  last_success_at: Date | null;
  last_check_ok: boolean | null;
  last_check_error: string | null;
  version: number;
  created_by_name: string | null;
  created_at: Date;
  updated_at: Date;
  file_count: number;
  data_bytes: string | null;
}

export interface StorageHealthDto {
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

export interface StorageLocationDto {
  id: string;
  name: string;
  rootPath: string;
  clientRoot: string | null;
  kind: string;
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
  health: StorageHealthDto;
}

export interface StorageFolderPreviewDto {
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

export interface StorageFileRow {
  id: string;
  device_id: string;
  intake_code: string;
  owner_name: string;
  label: string;
  path: string;
  relative_path: string | null;
  client_path: string | null;
  storage_kind: string;
  category: string;
  size_bytes: string | null;
  backup_status: string;
  alternative_path: string | null;
  access_status: string;
  last_checked_at: Date | null;
  is_primary: boolean;
  notes: string | null;
  version: number;
  storage_location_id: string | null;
  storage_location_name: string | null;
  storage_location_kind: string | null;
  storage_location_root: string | null;
  created_by_name: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface StorageFileDto {
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

export type StorageFilePage = PageResult<StorageFileDto>;

export interface DeviceStorageSummaryDto {
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

export interface OpenTicketDto {
  token: string;
  expiresAt: string;
  path: string;
  clientPath: string | null;
}

export interface OpenTicketResultDto {
  serverPath: string;
  clientPath: string | null;
  preferredPath: string;
  fileLabel: string | null;
  intakeCode: string | null;
}

export const STORAGE_LOCATION_SELECT = `
  s.id, s.name, s.root_path, s.client_root, s.kind, s.drive_letter, s.volume_label,
  s.volume_id, s.host_name, s.notes, s.is_default, s.is_active, s.last_checked_at,
  s.last_success_at, s.last_check_ok, s.last_check_error, s.version,
  u.full_name AS created_by_name, s.created_at, s.updated_at,
  (SELECT COUNT(*)::int FROM device_files f
    WHERE f.storage_location_id = s.id AND f.deleted_at IS NULL) AS file_count,
  (SELECT COALESCE(SUM(f.size_bytes), 0)::text FROM device_files f
    WHERE f.storage_location_id = s.id AND f.deleted_at IS NULL) AS data_bytes
`;

export const STORAGE_LOCATION_FROM = `
  FROM storage_locations s
  LEFT JOIN users u ON u.id = s.created_by
`;

export function toStorageLocation(
  row: StorageLocationRow,
  health: StorageHealthDto,
): StorageLocationDto {
  return {
    id: row.id,
    name: row.name,
    rootPath: row.root_path,
    clientRoot: row.client_root,
    kind: row.kind,
    driveLetter: row.drive_letter,
    volumeLabel: row.volume_label,
    volumeId: row.volume_id,
    hostName: row.host_name,
    notes: row.notes,
    isDefault: row.is_default,
    isActive: row.is_active,
    fileCount: row.file_count,
    dataBytes: row.data_bytes === null ? 0 : Number(row.data_bytes),
    version: row.version,
    createdByName: row.created_by_name,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    health,
  };
}

export function toStorageFile(row: StorageFileRow): StorageFileDto {
  return {
    id: row.id,
    deviceId: row.device_id,
    intakeCode: row.intake_code,
    ownerName: row.owner_name,
    label: row.label,
    path: row.path,
    relativePath: row.relative_path,
    clientPath: row.client_path,
    storageKind: row.storage_kind,
    category: row.category,
    sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
    backupStatus: row.backup_status,
    alternativePath: row.alternative_path,
    accessStatus: row.access_status,
    lastCheckedAt: row.last_checked_at ? row.last_checked_at.toISOString() : null,
    isPrimary: row.is_primary,
    notes: row.notes,
    version: row.version,
    storageLocation: row.storage_location_id
      ? {
          id: row.storage_location_id,
          name: row.storage_location_name ?? '',
          kind: row.storage_location_kind ?? 'server',
          rootPath: row.storage_location_root ?? '',
        }
      : null,
    createdByName: row.created_by_name,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
