import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { buildPage, resolvePagination, type PageResult } from '../../common/utils/pagination';
import {
  CUSTOMER_FROM,
  CUSTOMER_SELECT,
  toCustomerDevice,
  toPublicCustomer,
  type CustomerDeviceDto,
  type CustomerDeviceRow,
  type CustomerRow,
  type PublicCustomer,
} from './customers.types';

export interface ListCustomersFilter {
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateCustomerInput {
  fullName: string;
  phone: string | null;
  phoneSecondary: string | null;
  jobTitle: string | null;
  nationalId: string | null;
  address: string | null;
  notes: string | null;
}

export interface UpdateCustomerInput extends Partial<CreateCustomerInput> {}

@Injectable()
export class CustomersRepository {
  constructor(private readonly db: DatabaseService) {}

  async findById(id: string): Promise<CustomerRow | null> {
    return this.db.queryOne<CustomerRow>(
      `SELECT ${CUSTOMER_SELECT} ${CUSTOMER_FROM} WHERE c.id = $1 AND c.deleted_at IS NULL`,
      [id],
    );
  }

  async list(filter: ListCustomersFilter): Promise<PageResult<PublicCustomer>> {
    const request = resolvePagination(filter.page, filter.pageSize);
    const search = filter.search?.trim() || null;
    const where = `
      WHERE c.deleted_at IS NULL
        AND ($1::text IS NULL
             OR c.full_name ILIKE '%' || $1 || '%'
             OR COALESCE(c.phone, '') ILIKE '%' || $1 || '%'
             OR COALESCE(c.phone_secondary, '') ILIKE '%' || $1 || '%'
             OR COALESCE(c.job_title, '') ILIKE '%' || $1 || '%'
             OR COALESCE(c.national_id, '') ILIKE '%' || $1 || '%')
    `;
    const params = [search];
    const countRow = await this.db.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM customers c ${where}`,
      params,
    );
    const rows = await this.db.query<CustomerRow>(
      `SELECT ${CUSTOMER_SELECT} ${CUSTOMER_FROM}
       ${where}
       ORDER BY c.full_name ASC, c.created_at DESC
       LIMIT $2 OFFSET $3`,
      [...params, request.pageSize, request.offset],
    );
    return buildPage(rows.map(toPublicCustomer), Number(countRow?.count ?? 0), request);
  }

  async searchOptions(search: string | undefined, limit = 20): Promise<PublicCustomer[]> {
    const term = search?.trim() || null;
    const rows = await this.db.query<CustomerRow>(
      `SELECT ${CUSTOMER_SELECT} ${CUSTOMER_FROM}
        WHERE c.deleted_at IS NULL
          AND ($1::text IS NULL
               OR c.full_name ILIKE '%' || $1 || '%'
               OR COALESCE(c.phone, '') ILIKE '%' || $1 || '%')
        ORDER BY c.full_name ASC
        LIMIT $2`,
      [term, Math.min(Math.max(limit, 1), 50)],
    );
    return rows.map(toPublicCustomer);
  }

  async insert(input: CreateCustomerInput, createdBy: string): Promise<PublicCustomer> {
    const inserted = await this.db.queryOne<{ id: string }>(
      `INSERT INTO customers
         (full_name, phone, phone_secondary, job_title, national_id, address, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        input.fullName,
        input.phone,
        input.phoneSecondary,
        input.jobTitle,
        input.nationalId,
        input.address,
        input.notes,
        createdBy,
      ],
    );
    const row = inserted ? await this.findById(inserted.id) : null;
    if (!row) throw new Error('ایجاد مشتری ناموفق بود.');
    return toPublicCustomer(row);
  }

  async update(
    id: string,
    version: number,
    changes: UpdateCustomerInput,
  ): Promise<CustomerRow | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (column: string, value: unknown): void => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };

    if (changes.fullName !== undefined) set('full_name', changes.fullName);
    if (changes.phone !== undefined) set('phone', changes.phone);
    if (changes.phoneSecondary !== undefined) set('phone_secondary', changes.phoneSecondary);
    if (changes.jobTitle !== undefined) set('job_title', changes.jobTitle);
    if (changes.nationalId !== undefined) set('national_id', changes.nationalId);
    if (changes.address !== undefined) set('address', changes.address);
    if (changes.notes !== undefined) set('notes', changes.notes);

    if (sets.length === 0) return this.findById(id);

    sets.push('version = version + 1', 'updated_at = now()');
    params.push(id, version);
    const idIndex = params.length - 1;
    const versionIndex = params.length;

    const updated = await this.db.queryOne<{ id: string }>(
      `UPDATE customers
          SET ${sets.join(', ')}
        WHERE id = $${idIndex} AND version = $${versionIndex} AND deleted_at IS NULL
        RETURNING id`,
      params,
    );
    if (!updated) return null;
    return this.findById(id);
  }

  /** سوابق تمام دستگاه‌های یک مشتری برای نمایش در پرونده مشتری */
  async listDevices(customerId: string): Promise<CustomerDeviceDto[]> {
    const rows = await this.db.query<CustomerDeviceRow>(
      `SELECT d.id, d.intake_code, d.status, ds.label_fa AS status_label,
              d.equipment_type, et.label_fa AS equipment_type_label,
              d.model, d.reported_problem, d.received_at, d.delivered_at
         FROM devices d
         LEFT JOIN option_lists ds ON ds.category = 'device_status' AND ds.value_key = d.status
         LEFT JOIN option_lists et ON et.category = 'equipment_type' AND et.value_key = d.equipment_type
        WHERE d.customer_id = $1
        ORDER BY d.received_at DESC, d.created_at DESC`,
      [customerId],
    );
    return rows.map(toCustomerDevice);
  }

  async countDevices(customerId: string): Promise<number> {
    const row = await this.db.queryOne<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM devices WHERE customer_id = $1',
      [customerId],
    );
    return Number(row?.count ?? 0);
  }

  async softDelete(id: string): Promise<void> {
    await this.db.query(
      `UPDATE customers
          SET deleted_at = now(), version = version + 1, updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
  }
}
