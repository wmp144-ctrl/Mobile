import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';
import { DEVICE_STATUSES } from '../../common/device-status';
import { buildPage, resolvePagination, type PageResult } from '../../common/utils/pagination';
import {
  DEVICE_FROM,
  DEVICE_SELECT,
  toDeviceSummary,
  toDuplicate,
  toFile,
  toImage,
  toNote,
  toOperation,
  toStatusHistory,
  type DeviceDetailDto,
  type DeviceFileDto,
  type DeviceFileRow,
  type DeviceImageDto,
  type DeviceImageRow,
  type DeviceNoteDto,
  type DeviceNoteRow,
  type DeviceOperationDto,
  type DeviceOperationRow,
  type DeviceRow,
  type DeviceStatusHistoryDto,
  type DeviceStatusHistoryRow,
  type DeviceSummaryDto,
  type DuplicateDeviceDto,
  type DuplicateDeviceRow,
} from './devices.types';

const STATUS_ORDER_ARRAY = `ARRAY[${DEVICE_STATUSES.map((status) => `'${status.key}'`).join(
  ',',
)}]::text[]`;

const SORT_COLUMNS: Record<string, string> = {
  intakeCode: 'd.intake_code',
  receivedAt: 'd.received_at',
  dueAt: 'd.due_at',
  status: `array_position(${STATUS_ORDER_ARRAY}, d.status)`,
  owner: 'c.full_name',
  equipmentType: 'et.label_fa',
  manufacturer: 'mf.label_fa',
  model: 'd.model',
  updatedAt: 'd.updated_at',
};

export interface ListDevicesFilter {
  search?: string;
  status?: string;
  equipmentType?: string;
  manufacturer?: string;
  technicianId?: string;
  customerId?: string;
  receivedFrom?: string;
  receivedTo?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface DeviceInput {
  customerId: string;
  broughtByName: string;
  broughtByJob: string | null;
  broughtByPhone: string | null;
  equipmentType: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  imei1: string | null;
  imei2: string | null;
  receivedAt: Date;
  dueAt: Date | null;
  physicalCondition: string | null;
  accessories: string[];
  lockStatus: string;
  devicePasswordCipher: string | null;
  reportedProblem: string;
  notes: string | null;
  technicianId: string | null;
  customFields: Record<string, unknown>;
}

export interface OperationInput {
  operationType: string;
  title: string;
  performedAt: Date;
  technicianId: string | null;
  description: string | null;
  dataSizeBytes: number | null;
  storagePath: string | null;
  result: string;
  deviceStatusAfter: string | null;
}

export interface OperationChanges extends Partial<Omit<OperationInput, 'deviceStatusAfter'>> {}

export interface FileInput {
  label: string;
  path: string;
  relativePath: string | null;
  clientPath: string | null;
  storageKind: string;
  category: string;
  sizeBytes: number | null;
  backupStatus: string;
  alternativePath: string | null;
  storageLocationId: string | null;
  relatedOperationId: string | null;
  notes: string | null;
}

export interface ImageInput {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  caption: string | null;
  uploadedBy: string;
}

interface DuplicateFilter {
  imei1?: string | null;
  imei2?: string | null;
  serialNumber?: string | null;
  excludeId?: string | null;
}

@Injectable()
export class DevicesRepository {
  constructor(private readonly db: DatabaseService) {}

