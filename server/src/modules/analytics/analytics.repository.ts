import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DEVICE_STATUSES } from '../../common/device-status';
import { jalaliMonthLabel } from '../../common/utils/jalali';
import {
  FAILED_STATUS_KEYS,
  REPORT_TABLE_COLUMNS,
  UNKNOWN_FILTER_VALUE,
  WORK_STATUS_KEYS,
  type AnalyticsFilter,
  type DashboardStats,
  type ReportChartSeries,
  type ReportMetric,
  type ReportTableColumn,
  type ReportTableColumnKey,
  type ReportTableColumnResult,
  type ReportTableResult,
} from './analytics.types';

const BASE_FROM = `FROM devices d
  JOIN customers c ON c.id = d.customer_id
  LEFT JOIN users tech ON tech.id = d.technician_id
  LEFT JOIN option_lists et ON et.category = 'equipment_type' AND et.value_key = d.equipment_type
  LEFT JOIN option_lists mf ON mf.category = 'manufacturer' AND mf.value_key = d.manufacturer
  LEFT JOIN option_lists ds ON ds.category = 'device_status' AND ds.value_key = d.status`;

const STATUS_LABELS = new Map(DEVICE_STATUSES.map((status) => [status.key, status.label]));
const STATUS_ORDER = new Map(DEVICE_STATUSES.map((status, index) => [status.key, index]));
const WORK_STATUS_SQL = WORK_STATUS_KEYS.map((key) => `'${key}'`).join(', ');
const FAILED_STATUS_SQL = FAILED_STATUS_KEYS.map((key) => `'${key}'`).join(', ');
const TEHRAN_DAY_START = `(date_trunc('day', now() AT TIME ZONE 'Asia/Tehran') AT TIME ZONE 'Asia/Tehran')`;

interface FilterSql {
  where: string;
  params: unknown[];
}

interface ChartRow {
  label: string;
  value: number;
}

interface TableSpec {
  sql: string;
  label: string;
  type: ReportTableColumnResult['type'];
}

const TABLE_SPECS: Record<ReportTableColumn, TableSpec> = {
  intakeCode: { sql: 'd.intake_code', label: 'کد پذیرش', type: 'text' },
  ownerName: { sql: 'c.full_name', label: 'مالک', type: 'text' },
  ownerPhone: { sql: 'c.phone', label: 'تلفن مالک', type: 'text' },
  job: {
    sql: `COALESCE(NULLIF(trim(d.brought_by_job), ''), 'نامشخص')`,
    label: 'نوع شغل آورنده',
    type: 'text',
  },
  equipmentType: {
    sql: `COALESCE(et.label_fa, d.equipment_type)`,
    label: 'نوع تجهیز',
    type: 'text',
  },
  manufacturer: {
    sql: `COALESCE(mf.label_fa, NULLIF(trim(d.manufacturer), ''), 'نامشخص')`,
    label: 'سازنده',
    type: 'text',
  },
  model: { sql: `COALESCE(NULLIF(trim(d.model), ''), 'نامشخص')`, label: 'مدل', type: 'text' },
  status: {
    sql: `COALESCE(ds.label_fa, d.status)`,
    label: 'وضعیت',
    type: 'status',
  },
  technician: { sql: `COALESCE(tech.full_name, 'بدون تکنسین')`, label: 'تکنسین', type: 'text' },
  receivedAt: { sql: 'd.received_at', label: 'تاریخ پذیرش', type: 'date' },
  dueAt: { sql: 'd.due_at', label: 'تاریخ تحویل پیش‌بینی‌شده', type: 'date' },
  deliveredAt: { sql: 'd.delivered_at', label: 'تاریخ تحویل', type: 'date' },
  operationCount: {
    sql: `(SELECT COUNT(*)::int FROM device_operations op WHERE op.device_id = d.id AND op.deleted_at IS NULL)`,
    label: 'تعداد اقدامات',
    type: 'number',
  },
  reportedProblem: { sql: 'd.reported_problem', label: 'مشکل اعلام‌شده', type: 'text' },
};

const DATE_COLUMNS = new Set(['receivedAt', 'dueAt', 'deliveredAt']);

@Injectable()
export class AnalyticsRepository {
  constructor(private readonly db: DatabaseService) {}

