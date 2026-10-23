import { Injectable } from '@nestjs/common';
import type { PageResult } from '../../common/utils/pagination';
import { buildPage, resolvePagination } from '../../common/utils/pagination';
import { DatabaseService } from '../../database/database.service';
import {
  STORAGE_LOCATION_FROM,
  STORAGE_LOCATION_SELECT,
  toStorageFile,
  type OpenTicketResultDto,
  type StorageFileDto,
  type StorageFilePage,
  type StorageFileRow,
  type StorageLocationRow,
} from './storage.types';

export interface StorageLocationInput {
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
}

export interface StorageLocationChanges extends Partial<Omit<StorageLocationInput, 'isDefault'>> {
  isDefault?: boolean;
}

export interface StorageCheckResult {
  available: boolean;
  writable: boolean;
  totalBytes: number | null;
  freeBytes: number | null;
  usedBytes: number | null;
  usagePercent: number | null;
  lowSpace: boolean;
  error: string | null;
  checkedAt: Date;
}

export interface DeviceFileStorageInput {
  label: string;
  path: string;
  relativePath: string | null;
  clientPath: string | null;
  storageKind: string;
  category: string;
  storageLocationId: string | null;
  sizeBytes: number | null;
  accessStatus: string;
}

export interface StorageFileSearchFilter {
  search?: string;
  deviceId?: string;
  backupStatus?: string;
  accessStatus?: string;
  page?: number;
  pageSize?: number;
}

const FILE_SELECT = `
  f.id, f.device_id, d.intake_code, c.full_name AS owner_name, f.label, f.path,
  f.relative_path, f.client_path, f.storage_kind, f.category, f.size_bytes::text AS size_bytes,
  f.backup_status, f.alternative_path, f.access_status, f.last_checked_at, f.is_primary,
  f.notes, f.version, f.storage_location_id,
  s.name AS storage_location_name, s.kind AS storage_location_kind,
  s.root_path AS storage_location_root,
  u.full_name AS created_by_name, f.created_at, f.updated_at
`;

const FILE_FROM = `
  FROM device_files f
  JOIN devices d ON d.id = f.device_id
  JOIN customers c ON c.id = d.customer_id
  LEFT JOIN storage_locations s ON s.id = f.storage_location_id
  LEFT JOIN users u ON u.id = f.created_by
`;

@Injectable()
export class StorageRepository {
  constructor(private readonly db: DatabaseService) {}

  async listLocations(includeInactive = false): Promise<StorageLocationRow[]> {
    return this.db.query<StorageLocationRow>(
      `SELECT ${STORAGE_LOCATION_SELECT} ${STORAGE_LOCATION_FROM}
        WHERE s.deleted_at IS NULL AND ($1::boolean OR s.is_active = true)
        ORDER BY s.is_default DESC, s.created_at ASC`,
      [includeInactive],
    );
  }

  async findLocation(id: string): Promise<StorageLocationRow | null> {
    return this.db.queryOne<StorageLocationRow>(
      `SELECT ${STORAGE_LOCATION_SELECT} ${STORAGE_LOCATION_FROM}
        WHERE s.id = $1 AND s.deleted_at IS NULL`,
      [id],
    );
  }

  async findDefaultLocation(): Promise<StorageLocationRow | null> {
    return this.db.queryOne<StorageLocationRow>(
      `SELECT ${STORAGE_LOCATION_SELECT} ${STORAGE_LOCATION_FROM}
        WHERE s.is_default = true AND s.is_active = true AND s.deleted_at IS NULL
        LIMIT 1`,
    );
  }