  private buildFilters(filter: ListDevicesFilter): { where: string; params: unknown[] } {
    const params: unknown[] = [];
    const clauses: string[] = [];
    const param = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    const term = filter.search?.trim();
    if (term) {
      const like = param(`%${term}%`);
      clauses.push(`(
        d.intake_code ILIKE ${like}
        OR COALESCE(d.imei1, '') ILIKE ${like}
        OR COALESCE(d.imei2, '') ILIKE ${like}
        OR COALESCE(d.serial_number, '') ILIKE ${like}
        OR COALESCE(d.model, '') ILIKE ${like}
        OR d.reported_problem ILIKE ${like}
        OR c.full_name ILIKE ${like}
        OR COALESCE(c.phone, '') ILIKE ${like}
        OR COALESCE(c.job_title, '') ILIKE ${like}
        OR d.brought_by_name ILIKE ${like}
        OR COALESCE(d.brought_by_phone, '') ILIKE ${like}
        OR COALESCE(et.label_fa, '') ILIKE ${like}
        OR COALESCE(mf.label_fa, '') ILIKE ${like}
        OR COALESCE(t.full_name, '') ILIKE ${like}
        OR EXISTS (
          SELECT 1 FROM device_operations o
           WHERE o.device_id = d.id AND o.deleted_at IS NULL AND o.title ILIKE ${like}
        )
        OR EXISTS (
          SELECT 1 FROM device_operations o
            JOIN option_lists ol ON ol.category = 'operation_type' AND ol.value_key = o.operation_type
           WHERE o.device_id = d.id AND o.deleted_at IS NULL AND ol.label_fa ILIKE ${like}
        )
        OR EXISTS (
          SELECT 1
            FROM jsonb_each_text(d.custom_fields) cf
            JOIN field_definitions fd
              ON fd.entity = 'device' AND fd.field_key = cf.key AND fd.is_searchable
           WHERE cf.value ILIKE ${like}
        )
      )`);
    }
    if (filter.status) clauses.push(`d.status = ${param(filter.status)}`);
    if (filter.equipmentType) clauses.push(`d.equipment_type = ${param(filter.equipmentType)}`);
    if (filter.manufacturer) clauses.push(`d.manufacturer = ${param(filter.manufacturer)}`);
    if (filter.technicianId) clauses.push(`d.technician_id = ${param(filter.technicianId)}`);
    if (filter.customerId) clauses.push(`d.customer_id = ${param(filter.customerId)}`);
    if (filter.receivedFrom) clauses.push(`d.received_at >= ${param(filter.receivedFrom)}`);
    if (filter.receivedTo) clauses.push(`d.received_at < ${param(filter.receivedTo)}`);

    return {
      where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
      params,
    };
  }