  private buildFilter(filter: AnalyticsFilter): FilterSql {
    const params: unknown[] = [];
    const clauses: string[] = [];
    const param = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    if (filter.from) clauses.push(`d.received_at >= ${param(filter.from)}`);
    if (filter.to) clauses.push(`d.received_at < ${param(filter.to)}`);
    if (filter.year) clauses.push(`ir_jalali_year(d.received_at) = ${param(filter.year)}`);
    if (filter.month) clauses.push(`ir_jalali_month(d.received_at) = ${param(filter.month)}`);

    if (filter.equipmentType) {
      clauses.push(`d.equipment_type = ${param(filter.equipmentType)}`);
    }
    if (filter.manufacturer) {
      if (filter.manufacturer === UNKNOWN_FILTER_VALUE) {
        clauses.push(`NULLIF(trim(d.manufacturer), '') IS NULL`);
      } else {
        clauses.push(`d.manufacturer = ${param(filter.manufacturer)}`);
      }
    }
    if (filter.model) {
      if (filter.model === UNKNOWN_FILTER_VALUE) {
        clauses.push(`NULLIF(trim(d.model), '') IS NULL`);
      } else {
        clauses.push(`trim(d.model) = ${param(filter.model)}`);
      }
    }
    if (filter.job) {
      if (filter.job === UNKNOWN_FILTER_VALUE) {
        clauses.push(`NULLIF(trim(d.brought_by_job), '') IS NULL`);
      } else {
        clauses.push(`trim(d.brought_by_job) = ${param(filter.job)}`);
      }
    }
    if (filter.technicianId) {
      if (filter.technicianId === UNKNOWN_FILTER_VALUE) {
        clauses.push(`d.technician_id IS NULL`);
      } else {
        clauses.push(`d.technician_id::text = ${param(filter.technicianId)}`);
      }
    }
    if (filter.status) clauses.push(`d.status = ${param(filter.status)}`);
    if (filter.operationType) {
      clauses.push(
        `EXISTS (SELECT 1 FROM device_operations op
                  WHERE op.device_id = d.id AND op.deleted_at IS NULL
                    AND op.operation_type = ${param(filter.operationType)})`,
      );
    }

    return { where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '', params };
  }

  async stats(filter: AnalyticsFilter): Promise<DashboardStats> {
    const { where, params } = this.buildFilter(filter);
    const row = await this.db.queryOne<{
      total: number;
      today: number;
      in_progress: number;
      done: number;
      failed: number;
      ready: number;
      delivered: number;
      customers: number;
    }>(
      `WITH filtered AS (
         SELECT d.customer_id, d.status, d.received_at
         ${BASE_FROM}
         ${where}
       )
       SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE received_at >= ${TEHRAN_DAY_START})::int AS today,
         COUNT(*) FILTER (WHERE status IN (${WORK_STATUS_SQL}))::int AS in_progress,
         COUNT(*) FILTER (WHERE status = 'done')::int AS done,
         COUNT(*) FILTER (WHERE status IN (${FAILED_STATUS_SQL}))::int AS failed,
         COUNT(*) FILTER (WHERE status = 'ready_delivery')::int AS ready,
         COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
         COUNT(DISTINCT customer_id)::int AS customers
       FROM filtered`,
      params,
    );
    return {
      totalEquipment: row?.total ?? 0,
      receivedToday: row?.today ?? 0,
      inProgress: row?.in_progress ?? 0,
      done: row?.done ?? 0,
      failed: row?.failed ?? 0,
      ready: row?.ready ?? 0,
      delivered: row?.delivered ?? 0,
      customers: row?.customers ?? 0,
    };
  }

  async aggregateSingle(
    filter: AnalyticsFilter,
    dimension: string,
    metric: ReportMetric,
    limit?: number,
  ): Promise<ChartRow[]> {
    if (dimension === 'operationType') {
      return this.aggregateOperationType(filter, metric, limit);
    }

    const deliveredByDate = metric === 'delivered' && (dimension === 'month' || dimension === 'year');
    const dateColumn = deliveredByDate ? 'd.delivered_at' : 'd.received_at';
    const dimensionExpr = this.dimensionExpression(dimension, dateColumn);
    const metricExpr = this.metricExpression(metric, deliveredByDate);
    const { where, params } = this.buildFilter(filter);

    let whereClause = where;
    if (deliveredByDate) {
      whereClause = where
        ? `${where} AND d.delivered_at IS NOT NULL`
        : 'WHERE d.delivered_at IS NOT NULL';
    }

    const order =
      dimension === 'month' || dimension === 'year'
        ? 'ORDER BY 1 ASC'
        : 'ORDER BY 2 DESC, 1 ASC';
    const limitClause = limit ? `LIMIT ${Math.min(Math.max(limit, 1), 100)}` : '';

    const rows = await this.db.query<ChartRow>(
      `SELECT ${dimensionExpr} AS label, ${metricExpr} AS value
       ${BASE_FROM}
       ${whereClause}
       GROUP BY 1
       ${order}
       ${limitClause}`,
      params,
    );
    return rows.map((row) => ({ label: String(row.label ?? ''), value: Number(row.value ?? 0) }));
  }