  async countLocations(): Promise<number> {
    const row = await this.db.queryOne<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM storage_locations WHERE deleted_at IS NULL',
    );
    return Number(row?.count ?? 0);
  }

  async createLocation(
    input: StorageLocationInput,
    createdBy: string | null,
  ): Promise<StorageLocationRow | null> {
    const id = await this.db.withTransaction(async (client) => {
      if (input.isDefault) {
        await client.query(
          'UPDATE storage_locations SET is_default = false, updated_at = now() WHERE is_default = true',
        );
      }
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO storage_locations
           (name, root_path, client_root, kind, drive_letter, volume_label, volume_id,
            host_name, notes, is_default, is_active, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
          input.name,
          input.rootPath,
          input.clientRoot,
          input.kind,
          input.driveLetter,
          input.volumeLabel,
          input.volumeId,
          input.hostName,
          input.notes,
          input.isDefault,
          input.isActive,
          createdBy,
        ],
      );
      return inserted.rows[0]?.id ?? null;
    });
    return id ? this.findLocation(id) : null;
  }

  async updateLocation(
    id: string,
    version: number,
    changes: StorageLocationChanges,
  ): Promise<boolean> {
    return this.db.withTransaction(async (client) => {
      if (changes.isDefault === true) {
        await client.query(
          'UPDATE storage_locations SET is_default = false, updated_at = now() WHERE is_default = true AND id <> $1',
          [id],
        );
      }
      const sets: string[] = [];
      const params: unknown[] = [];
      const set = (column: string, value: unknown): void => {
        params.push(value);
        sets.push(`${column} = $${params.length}`);
      };
      if (changes.name !== undefined) set('name', changes.name);
      if (changes.rootPath !== undefined) set('root_path', changes.rootPath);
      if (changes.clientRoot !== undefined) set('client_root', changes.clientRoot);
      if (changes.kind !== undefined) set('kind', changes.kind);
      if (changes.driveLetter !== undefined) set('drive_letter', changes.driveLetter);
      if (changes.volumeLabel !== undefined) set('volume_label', changes.volumeLabel);
      if (changes.volumeId !== undefined) set('volume_id', changes.volumeId);
      if (changes.hostName !== undefined) set('host_name', changes.hostName);
      if (changes.notes !== undefined) set('notes', changes.notes);
      if (changes.isDefault !== undefined) set('is_default', changes.isDefault);
      if (changes.isActive !== undefined) set('is_active', changes.isActive);
      if (sets.length === 0) return true;

      sets.push('version = version + 1', 'updated_at = now()');
      params.push(id, version);
      const updated = await client.query(
        `UPDATE storage_locations
            SET ${sets.join(', ')}
          WHERE id = $${params.length - 1} AND version = $${params.length}
            AND deleted_at IS NULL
          RETURNING id`,
        params,
      );
      return (updated.rowCount ?? 0) > 0;
    });
  }

  async saveLocationCheck(id: string, result: StorageCheckResult): Promise<void> {
    await this.db.query(
      `UPDATE storage_locations
          SET last_checked_at = $2,
              last_success_at = CASE WHEN $3 THEN $2 ELSE last_success_at END,
              last_check_ok = $3,
              last_check_error = $4,
              updated_at = now()
        WHERE id = $1`,
      [id, result.checkedAt, result.available, result.error],
    );
  }

  async countDeviceFilesForLocation(locationId: string): Promise<number> {
    const row = await this.db.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM device_files
        WHERE storage_location_id = $1 AND deleted_at IS NULL`,
      [locationId],
    );
    return Number(row?.count ?? 0);
  }

  async softDeleteLocation(id: string, version: number): Promise<boolean> {
    const row = await this.db.queryOne<{ id: string }>(
      `UPDATE storage_locations
          SET deleted_at = now(), is_default = false, version = version + 1, updated_at = now()
        WHERE id = $1 AND version = $2 AND deleted_at IS NULL
        RETURNING id`,
      [id, version],
    );
    return Boolean(row);
  }

  async promoteFirstDefault(): Promise<StorageLocationRow | null> {
    const row = await this.db.queryOne<{ id: string }>(
      `UPDATE storage_locations s
          SET is_default = true, version = version + 1, updated_at = now()
        WHERE s.id = (
          SELECT id FROM storage_locations
           WHERE deleted_at IS NULL AND is_active = true AND is_default = false
           ORDER BY created_at ASC
           LIMIT 1
        )
        RETURNING s.id`,
    );
    if (!row) return null;
    return this.findLocation(row.id);
  }

  async findDeviceBasics(
    deviceId: string,
  ): Promise<{ id: string; intake_code: string; received_at: Date } | null> {
    return this.db.queryOne<{ id: string; intake_code: string; received_at: Date }>(
      'SELECT id, intake_code, received_at FROM devices WHERE id = $1',
      [deviceId],
    );
  }

  async findDeviceFile(deviceId: string, fileId: string): Promise<StorageFileRow | null> {
    return this.db.queryOne<StorageFileRow>(
      `SELECT ${FILE_SELECT} ${FILE_FROM}
        WHERE f.device_id = $1 AND f.id = $2 AND f.deleted_at IS NULL`,
      [deviceId, fileId],
    );
  }

  async findPrimaryDeviceFile(deviceId: string): Promise<StorageFileRow | null> {
    return this.db.queryOne<StorageFileRow>(
      `SELECT ${FILE_SELECT} ${FILE_FROM}
        WHERE f.device_id = $1 AND f.is_primary = true AND f.deleted_at IS NULL
        LIMIT 1`,
      [deviceId],
    );
  }

  async listDeviceFiles(deviceId: string): Promise<StorageFileDto[]> {
    const rows = await this.db.query<StorageFileRow>(
      `SELECT ${FILE_SELECT} ${FILE_FROM}
        WHERE f.device_id = $1 AND f.deleted_at IS NULL
        ORDER BY f.is_primary DESC, f.created_at ASC`,
      [deviceId],
    );
    return rows.map(toStorageFile);
  }

  async insertPrimaryDeviceFile(
    deviceId: string,
    input: DeviceFileStorageInput,
    createdBy: string | null,
  ): Promise<string | null> {
    const row = await this.db.queryOne<{ id: string }>(
      `INSERT INTO device_files
         (device_id, label, path, relative_path, client_path, storage_kind, category,
          storage_location_id, size_bytes, access_status, last_checked_at, is_primary,
          created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), true, $11)
       ON CONFLICT (device_id) WHERE is_primary AND deleted_at IS NULL DO NOTHING
       RETURNING id`,
      [
        deviceId,
        input.label,
        input.path,
        input.relativePath,
        input.clientPath,
        input.storageKind,
        input.category,
        input.storageLocationId,
        input.sizeBytes,
        input.accessStatus,
        createdBy,
      ],
    );
    return row?.id ?? null;
  }

  async updateDeviceFileAccess(
    fileId: string,
    data: {
      accessStatus: string;
      sizeBytes: number | null;
      checkedAt: Date;
      path?: string;
      relativePath?: string;
      clientPath?: string | null;
      storageLocationId?: string | null;
      storageKind?: string;
    },
  ): Promise<void> {
    const sets = [
      'access_status = $2',
      'size_bytes = $3',
      'last_checked_at = $4',
      'updated_at = now()',
    ];
    const params: unknown[] = [fileId, data.accessStatus, data.sizeBytes, data.checkedAt];
    if (data.path !== undefined) {
      params.push(data.path);
      sets.push(`path = $${params.length}`);
    }
    if (data.relativePath !== undefined) {
      params.push(data.relativePath);
      sets.push(`relative_path = $${params.length}`);
    }
    if (data.clientPath !== undefined) {
      params.push(data.clientPath);
      sets.push(`client_path = $${params.length}`);
    }
    if (data.storageLocationId !== undefined) {
      params.push(data.storageLocationId);
      sets.push(`storage_location_id = $${params.length}`);
    }
    if (data.storageKind !== undefined) {
      params.push(data.storageKind);
      sets.push(`storage_kind = $${params.length}`);
    }
    await this.db.query(
      `UPDATE device_files
          SET ${sets.join(', ')}
        WHERE id = $1 AND deleted_at IS NULL`,
      params,
    );
  }

  async searchFiles(filter: StorageFileSearchFilter): Promise<StorageFilePage> {
    const request = resolvePagination(filter.page, filter.pageSize);
    const params: unknown[] = [];
    const clauses: string[] = ['f.deleted_at IS NULL'];
    const term = filter.search?.trim();
    if (term) {
      params.push(`%${term}%`);
      const like = `$${params.length}`;
      clauses.push(`(
        d.intake_code ILIKE ${like}
        OR f.label ILIKE ${like}
        OR f.path ILIKE ${like}
        OR COALESCE(f.client_path, '') ILIKE ${like}
        OR COALESCE(f.relative_path, '') ILIKE ${like}
        OR COALESCE(f.notes, '') ILIKE ${like}
        OR c.full_name ILIKE ${like}
        OR COALESCE(c.phone, '') ILIKE ${like}
        OR COALESCE(d.model, '') ILIKE ${like}
        OR COALESCE(d.serial_number, '') ILIKE ${like}
        OR COALESCE(d.imei1, '') ILIKE ${like}
        OR COALESCE(d.imei2, '') ILIKE ${like}
      )`);
    }
    if (filter.deviceId) {
      params.push(filter.deviceId);
      clauses.push(`f.device_id = $${params.length}`);
    }
    if (filter.backupStatus) {
      params.push(filter.backupStatus);
      clauses.push(`f.backup_status = $${params.length}`);
    }
    if (filter.accessStatus) {
      params.push(filter.accessStatus);
      clauses.push(`f.access_status = $${params.length}`);
    }
    const where = `WHERE ${clauses.join(' AND ')}`;

    const total = await this.db.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count ${FILE_FROM} ${where}`,
      params,
    );
    const rows = await this.db.query<StorageFileRow>(
      `SELECT ${FILE_SELECT} ${FILE_FROM}
       ${where}
       ORDER BY d.received_at DESC, f.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, request.pageSize, request.offset],
    );
    return buildPage(rows.map(toStorageFile), Number(total?.count ?? 0), request);
  }

  async createOpenTicket(input: {
    tokenHash: string;
    path: string;
    clientPath: string | null;
    deviceFileId: string | null;
    requestedBy: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO storage_open_tickets
         (token_hash, device_file_id, path, client_path, requested_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.tokenHash,
        input.deviceFileId,
        input.path,
        input.clientPath,
        input.requestedBy,
        input.expiresAt,
      ],
    );
  }

  async consumeOpenTicket(tokenHash: string): Promise<OpenTicketResultDto | null> {
    const row = await this.db.queryOne<{
      path: string;
      client_path: string | null;
      label: string | null;
      intake_code: string | null;
    }>(
      `WITH claimed AS (
         UPDATE storage_open_tickets
            SET consumed_at = now()
          WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now()
          RETURNING id, device_file_id, path, client_path
       )
       SELECT c.path, c.client_path, f.label, d.intake_code
         FROM claimed c
         LEFT JOIN device_files f ON f.id = c.device_file_id
         LEFT JOIN devices d ON d.id = f.device_id`,
      [tokenHash],
    );
    if (!row) return null;
    return {
      serverPath: row.path,
      clientPath: row.client_path,
      preferredPath: row.client_path ?? row.path,
      fileLabel: row.label,
      intakeCode: row.intake_code,
    };
  }

  async purgeExpiredTickets(): Promise<void> {
    await this.db.query(
      `DELETE FROM storage_open_tickets
        WHERE expires_at < now() - interval '1 day' OR consumed_at < now() - interval '1 day'`,
    );
  }
}