  async list(filter: ListDevicesFilter): Promise<PageResult<DeviceSummaryDto>> {
    const request = resolvePagination(filter.page, filter.pageSize);
    const { where, params } = this.buildFilters(filter);
    const sortColumn = SORT_COLUMNS[filter.sortBy ?? 'receivedAt'] ?? SORT_COLUMNS.receivedAt;
    const direction = filter.sortDir === 'asc' ? 'ASC' : 'DESC';
    const nulls = filter.sortBy === 'dueAt' ? ' NULLS LAST' : '';

    const countRow = await this.db.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count ${DEVICE_FROM} ${where}`,
      params,
    );
    const rows = await this.db.query<DeviceRow>(
      `SELECT ${DEVICE_SELECT} ${DEVICE_FROM}
       ${where}
       ORDER BY ${sortColumn} ${direction}${nulls}, d.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, request.pageSize, request.offset],
    );
    return buildPage(rows.map(toDeviceSummary), Number(countRow?.count ?? 0), request);
  }

  async listForExport(filter: ListDevicesFilter, limit = 5000): Promise<DeviceRow[]> {
    const { where, params } = this.buildFilters(filter);
    return this.db.query<DeviceRow>(
      `SELECT ${DEVICE_SELECT} ${DEVICE_FROM}
       ${where}
       ORDER BY d.received_at DESC
       LIMIT $${params.length + 1}`,
      [...params, limit],
    );
  }

  async findById(id: string): Promise<DeviceRow | null> {
    return this.db.queryOne<DeviceRow>(`SELECT ${DEVICE_SELECT} ${DEVICE_FROM} WHERE d.id = $1`, [id]);
  }

  async findDuplicates(filter: DuplicateFilter): Promise<DuplicateDeviceDto[]> {
    const imei1 = filter.imei1 || null;
    const imei2 = filter.imei2 || null;
    const serial = filter.serialNumber || null;
    if (!imei1 && !imei2 && !serial) return [];

    const rows = await this.db.query<DuplicateDeviceRow>(
      `SELECT d.id, d.intake_code, d.received_at, d.status, d.model, d.imei1, d.imei2,
              d.serial_number, c.full_name AS owner_name, d.customer_id
         FROM devices d
         JOIN customers c ON c.id = d.customer_id
        WHERE ($1::uuid IS NULL OR d.id <> $1)
          AND (
            ($2::text IS NOT NULL AND (d.imei1 = $2 OR d.imei2 = $2))
            OR ($3::text IS NOT NULL AND (d.imei1 = $3 OR d.imei2 = $3))
            OR ($4::text IS NOT NULL AND d.serial_number = $4)
          )
        ORDER BY d.received_at DESC
        LIMIT 10`,
      [filter.excludeId ?? null, imei1, imei2, serial],
    );
    return rows.map(toDuplicate);
  }

  /**
   * ایجاد پرونده با کد پذیرش یکتا.
   * قفل advisory تراکنشی مانع تولید کد تکراری در درخواست‌های هم‌زمان چند کلاینت می‌شود.
   */
  async createWithIntakeCode(
    input: DeviceInput,
    prefix: string,
    year: number,
    actor: { id: string; username: string },
  ): Promise<string> {
    const scope = `${prefix}-${year}`;
    return this.db.withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [scope]);
      const nextRow = await client.query<{ next: string }>(
        `SELECT COALESCE(MAX(CASE WHEN intake_code ~ ('^' || $1 || '-[0-9]+$')
                                  THEN split_part(intake_code, '-', 3)::int END), 0) + 1 AS next
           FROM devices`,
        [scope],
      );
      const sequence = Number(nextRow.rows[0]?.next ?? 1);
      const intakeCode = `${scope}-${String(sequence).padStart(4, '0')}`;

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO devices
           (intake_code, customer_id, brought_by_name, brought_by_job, brought_by_phone,
            equipment_type, manufacturer, model, serial_number, imei1, imei2,
            received_at, due_at, physical_condition, accessories, lock_status,
            device_password_cipher, reported_problem, notes, technician_id,
            status, status_changed_at, custom_fields, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16,
                 $17, $18, $19, $20, 'received', $12, $21::jsonb, $22)
         RETURNING id`,
        [
          intakeCode,
          input.customerId,
          input.broughtByName,
          input.broughtByJob,
          input.broughtByPhone,
          input.equipmentType,
          input.manufacturer,
          input.model,
          input.serialNumber,
          input.imei1,
          input.imei2,
          input.receivedAt,
          input.dueAt,
          input.physicalCondition,
          JSON.stringify(input.accessories),
          input.lockStatus,
          input.devicePasswordCipher,
          input.reportedProblem,
          input.notes,
          input.technicianId,
          JSON.stringify(input.customFields),
          actor.id,
        ],
      );
      const id = inserted.rows[0]?.id;
      if (!id) throw new Error('ایجاد پرونده دستگاه ناموفق بود.');

      await client.query(
        `INSERT INTO device_status_history
           (device_id, from_status, to_status, note, changed_by, changed_by_name)
         VALUES ($1, NULL, 'received', 'پذیرش دستگاه و ثبت پرونده', $2,
                 (SELECT full_name FROM users WHERE id = $2))`,
        [id, actor.id],
      );
      await client.query(
        `INSERT INTO intake_counters (scope, last_value, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (scope) DO UPDATE
           SET last_value = GREATEST(intake_counters.last_value, EXCLUDED.last_value),
               updated_at = now()`,
        [scope, sequence],
      );
      return id;
    });
  }

  async update(
    id: string,
    version: number,
    changes: Partial<DeviceInput>,
  ): Promise<{ id: string; intakeCode: string } | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (column: string, value: unknown, cast = ''): void => {
      params.push(value);
      sets.push(`${column} = $${params.length}${cast}`);
    };

    if (changes.customerId !== undefined) set('customer_id', changes.customerId);
    if (changes.broughtByName !== undefined) set('brought_by_name', changes.broughtByName);
    if (changes.broughtByJob !== undefined) set('brought_by_job', changes.broughtByJob);
    if (changes.broughtByPhone !== undefined) set('brought_by_phone', changes.broughtByPhone);
    if (changes.equipmentType !== undefined) set('equipment_type', changes.equipmentType);
    if (changes.manufacturer !== undefined) set('manufacturer', changes.manufacturer);
    if (changes.model !== undefined) set('model', changes.model);
    if (changes.serialNumber !== undefined) set('serial_number', changes.serialNumber);
    if (changes.imei1 !== undefined) set('imei1', changes.imei1);
    if (changes.imei2 !== undefined) set('imei2', changes.imei2);
    if (changes.receivedAt !== undefined) set('received_at', changes.receivedAt);
    if (changes.dueAt !== undefined) set('due_at', changes.dueAt);
    if (changes.physicalCondition !== undefined) set('physical_condition', changes.physicalCondition);
    if (changes.accessories !== undefined)
      set('accessories', JSON.stringify(changes.accessories), '::jsonb');
    if (changes.lockStatus !== undefined) set('lock_status', changes.lockStatus);
    if (changes.devicePasswordCipher !== undefined)
      set('device_password_cipher', changes.devicePasswordCipher);
    if (changes.reportedProblem !== undefined) set('reported_problem', changes.reportedProblem);
    if (changes.notes !== undefined) set('notes', changes.notes);
    if (changes.technicianId !== undefined) set('technician_id', changes.technicianId);
    if (changes.customFields !== undefined)
      set('custom_fields', JSON.stringify(changes.customFields), '::jsonb');

    if (sets.length === 0) return { id, intakeCode: '' };

    sets.push('version = version + 1', 'updated_at = now()');
    params.push(id, version);
    const idIndex = params.length - 1;
    const versionIndex = params.length;

    const updated = await this.db.queryOne<{ id: string; intake_code: string }>(
      `UPDATE devices
          SET ${sets.join(', ')}
        WHERE id = $${idIndex} AND version = $${versionIndex}
        RETURNING id, intake_code`,
      params,
    );
    return updated ? { id: updated.id, intakeCode: updated.intake_code } : null;
  }

  async changeStatus(
    id: string,
    fromStatus: string,
    toStatus: string,
    note: string | null,
    actor: { id: string; username: string },
    expectedVersion?: number,
  ): Promise<boolean> {
    return this.db.withTransaction(async (client) => {
      const updated = await client.query<{ id: string }>(
        `UPDATE devices
            SET status = $2,
                status_changed_at = now(),
                delivered_at = CASE WHEN $2 = 'delivered' THEN now() ELSE NULL END,
                version = version + 1,
                updated_at = now()
          WHERE id = $1 AND ($3::int IS NULL OR version = $3)
          RETURNING id`,
        [id, toStatus, expectedVersion ?? null],
      );
      if (updated.rowCount === 0) return false;

      await client.query(
        `INSERT INTO device_status_history
           (device_id, from_status, to_status, note, changed_by, changed_by_name)
         VALUES ($1, $2, $3, $4, $5, (SELECT full_name FROM users WHERE id = $5))`,
        [id, fromStatus, toStatus, note, actor.id],
      );
      return true;
    });
  }

  async listHistory(deviceId: string): Promise<DeviceStatusHistoryDto[]> {
    const rows = await this.db.query<DeviceStatusHistoryRow>(
      `SELECT id::text, device_id, from_status, to_status, note, changed_by, changed_by_name, changed_at
         FROM device_status_history
        WHERE device_id = $1
        ORDER BY changed_at DESC, id DESC`,
      [deviceId],
    );
    return rows.map(toStatusHistory);
  }

  async listOperations(deviceId: string): Promise<DeviceOperationDto[]> {
    const rows = await this.db.query<DeviceOperationRow>(
      `SELECT o.id, o.device_id, o.operation_type, o.title, o.performed_at, o.technician_id,
              o.technician_name, o.description, o.data_size_bytes::text AS data_size_bytes,
              o.storage_path, o.result, o.device_status_after, o.version,
              u.full_name AS created_by_name, o.created_at, o.updated_at,
              ol.label_fa AS operation_type_label
         FROM device_operations o
         LEFT JOIN users u ON u.id = o.created_by
         LEFT JOIN option_lists ol ON ol.category = 'operation_type' AND ol.value_key = o.operation_type
        WHERE o.device_id = $1 AND o.deleted_at IS NULL
        ORDER BY o.performed_at DESC, o.created_at DESC`,
      [deviceId],
    );
    return rows.map(toOperation);
  }

  async findOperation(deviceId: string, operationId: string): Promise<DeviceOperationRow | null> {
    return this.db.queryOne<DeviceOperationRow>(
      `SELECT o.id, o.device_id, o.operation_type, o.title, o.performed_at, o.technician_id,
              o.technician_name, o.description, o.data_size_bytes::text AS data_size_bytes,
              o.storage_path, o.result, o.device_status_after, o.version,
              u.full_name AS created_by_name, o.created_at, o.updated_at,
              ol.label_fa AS operation_type_label
         FROM device_operations o
         LEFT JOIN users u ON u.id = o.created_by
         LEFT JOIN option_lists ol ON ol.category = 'operation_type' AND ol.value_key = o.operation_type
        WHERE o.device_id = $1 AND o.id = $2 AND o.deleted_at IS NULL`,
      [deviceId, operationId],
    );
  }

  async createOperation(
    deviceId: string,
    input: OperationInput,
    actor: { id: string; username: string },
  ): Promise<{ id: string; statusChanged: boolean }> {
    return this.db.withTransaction(async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO device_operations
           (device_id, operation_type, title, performed_at, technician_id, technician_name,
            description, data_size_bytes, storage_path, result, device_status_after, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
          deviceId,
          input.operationType,
          input.title,
          input.performedAt,
          input.technicianId,
          input.technicianId ? await this.technicianName(client, input.technicianId) : null,
          input.description,
          input.dataSizeBytes,
          input.storagePath,
          input.result,
          input.deviceStatusAfter,
          actor.id,
        ],
      );
      const operationId = inserted.rows[0]?.id;
      if (!operationId) throw new Error('ثبت اقدام ناموفق بود.');

      let statusChanged = false;
      if (input.deviceStatusAfter) {
        const current = await client.query<{ status: string }>(
          'SELECT status FROM devices WHERE id = $1 FOR UPDATE',
          [deviceId],
        );
        const previousStatus = current.rows[0]?.status;
        if (previousStatus && previousStatus !== input.deviceStatusAfter) {
          await client.query(
            `UPDATE devices
                SET status = $2,
                    status_changed_at = now(),
                    delivered_at = CASE WHEN $2 = 'delivered' THEN now() ELSE NULL END,
                    version = version + 1,
                    updated_at = now()
              WHERE id = $1`,
            [deviceId, input.deviceStatusAfter],
          );
          await client.query(
            `INSERT INTO device_status_history
               (device_id, from_status, to_status, note, changed_by, changed_by_name)
             VALUES ($1, $2, $3, $4, $5, (SELECT full_name FROM users WHERE id = $5))`,
            [
              deviceId,
              previousStatus,
              input.deviceStatusAfter,
              `پس از اقدام «${input.title}»`,
              actor.id,
            ],
          );
          statusChanged = true;
        }
      }
      return { id: operationId, statusChanged };
    });
  }

  async updateOperation(
    deviceId: string,
    operationId: string,
    version: number,
    changes: OperationChanges,
  ): Promise<boolean> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (column: string, value: unknown): void => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };
    if (changes.operationType !== undefined) set('operation_type', changes.operationType);
    if (changes.title !== undefined) set('title', changes.title);
    if (changes.performedAt !== undefined) set('performed_at', changes.performedAt);
    if (changes.technicianId !== undefined) {
      set('technician_id', changes.technicianId);
      set('technician_name', await this.technicianName(undefined, changes.technicianId));
    }
    if (changes.description !== undefined) set('description', changes.description);
    if (changes.dataSizeBytes !== undefined) set('data_size_bytes', changes.dataSizeBytes);
    if (changes.storagePath !== undefined) set('storage_path', changes.storagePath);
    if (changes.result !== undefined) set('result', changes.result);

    if (sets.length === 0) return true;

    sets.push('version = version + 1', 'updated_at = now()');
    params.push(deviceId, operationId, version);
    const updated = await this.db.queryOne<{ id: string }>(
      `UPDATE device_operations
          SET ${sets.join(', ')}
        WHERE id = $${params.length - 1} AND device_id = $${params.length - 2}
          AND version = $${params.length} AND deleted_at IS NULL
        RETURNING id`,
      params,
    );
    return Boolean(updated);
  }

  async softDeleteOperation(deviceId: string, operationId: string): Promise<boolean> {
    const row = await this.db.queryOne<{ id: string }>(
      `UPDATE device_operations
          SET deleted_at = now(), version = version + 1, updated_at = now()
        WHERE id = $1 AND device_id = $2 AND deleted_at IS NULL
        RETURNING id`,
      [operationId, deviceId],
    );
    return Boolean(row);
  }

  async listFiles(deviceId: string): Promise<DeviceFileDto[]> {
    const rows = await this.db.query<DeviceFileRow>(
      `SELECT f.id, f.device_id, f.label, f.path, f.relative_path, f.client_path,
              f.storage_kind, f.category, f.size_bytes::text AS size_bytes, f.backup_status,
              f.alternative_path, f.access_status, f.last_checked_at, f.is_primary,
              f.storage_location_id,
              s.name AS storage_location_name, s.kind AS storage_location_kind,
              s.root_path AS storage_location_root,
              f.related_operation_id, o.title AS related_operation_title, f.notes,
              u.full_name AS created_by_name, f.version, f.created_at, f.updated_at
         FROM device_files f
         LEFT JOIN users u ON u.id = f.created_by
         LEFT JOIN device_operations o ON o.id = f.related_operation_id
         LEFT JOIN storage_locations s ON s.id = f.storage_location_id
        WHERE f.device_id = $1 AND f.deleted_at IS NULL
        ORDER BY f.is_primary DESC, f.created_at ASC`,
      [deviceId],
    );
    return rows.map(toFile);
  }

  async findFile(deviceId: string, fileId: string): Promise<DeviceFileRow | null> {
    return this.db.queryOne<DeviceFileRow>(
      `SELECT f.id, f.device_id, f.label, f.path, f.relative_path, f.client_path,
              f.storage_kind, f.category, f.size_bytes::text AS size_bytes, f.backup_status,
              f.alternative_path, f.access_status, f.last_checked_at, f.is_primary,
              f.storage_location_id,
              s.name AS storage_location_name, s.kind AS storage_location_kind,
              s.root_path AS storage_location_root,
              f.related_operation_id, o.title AS related_operation_title, f.notes,
              u.full_name AS created_by_name, f.version, f.created_at, f.updated_at
         FROM device_files f
         LEFT JOIN users u ON u.id = f.created_by
         LEFT JOIN device_operations o ON o.id = f.related_operation_id
         LEFT JOIN storage_locations s ON s.id = f.storage_location_id
        WHERE f.device_id = $1 AND f.id = $2 AND f.deleted_at IS NULL`,
      [deviceId, fileId],
    );
  }

  async createFile(
    deviceId: string,
    input: FileInput,
    createdBy: string,
  ): Promise<DeviceFileRow | null> {
    const inserted = await this.db.queryOne<{ id: string }>(
      `INSERT INTO device_files
         (device_id, label, path, relative_path, client_path, storage_kind, category,
          size_bytes, backup_status, alternative_path, storage_location_id,
          related_operation_id, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [
        deviceId,
        input.label,
        input.path,
        input.relativePath,
        input.clientPath,
        input.storageKind,
        input.category,
        input.sizeBytes,
        input.backupStatus,
        input.alternativePath,
        input.storageLocationId,
        input.relatedOperationId,
        input.notes,
        createdBy,
      ],
    );
    return inserted ? this.findFile(deviceId, inserted.id) : null;
  }

  async updateFile(
    deviceId: string,
    fileId: string,
    changes: Partial<FileInput>,
  ): Promise<boolean> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (column: string, value: unknown): void => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };
    if (changes.label !== undefined) set('label', changes.label);
    if (changes.path !== undefined) set('path', changes.path);
    if (changes.relativePath !== undefined) set('relative_path', changes.relativePath);
    if (changes.clientPath !== undefined) set('client_path', changes.clientPath);
    if (changes.storageKind !== undefined) set('storage_kind', changes.storageKind);
    if (changes.category !== undefined) set('category', changes.category);
    if (changes.sizeBytes !== undefined) set('size_bytes', changes.sizeBytes);
    if (changes.backupStatus !== undefined) set('backup_status', changes.backupStatus);
    if (changes.alternativePath !== undefined) set('alternative_path', changes.alternativePath);
    if (changes.storageLocationId !== undefined)
      set('storage_location_id', changes.storageLocationId);
    if (changes.relatedOperationId !== undefined)
      set('related_operation_id', changes.relatedOperationId);
    if (changes.notes !== undefined) set('notes', changes.notes);
    if (sets.length === 0) return true;

    sets.push('version = version + 1', 'updated_at = now()');
    params.push(deviceId, fileId);
    const updated = await this.db.queryOne<{ id: string }>(
      `UPDATE device_files
          SET ${sets.join(', ')}
        WHERE id = $${params.length} AND device_id = $${params.length - 1}
          AND deleted_at IS NULL
        RETURNING id`,
      params,
    );
    return Boolean(updated);
  }

  async softDeleteFile(deviceId: string, fileId: string): Promise<boolean> {
    const row = await this.db.queryOne<{ id: string }>(
      `UPDATE device_files
          SET deleted_at = now(), updated_at = now()
        WHERE id = $1 AND device_id = $2 AND deleted_at IS NULL
        RETURNING id`,
      [fileId, deviceId],
    );
    return Boolean(row);
  }

  async listNotes(deviceId: string): Promise<DeviceNoteDto[]> {
    const rows = await this.db.query<DeviceNoteRow>(
      `SELECT n.id, n.device_id, n.body, u.full_name AS created_by_name, n.created_at
         FROM device_notes n
         LEFT JOIN users u ON u.id = n.created_by
        WHERE n.device_id = $1
        ORDER BY n.created_at DESC`,
      [deviceId],
    );
    return rows.map(toNote);
  }

  async createNote(
    deviceId: string,
    body: string,
    actor: { id: string; username: string },
  ): Promise<DeviceNoteDto | null> {
    const inserted = await this.db.queryOne<DeviceNoteRow>(
      `INSERT INTO device_notes (device_id, body, created_by, created_by_name)
       VALUES ($1, $2, $3, (SELECT full_name FROM users WHERE id = $3))
       RETURNING id, device_id, body,
                 (SELECT full_name FROM users WHERE id = $3) AS created_by_name, created_at`,
      [deviceId, body, actor.id],
    );
    return inserted ? toNote(inserted) : null;
  }

  async deleteNote(deviceId: string, noteId: string): Promise<boolean> {
    const row = await this.db.queryOne<{ id: string }>(
      'DELETE FROM device_notes WHERE id = $1 AND device_id = $2 RETURNING id',
      [noteId, deviceId],
    );
    return Boolean(row);
  }

  async listImages(deviceId: string): Promise<DeviceImageDto[]> {
    const rows = await this.db.query<DeviceImageRow>(
      `SELECT i.id, i.device_id, i.original_name, i.mime_type, i.size_bytes, i.caption,
              u.full_name AS uploaded_by_name, i.created_at, i.storage_path
         FROM device_images i
         LEFT JOIN users u ON u.id = i.uploaded_by
        WHERE i.device_id = $1
        ORDER BY i.created_at DESC`,
      [deviceId],
    );
    return rows.map(toImage);
  }

  async findImage(deviceId: string, imageId: string): Promise<DeviceImageRow | null> {
    return this.db.queryOne<DeviceImageRow>(
      `SELECT i.id, i.device_id, i.original_name, i.mime_type, i.size_bytes, i.caption,
              u.full_name AS uploaded_by_name, i.created_at, i.storage_path
         FROM device_images i
         LEFT JOIN users u ON u.id = i.uploaded_by
        WHERE i.device_id = $1 AND i.id = $2`,
      [deviceId, imageId],
    );
  }

  async insertImage(deviceId: string, input: ImageInput): Promise<DeviceImageDto | null> {
    const inserted = await this.db.queryOne<{ id: string }>(
      `INSERT INTO device_images
         (device_id, original_name, mime_type, size_bytes, storage_path, caption, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        deviceId,
        input.originalName,
        input.mimeType,
        input.sizeBytes,
        input.storagePath,
        input.caption,
        input.uploadedBy,
      ],
    );
    if (!inserted) return null;
    const row = await this.findImage(deviceId, inserted.id);
    return row ? toImage(row) : null;
  }

  async deleteImage(deviceId: string, imageId: string): Promise<boolean> {
    const row = await this.db.queryOne<{ id: string }>(
      'DELETE FROM device_images WHERE id = $1 AND device_id = $2 RETURNING id',
      [imageId, deviceId],
    );
    return Boolean(row);
  }

  async findTechnician(id: string): Promise<{ id: string; full_name: string } | null> {
    return this.db.queryOne<{ id: string; full_name: string }>(
      'SELECT id, full_name FROM users WHERE id = $1 AND deleted_at IS NULL AND is_active = true',
      [id],
    );
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

  async countByStatus(): Promise<{ status: string; count: number }[]> {
    const rows = await this.db.query<{ status: string; count: number }>(
      'SELECT status, COUNT(*)::int AS count FROM devices GROUP BY status',
    );
    return rows;
  }

  async detailAggregates(deviceId: string): Promise<{
    statusHistory: DeviceStatusHistoryDto[];
    operations: DeviceOperationDto[];
    files: DeviceFileDto[];
    technicianNotes: DeviceNoteDto[];
    images: DeviceImageDto[];
  }> {
    const [statusHistory, operations, files, technicianNotes, images] = await Promise.all([
      this.listHistory(deviceId),
      this.listOperations(deviceId),
      this.listFiles(deviceId),
      this.listNotes(deviceId),
      this.listImages(deviceId),
    ]);
    return { statusHistory, operations, files, technicianNotes, images };
  }

  private async technicianName(
    client: PoolClient | undefined,
    technicianId: string | null,
  ): Promise<string | null> {
    if (!technicianId) return null;
    if (client) {
      const result = await client.query<{ full_name: string }>(
        'SELECT full_name FROM users WHERE id = $1',
        [technicianId],
      );
      return result.rows[0]?.full_name ?? null;
    }
    const row = await this.db.queryOne<{ full_name: string }>(
      'SELECT full_name FROM users WHERE id = $1',
      [technicianId],
    );
    return row?.full_name ?? null;
  }
}