  async aggregateStacked(
    filter: AnalyticsFilter,
    dimension: string,
    limit = 12,
  ): Promise<{
    categories: string[];
    series: ReportChartSeries[];
    total: number;
  }> {
    const { where, params } = this.buildFilter(filter);
    const dateColumn = 'd.received_at';
    const dimensionExpr = this.dimensionExpression(dimension, dateColumn);
    const rows =
      dimension === 'operationType'
        ? await this.db.query<{ label: string; status: string; value: number }>(
            `SELECT COALESCE(ol.label_fa, op.operation_type) AS label, d.status AS status,
                    COUNT(*)::int AS value
               FROM devices d
               JOIN customers c ON c.id = d.customer_id
               LEFT JOIN users tech ON tech.id = d.technician_id
               LEFT JOIN option_lists et ON et.category = 'equipment_type' AND et.value_key = d.equipment_type
               LEFT JOIN option_lists mf ON mf.category = 'manufacturer' AND mf.value_key = d.manufacturer
               JOIN device_operations op ON op.device_id = d.id AND op.deleted_at IS NULL
               LEFT JOIN option_lists ol ON ol.category = 'operation_type' AND ol.value_key = op.operation_type
               ${where}
              GROUP BY 1, 2
              ORDER BY 1 ASC`,
            params,
          )
        : await this.db.query<{ label: string; status: string; value: number }>(
            `SELECT ${dimensionExpr} AS label, d.status AS status, COUNT(*)::int AS value
               ${BASE_FROM}
               ${where}
              GROUP BY 1, 2
              ORDER BY 1 ASC`,
            params,
          );

    const totals = new Map<string, number>();
    for (const row of rows) {
      const label = String(row.label ?? 'نامشخص');
      totals.set(label, (totals.get(label) ?? 0) + Number(row.value ?? 0));
    }

    let categories = [...totals.keys()];
    const timeDimension = dimension === 'month' || dimension === 'year';
    if (timeDimension) {
      categories.sort((a, b) => a.localeCompare(b));
    } else {
      categories.sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0));
      if (categories.length > limit) {
        const visible = categories.slice(0, limit);
        const rest = categories.slice(limit);
        const restSet = new Set(rest);
        const merged = new Map<string, number>();
        for (const row of rows) {
          const label = String(row.label ?? 'نامشخص');
          if (!restSet.has(label)) continue;
          merged.set(row.status, (merged.get(row.status) ?? 0) + Number(row.value ?? 0));
        }
        const result = this.buildStackedSeries(
          visible.concat('سایر'),
          rows.filter((row) => !restSet.has(String(row.label ?? ''))).concat(
            [...merged.entries()].map(([status, value]) => ({
              label: 'سایر',
              status,
              value,
            })),
          ),
          dimension,
        );
        result.categories = visible.concat('سایر');
        result.total = [...totals.values()].reduce((sum, value) => sum + value, 0);
        return result;
      }
    }

    const result = this.buildStackedSeries(categories, rows, dimension);
    result.total = [...totals.values()].reduce((sum, value) => sum + value, 0);
    return result;
  }

  async aggregateCombo(
    filter: AnalyticsFilter,
    dimension: string,
  ): Promise<{ categories: string[]; series: ReportChartSeries[]; total: number }> {
    const [countRows, deliveredRows] = await Promise.all([
      this.aggregateSingle(filter, dimension, 'count'),
      this.aggregateSingle(filter, dimension, 'delivered'),
    ]);
    const timeDimension = dimension === 'month' || dimension === 'year';
    const labels = [...new Set([...countRows, ...deliveredRows].map((row) => row.label))];

    let categories: string[];
    if (timeDimension) {
      categories = labels.sort((a, b) => a.localeCompare(b));
    } else {
      const totals = new Map<string, number>();
      for (const row of countRows) totals.set(row.label, row.value);
      categories = labels
        .sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0))
        .slice(0, 14);
    }

    const countMap = new Map(countRows.map((row) => [row.label, row.value]));
    const deliveredMap = new Map(deliveredRows.map((row) => [row.label, row.value]));
    return {
      categories,
      series: [
        { name: 'تعداد تجهیزات', data: categories.map((label) => countMap.get(label) ?? 0) },
        { name: 'تحویل‌شده', data: categories.map((label) => deliveredMap.get(label) ?? 0) },
      ],
      total: countRows.reduce((sum, row) => sum + row.value, 0),
    };
  }

  async queryTable(
    filter: AnalyticsFilter,
    columns: ReportTableColumn[],
    limit = 500,
  ): Promise<ReportTableResult> {
    const builtin = columns.filter((column): column is ReportTableColumnKey =>
      (REPORT_TABLE_COLUMNS as readonly string[]).includes(column),
    );
    const customKeys = columns
      .filter((column) => column.startsWith('custom:'))
      .map((column) => column.slice('custom:'.length))
      .filter((key) => /^[a-z0-9_]{1,60}$/.test(key));

    const specs = new Map<string, TableSpec>();
    for (const column of builtin) specs.set(column, TABLE_SPECS[column]);
    if (customKeys.length > 0) {
      const definitions = await this.db.query<{
        field_key: string;
        label_fa: string;
        field_type: string;
      }>(
        `SELECT field_key, label_fa, field_type
           FROM field_definitions
          WHERE entity = 'device' AND is_reportable AND field_key = ANY($1::text[])`,
        [customKeys],
      );
      for (const definition of definitions) {
        specs.set(`custom:${definition.field_key}`, {
          sql: `d.custom_fields->>'${definition.field_key}'`,
          label: definition.label_fa,
          type: ['number', 'amount'].includes(definition.field_type)
            ? 'number'
            : ['date', 'datetime'].includes(definition.field_type)
              ? 'date'
              : 'text',
        });
      }
    }

    const selected = [...specs.keys()];
    if (selected.length === 0) {
      return { columns: [], rows: [], total: 0 };
    }
    const { where, params } = this.buildFilter(filter);
    const select = selected
      .map((column) => `${specs.get(column)!.sql} AS "${column}"`)
      .join(', ');
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT ${select}
       ${BASE_FROM}
       ${where}
       ORDER BY d.received_at DESC, d.created_at DESC
       LIMIT ${Math.min(Math.max(limit, 1), 2000)}`,
      params,
    );

    const mapped = rows.map((row) => {
      const output: Record<string, string | number | null> = {};
      for (const column of selected) {
        const spec = specs.get(column)!;
        const value = row[column];
        if (value === null || value === undefined) {
          output[column] = null;
        } else if (spec.type === 'date') {
          output[column] = value instanceof Date ? value.toISOString() : String(value);
        } else if (spec.type === 'number') {
          output[column] = Number(value);
        } else if (typeof value === 'boolean') {
          output[column] = value ? 'بله' : 'خیر';
        } else if (Array.isArray(value)) {
          output[column] = value.map(String).join('، ');
        } else if (typeof value === 'object') {
          output[column] = JSON.stringify(value);
        } else {
          output[column] = String(value);
        }
      }
      return output;
    });

    return {
      columns: selected.map((column) => ({
        key: column,
        label: specs.get(column)!.label,
        type: specs.get(column)!.type,
      })),
      rows: mapped,
      total: mapped.length,
    };
  }

  /** فیلدهای سفارشی فرم دستگاه که مدیر برای گزارش‌گیری قابل انتخاب کرده است */
  async reportableCustomColumns(): Promise<{ key: string; label: string }[]> {
    const rows = await this.db.query<{ field_key: string; label_fa: string }>(
      `SELECT field_key, label_fa FROM field_definitions
        WHERE entity = 'device' AND is_reportable AND is_enabled
        ORDER BY sort_order ASC, created_at ASC`,
    );
    return rows.map((row) => ({ key: `custom:${row.field_key}`, label: row.label_fa }));
  }

  async equipmentTypeOptions(): Promise<{ value: string; label: string; count: number }[]> {
    return this.db.query(
      `SELECT ol.value_key AS value, ol.label_fa AS label, COUNT(d.id)::int AS count
         FROM option_lists ol
         LEFT JOIN devices d ON d.equipment_type = ol.value_key
        WHERE ol.category = 'equipment_type' AND ol.is_active
        GROUP BY ol.value_key, ol.label_fa, ol.sort_order
        ORDER BY ol.sort_order ASC, ol.label_fa ASC`,
    );
  }

  async manufacturerOptions(): Promise<{ value: string; label: string; count: number }[]> {
    const mapped = await this.db.query<{ value: string; label: string; count: number }>(
      `SELECT ol.value_key AS value, ol.label_fa AS label, COUNT(d.id)::int AS count
         FROM option_lists ol
         LEFT JOIN devices d ON d.manufacturer = ol.value_key
        WHERE ol.category = 'manufacturer' AND ol.is_active
        GROUP BY ol.value_key, ol.label_fa, ol.sort_order
        ORDER BY ol.sort_order ASC, ol.label_fa ASC`,
    );
    const unknown = await this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM devices WHERE NULLIF(trim(manufacturer), '') IS NULL`,
    );
    if ((unknown?.count ?? 0) > 0) {
      mapped.push({ value: UNKNOWN_FILTER_VALUE, label: 'نامشخص', count: unknown?.count ?? 0 });
    }
    return mapped;
  }

  async operationTypeOptions(): Promise<{ value: string; label: string; count: number }[]> {
    return this.db.query(
      `SELECT ol.value_key AS value, ol.label_fa AS label,
              (SELECT COUNT(DISTINCT op.device_id)::int FROM device_operations op
                WHERE op.deleted_at IS NULL AND op.operation_type = ol.value_key) AS count
         FROM option_lists ol
        WHERE ol.category = 'operation_type' AND ol.is_active
        ORDER BY ol.sort_order ASC, ol.label_fa ASC`,
    );
  }

  /** وضعیت‌های فعال دستگاه به ترتیب تعریف‌شده توسط مدیر */
  async statusOptions(): Promise<{ value: string; label: string; count: number }[]> {
    return this.db.query(
      `SELECT ol.value_key AS value, ol.label_fa AS label, COUNT(d.id)::int AS count
         FROM option_lists ol
         LEFT JOIN devices d ON d.status = ol.value_key
        WHERE ol.category = 'device_status' AND ol.is_active
        GROUP BY ol.value_key, ol.label_fa, ol.sort_order
        ORDER BY ol.sort_order ASC, ol.label_fa ASC`,
    );
  }

  async modelOptions(): Promise<string[]> {
    const rows = await this.db.query<{ model: string }>(
      `SELECT DISTINCT trim(model) AS model FROM devices
        WHERE NULLIF(trim(model), '') IS NOT NULL
        ORDER BY model ASC
        LIMIT 300`,
    );
    return rows.map((row) => row.model);
  }

  async jobOptions(): Promise<string[]> {
    const rows = await this.db.query<{ job: string }>(
      `SELECT COALESCE(NULLIF(trim(brought_by_job), ''), '${UNKNOWN_FILTER_VALUE}') AS job,
              COUNT(*)::int AS count
         FROM devices
        GROUP BY 1
        ORDER BY count DESC, job ASC
        LIMIT 100`,
    );
    return rows.map((row) => row.job);
  }

  async technicianOptions(): Promise<{ value: string; label: string }[]> {
    const rows = await this.db.query<{ id: string; full_name: string }>(
      `SELECT id, full_name FROM users
        WHERE deleted_at IS NULL AND is_active = true
        ORDER BY full_name ASC`,
    );
    return [
      { value: UNKNOWN_FILTER_VALUE, label: 'بدون تکنسین' },
      ...rows.map((row) => ({ value: row.id, label: row.full_name })),
    ];
  }

  async yearOptions(): Promise<number[]> {
    const rows = await this.db.query<{ year: number }>(
      `SELECT DISTINCT ir_jalali_year(received_at) AS year FROM devices ORDER BY year DESC`,
    );
    return rows.map((row) => Number(row.year));
  }

  private dimensionExpression(dimension: string, dateColumn: string): string {
    switch (dimension) {
      case 'equipmentType':
        return `COALESCE(et.label_fa, d.equipment_type)`;
      case 'manufacturer':
        return `COALESCE(mf.label_fa, NULLIF(trim(d.manufacturer), ''), 'نامشخص')`;
      case 'model':
        return `COALESCE(NULLIF(trim(d.model), ''), 'نامشخص')`;
      case 'status':
        return `COALESCE(ds.label_fa, d.status)`;
      case 'job':
        return `COALESCE(NULLIF(trim(d.brought_by_job), ''), 'نامشخص')`;
      case 'technician':
        return `COALESCE(tech.full_name, 'بدون تکنسین')`;
      case 'month':
        return `ir_jalali_ym(${dateColumn})`;
      case 'year':
        return `ir_jalali_year(${dateColumn})::text`;
      case 'customer':
        return 'c.full_name';
      default:
        return 'd.equipment_type';
    }
  }

  private metricExpression(metric: ReportMetric, deliveredByDate: boolean): string {
    switch (metric) {
      case 'delivered':
        return deliveredByDate
          ? 'COUNT(*)'
          : `COUNT(*) FILTER (WHERE d.status = 'delivered')`;
      case 'failed':
        return `COUNT(*) FILTER (WHERE d.status IN (${FAILED_STATUS_SQL}))`;
      case 'active':
        return `COUNT(*) FILTER (WHERE d.status IN (${WORK_STATUS_SQL}))`;
      case 'customers':
        return 'COUNT(DISTINCT d.customer_id)';
      case 'operations':
        return `COALESCE(SUM((SELECT COUNT(*) FROM device_operations op
                              WHERE op.device_id = d.id AND op.deleted_at IS NULL)), 0)::int`;
      default:
        return 'COUNT(*)';
    }
  }

  private async aggregateOperationType(
    filter: AnalyticsFilter,
    metric: ReportMetric,
    limit?: number,
  ): Promise<ChartRow[]> {
    const { where, params } = this.buildFilter(filter);
    const metricExpr =
      metric === 'operations'
        ? 'COUNT(*)'
        : metric === 'customers'
          ? 'COUNT(DISTINCT d.customer_id)'
          : metric === 'delivered'
            ? `COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'delivered')`
            : metric === 'failed'
              ? `COUNT(DISTINCT d.id) FILTER (WHERE d.status IN (${FAILED_STATUS_SQL}))`
              : metric === 'active'
                ? `COUNT(DISTINCT d.id) FILTER (WHERE d.status IN (${WORK_STATUS_SQL}))`
                : 'COUNT(DISTINCT d.id)';
    const limitClause = limit ? `LIMIT ${Math.min(Math.max(limit, 1), 100)}` : '';
    const rows = await this.db.query<ChartRow>(
      `SELECT COALESCE(ol.label_fa, op.operation_type) AS label, ${metricExpr} AS value
         FROM devices d
         JOIN customers c ON c.id = d.customer_id
         LEFT JOIN users tech ON tech.id = d.technician_id
         LEFT JOIN option_lists et ON et.category = 'equipment_type' AND et.value_key = d.equipment_type
         LEFT JOIN option_lists mf ON mf.category = 'manufacturer' AND mf.value_key = d.manufacturer
         JOIN device_operations op ON op.device_id = d.id AND op.deleted_at IS NULL
         LEFT JOIN option_lists ol ON ol.category = 'operation_type' AND ol.value_key = op.operation_type
         ${where}
        GROUP BY 1
        ORDER BY 2 DESC, 1 ASC
        ${limitClause}`,
      params,
    );
    return rows.map((row) => ({ label: String(row.label ?? ''), value: Number(row.value ?? 0) }));
  }

  private buildStackedSeries(
    categories: string[],
    rows: { label: string; status: string; value: number }[],
    dimension: string,
  ): { categories: string[]; series: ReportChartSeries[]; total: number } {
    const statuses = [...new Set(rows.map((row) => row.status))].sort(
      (a, b) => (STATUS_ORDER.get(a) ?? 99) - (STATUS_ORDER.get(b) ?? 99),
    );
    const values = new Map<string, Map<string, number>>();
    for (const row of rows) {
      const category = String(row.label ?? 'نامشخص');
      if (!values.has(category)) values.set(category, new Map());
      values.get(category)!.set(row.status, Number(row.value ?? 0));
    }
    // در نمودارهایی که خود وضعیت محور است، برچسب پایگاه داده اولویت دارد.
    const labelByStatus = new Map<string, string>();
    if (dimension === 'status') {
      for (const row of rows) labelByStatus.set(row.status, String(row.label ?? row.status));
    }
    return {
      categories,
      series: statuses.map((status) => ({
        name: labelByStatus.get(status) ?? STATUS_LABELS.get(status) ?? status,
        data: categories.map((category) => values.get(category)?.get(status) ?? 0),
      })),
      total: rows.reduce((sum, row) => sum + Number(row.value ?? 0), 0),
    };
  }

  mapCategoryLabel(dimension: string, label: string): string {
    if (dimension === 'month') return jalaliMonthLabel(label);
    if (dimension === 'year') return label;
    return label;
  }
}
