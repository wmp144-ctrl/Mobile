import { HttpStatus, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { DatabaseService } from '../../database/database.service';
import { DEVICE_STATUSES } from '../../common/device-status';
import { AppException, ErrorCodes } from '../../common/errors/app.exception';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import {
  formatJalaliDateLatin,
  formatJalaliDateTimeLatin,
  jalaliMonthBuckets,
  jalaliMonthLabel,
  jalaliParts,
  toPersianDigits,
} from '../../common/utils/jalali';
import { timestampForFileName } from '../../common/utils/dates';
import { AuditService, type AuditActor } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { SettingsService } from '../settings/settings.service';
import type { AuthUser } from '../users/user.types';
import { AnalyticsRepository } from './analytics.repository';
import {
  CHART_TYPE_LABELS,
  DIMENSION_LABELS,
  METRIC_LABELS,
  REPORT_CHART_TYPES,
  REPORT_DIMENSIONS,
  REPORT_METRICS,
  REPORT_TABLE_COLUMN_PATTERN,
  UNKNOWN_FILTER_VALUE,
  type AnalyticsFilter,
  type AnalyticsOptions,
  type DashboardResponse,
  type ReportChartConfig,
  type ReportChartResult,
  type ReportChartType,
  type ReportConfig,
  type ReportDimension,
  type ReportMetric,
  type ReportRunResult,
  type ReportTableColumn,
  type SavedReportDto,
} from './analytics.types';
import type {
  CreateSavedReportDto,
  RunReportDto,
  UpdateSavedReportDto,
} from './analytics.dto';

const DEFAULT_TABLE_COLUMNS: ReportTableColumn[] = [
  'intakeCode',
  'ownerName',
  'equipmentType',
  'status',
  'receivedAt',
];

interface SavedReportRow {
  id: string;
  name: string;
  description: string | null;
  config: unknown;
  is_shared: boolean;
  version: number;
  owner_name: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly repo: AnalyticsRepository,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  async dashboard(
    filter: AnalyticsFilter,
    user: AuthUser,
  ): Promise<DashboardResponse> {
    this.assertFilter(filter);
    const [
      stats,
      equipmentRows,
      manufacturerRows,
      jobRows,
      statusRows,
      yearlyRows,
      recentDevices,
      workshop,
      monthly,
    ] = await Promise.all([
      this.repo.stats(filter),
      this.repo.aggregateSingle(filter, 'equipmentType', 'count', 13),
      this.repo.aggregateSingle(filter, 'manufacturer', 'count', 13),
      this.repo.aggregateSingle(filter, 'job', 'count', 12),
      this.repo.aggregateSingle(filter, 'status', 'count'),
      this.repo.aggregateSingle(filter, 'year', 'count'),
      this.repo.queryTable(
        filter,
        ['intakeCode', 'ownerName', 'equipmentType', 'model', 'status', 'receivedAt', 'technician'],
        5,
      ),
      this.settings.getAll(),
      this.monthlyTrend(filter),
    ]);

    return {
      stats,
      charts: {
        equipmentTypes: this.buildChart(
          'equipmentTypes',
          'توزیع نوع تجهیزات',
          'doughnut',
          'equipmentType',
          'count',
          equipmentRows,
        ),
        manufacturers: this.buildChart(
          'manufacturers',
          'توزیع سازندگان',
          'bar',
          'manufacturer',
          'count',
          manufacturerRows,
        ),
        monthlyTrend: monthly,
        yearly: this.buildChart(
          'yearly',
          'مقایسه سالانه تجهیزات',
          'bar',
          'year',
          'count',
          yearlyRows,
        ),
        jobs: this.buildChart(
          'jobs',
          'نوع شغل آورنده',
          'bar',
          'job',
          'count',
          jobRows,
          true,
        ),
        statuses: this.statusChart(filter, statusRows),
      },
      recentDevices,
      generatedAt: new Date().toISOString(),
      workshop: workshop.workshop,
      currentUser: { fullName: user.fullName, roleNameFa: user.roleNameFa },
    };
  }

  async options(): Promise<AnalyticsOptions> {
    const [
      equipmentTypes,
      manufacturers,
      operationTypes,
      models,
      jobs,
      technicians,
      years,
      customColumns,
      workshop,
    ] = await Promise.all([
      this.repo.equipmentTypeOptions(),
      this.repo.manufacturerOptions(),
      this.repo.operationTypeOptions(),
      this.repo.modelOptions(),
      this.repo.jobOptions(),
      this.repo.technicianOptions(),
      this.repo.yearOptions(),
      this.repo.reportableCustomColumns(),
      this.settings.getAll(),
    ]);
    const now = jalaliParts(new Date());
    const currentYear = now?.jy ?? new Date().getFullYear() - 621;
    const currentMonth = now?.jm ?? 1;
    const allYears = [...new Set([currentYear, ...years])].sort((a, b) => b - a);
    return {
      equipmentTypes,
      manufacturers,
      models,
      jobs,
      technicians,
      operationTypes,
      statuses: DEVICE_STATUSES.map((status) => ({
        value: status.key,
        label: status.label,
        tone: status.tone,
      })),
      years: allYears.map((year) => ({ value: year, label: toPersianDigits(year) })),
      currentYear,
      currentMonth,
      customColumns,
      workshop: workshop.workshop,
    };
  }

  async run(dto: RunReportDto): Promise<ReportRunResult> {
    const config = this.configFromDto(dto);
    return this.runConfig(config);
  }

  async runConfig(config: ReportConfig): Promise<ReportRunResult> {
    this.assertFilter(config);
    const [chartResults, table, workshop] = await Promise.all([
      Promise.all(config.charts.map((chart) => this.runChart(chart, config))),
      this.repo.queryTable(
        config,
        config.tableColumns ?? [],
        config.tableLimit ?? 500,
      ),
      this.settings.getAll(),
    ]);

    return {
      charts: chartResults,
      table,
      generatedAt: new Date().toISOString(),
      filters: this.cleanFilters(config),
      workshop: workshop.workshop,
    };
  }

  async listSaved(user: AuthUser): Promise<SavedReportDto[]> {
    const rows = await this.db.query<SavedReportRow>(
      `SELECT r.id, r.name, r.description, r.config, r.is_shared, r.version,
              r.created_by, u.full_name AS owner_name, r.created_at, r.updated_at
         FROM saved_reports r
         LEFT JOIN users u ON u.id = r.created_by
        WHERE r.deleted_at IS NULL
          AND (r.is_shared = true OR r.created_by = $1)
        ORDER BY r.updated_at DESC`,
      [user.id],
    );
    return rows.map((row) => this.toSavedReport(row, user));
  }

  async getSaved(id: string, user: AuthUser): Promise<SavedReportDto> {
    const row = await this.findSavedRow(id);
    if (!row || (!row.is_shared && row.created_by !== user.id)) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'قالب گزارش پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    return this.toSavedReport(row, user);
  }

  async createSaved(dto: CreateSavedReportDto, user: AuthUser): Promise<SavedReportDto> {
    const config = this.configFromDto(dto.config);
    const inserted = await this.db.queryOne<{ id: string }>(
      `INSERT INTO saved_reports (name, description, config, is_shared, created_by, updated_by)
       VALUES ($1, $2, $3::jsonb, $4, $5, $5)
       RETURNING id`,
      [
        dto.name.trim(),
        dto.description?.trim() || null,
        JSON.stringify(config),
        dto.isShared ?? true,
        user.id,
      ],
    );
    if (!inserted) {
      throw new AppException(
        ErrorCodes.INTERNAL,
        'ذخیره قالب گزارش ناموفق بود.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    await this.audit.log({
      actor: this.actor(user),
      action: AUDIT_ACTIONS.REPORT_SAVED_CREATED,
      entityType: 'saved_report',
      entityId: inserted.id,
      description: `قالب گزارش «${dto.name.trim()}» ذخیره شد.`,
      metadata: { charts: config.charts.length, shared: dto.isShared ?? true },
    });
    return this.getSaved(inserted.id, user);
  }

  async updateSaved(
    id: string,
    dto: UpdateSavedReportDto,
    user: AuthUser,
  ): Promise<SavedReportDto> {
    const row = await this.findSavedRow(id);
    if (!row) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'قالب گزارش پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    this.assertCanManage(row, user);
    const config = dto.config ? this.configFromDto(dto.config) : null;
    const updated = await this.db.queryOne<{ id: string }>(
      `UPDATE saved_reports
          SET name = COALESCE($2, name),
              description = CASE WHEN $3::boolean THEN $4 ELSE description END,
              config = COALESCE($5::jsonb, config),
              is_shared = COALESCE($6, is_shared),
              version = version + 1,
              updated_by = $7,
              updated_at = now()
        WHERE id = $1 AND version = $8 AND deleted_at IS NULL
        RETURNING id`,
      [
        id,
        dto.name?.trim() || null,
        dto.description !== undefined,
        dto.description?.trim() || null,
        config ? JSON.stringify(config) : null,
        dto.isShared ?? null,
        user.id,
        dto.version,
      ],
    );
    if (!updated) {
      throw new AppException(
        ErrorCodes.CONFLICT,
        'این قالب گزارش توسط کاربر دیگری تغییر کرده است. صفحه را تازه کنید.',
        HttpStatus.CONFLICT,
      );
    }
    await this.audit.log({
      actor: this.actor(user),
      action: AUDIT_ACTIONS.REPORT_SAVED_UPDATED,
      entityType: 'saved_report',
      entityId: id,
      description: 'قالب گزارش ویرایش شد.',
    });
    return this.getSaved(id, user);
  }

  async deleteSaved(id: string, user: AuthUser): Promise<void> {
    const row = await this.findSavedRow(id);
    if (!row) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'قالب گزارش پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    this.assertCanManage(row, user);
    await this.db.query(
      `UPDATE saved_reports
          SET deleted_at = now(), version = version + 1, updated_by = $2, updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL`,
      [id, user.id],
    );
    await this.audit.log({
      actor: this.actor(user),
      action: AUDIT_ACTIONS.REPORT_SAVED_DELETED,
      entityType: 'saved_report',
      entityId: id,
      description: `قالب گزارش «${row.name}» حذف شد.`,
    });
  }

  async runSaved(id: string, user: AuthUser): Promise<ReportRunResult> {
    const row = await this.findSavedRow(id);
    if (!row || (!row.is_shared && row.created_by !== user.id)) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'قالب گزارش پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    const config = this.sanitizeStoredConfig(row.config);
    return this.runConfig(config);
  }

  async exportExcel(
    dto: RunReportDto,
    actor: AuditActor,
    reportName = 'گزارش تحلیلی تعمیرگاه',
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const config = this.configFromDto(dto);
    const [report, options] = await Promise.all([this.runConfig(config), this.options()]);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'سامانه مدیریت تعمیرگاه';
    workbook.created = new Date();

    const summary = workbook.addWorksheet('خلاصه گزارش', {
      views: [{ rightToLeft: true }],
      properties: { defaultColWidth: 26 },
    });
    summary.addRow([reportName]);
    summary.addRow(['تعمیرگاه', report.workshop.name || '—']);
    summary.addRow(['تاریخ تولید', formatJalaliDateTimeLatin(report.generatedAt)]);
    summary.addRow(['بازه و فیلترها']);
    for (const item of await this.filterDescriptions(config, options)) {
      summary.addRow([item.label, item.value]);
    }
    summary.addRow([]);
    summary.addRow(['نمودارهای گزارش']);
    for (const chart of report.charts) {
      summary.addRow([chart.title, `${CHART_TYPE_LABELS[chart.chartType]} — ${chart.total}`]);
    }
    summary.getRow(1).font = { bold: true, size: 15, color: { argb: 'FF1F2C6D' } };
    summary.getColumn(1).font = { bold: true };

    const usedSheetNames = new Set<string>();
    for (const [chartIndex, chart] of report.charts.entries()) {
      const baseName = chart.title.replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 26) || `نمودار ${chartIndex + 1}`;
      let sheetName = baseName;
      let suffix = 2;
      while (usedSheetNames.has(sheetName)) {
        sheetName = `${baseName.slice(0, 24)} ${suffix}`;
        suffix += 1;
      }
      usedSheetNames.add(sheetName);
      const sheet = workbook.addWorksheet(sheetName, {
        views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
      });
      sheet.columns = [
        { header: DIMENSION_LABELS[chart.dimension], key: 'category', width: 26 },
        ...chart.series.map((series) => ({
          header: series.name,
          key: series.name,
          width: 20,
        })),
      ];
      chart.categories.forEach((category, index) => {
        const row: Record<string, string | number> = { category };
        chart.series.forEach((series) => {
          row[series.name] = series.data[index] ?? 0;
        });
        sheet.addRow(row);
      });
      this.styleHeader(sheet);
    }

    const columns = config.tableColumns?.length ? config.tableColumns : DEFAULT_TABLE_COLUMNS;
    const table = await this.repo.queryTable(config, columns, config.tableLimit ?? 2000);
    const dataSheet = workbook.addWorksheet('داده‌ها', {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
    });
    dataSheet.columns = table.columns.map((column) => ({
      header: column.label,
      key: column.key,
      width: column.key === 'reportedProblem' ? 40 : 20,
    }));
    for (const row of table.rows) {
      const output: Record<string, string | number> = {};
      for (const column of table.columns) {
        const value = row[column.key];
        output[column.key] =
          column.type === 'date' && typeof value === 'string'
            ? formatJalaliDateLatin(value)
            : ((value ?? '') as string | number);
      }
      dataSheet.addRow(output);
    }
    this.styleHeader(dataSheet);
    if (table.columns.length > 0) {
      dataSheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: table.columns.length },
      };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.REPORT_EXPORTED,
      entityType: 'report',
      description: 'خروجی اکسل گزارش تحلیلی تهیه شد.',
      metadata: { format: 'excel', charts: report.charts.length, rows: table.rows.length },
    });
    return {
      buffer: Buffer.from(buffer),
      fileName: `report-${timestampForFileName()}.xlsx`,
    };
  }

  async exportCsv(
    dto: RunReportDto,
    actor: AuditActor,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const config = this.configFromDto(dto);
    const columns = config.tableColumns?.length ? config.tableColumns : DEFAULT_TABLE_COLUMNS;
    const table = await this.repo.queryTable(config, columns, config.tableLimit ?? 2000);
    const lines: string[] = [];
    lines.push(table.columns.map((column) => this.csvCell(column.label)).join(','));
    for (const row of table.rows) {
      lines.push(
        table.columns
          .map((column) => {
            const value = row[column.key];
            if (column.type === 'date' && typeof value === 'string') {
              return this.csvCell(formatJalaliDateLatin(value));
            }
            return this.csvCell(value === null || value === undefined ? '' : String(value));
          })
          .join(','),
      );
    }
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.REPORT_EXPORTED,
      entityType: 'report',
      description: 'خروجی CSV گزارش تحلیلی تهیه شد.',
      metadata: { format: 'csv', rows: table.rows.length },
    });
    return {
      // BOM برای نمایش صحیح فارسی در Excel ویندوز
      buffer: Buffer.from(`\uFEFF${lines.join('\r\n')}`, 'utf8'),
      fileName: `report-${timestampForFileName()}.csv`,
    };
  }

  async filterDescriptions(
    filter: AnalyticsFilter,
    options?: AnalyticsOptions,
  ): Promise<{ label: string; value: string }[]> {
    const resolved = options ?? (await this.options());
    const items: { label: string; value: string }[] = [];

    if (filter.from && filter.to) {
      const end = new Date(new Date(filter.to).getTime() - 1);
      items.push({
        label: 'بازه تاریخ',
        value: `از ${formatJalaliDateLatin(filter.from)} تا ${formatJalaliDateLatin(end)}`,
      });
    } else if (filter.from) {
      items.push({ label: 'بازه تاریخ', value: `از ${formatJalaliDateLatin(filter.from)}` });
    } else if (filter.to) {
      const end = new Date(new Date(filter.to).getTime() - 1);
      items.push({ label: 'بازه تاریخ', value: `تا ${formatJalaliDateLatin(end)}` });
    }
    if (filter.year) {
      items.push({ label: 'سال شمسی', value: toPersianDigits(filter.year) });
    }
    if (filter.month) {
      items.push({ label: 'ماه شمسی', value: jalaliMonthLabel(`${filter.year ?? resolved.currentYear}-${String(filter.month).padStart(2, '0')}`) });
    }
    const optionLabel = (
      list: { value: string; label: string }[],
      value: string,
    ): string => list.find((item) => item.value === value)?.label ?? value;

    if (filter.equipmentType) {
      items.push({
        label: 'نوع تجهیز',
        value: optionLabel(resolved.equipmentTypes, filter.equipmentType),
      });
    }
    if (filter.manufacturer) {
      items.push({
        label: 'سازنده',
        value:
          filter.manufacturer === UNKNOWN_FILTER_VALUE
            ? 'نامشخص'
            : optionLabel(resolved.manufacturers, filter.manufacturer),
      });
    }
    if (filter.model) {
      items.push({ label: 'مدل', value: filter.model === UNKNOWN_FILTER_VALUE ? 'نامشخص' : filter.model });
    }
    if (filter.job) {
      items.push({ label: 'نوع شغل آورنده', value: filter.job === UNKNOWN_FILTER_VALUE ? 'نامشخص' : filter.job });
    }
    if (filter.technicianId) {
      items.push({
        label: 'تکنسین',
        value: optionLabel(resolved.technicians, filter.technicianId),
      });
    }
    if (filter.status) {
      items.push({
        label: 'وضعیت دستگاه',
        value: resolved.statuses.find((item) => item.value === filter.status)?.label ?? filter.status,
      });
    }
    if (filter.operationType) {
      items.push({
        label: 'نوع عملیات',
        value: optionLabel(resolved.operationTypes, filter.operationType),
      });
    }
    return items;
  }

  private async monthlyTrend(filter: AnalyticsFilter): Promise<ReportChartResult> {
    const [received, delivered] = await Promise.all([
      this.repo.aggregateSingle(filter, 'month', 'count'),
      this.repo.aggregateSingle(filter, 'month', 'delivered'),
    ]);
    const buckets = jalaliMonthBuckets(filter);
    const receivedMap = new Map(received.map((row) => [row.label, row.value]));
    const deliveredMap = new Map(delivered.map((row) => [row.label, row.value]));
    return {
      id: 'monthlyTrend',
      title: 'روند ماهانه پذیرش و تحویل',
      chartType: 'line',
      dimension: 'month',
      metric: 'count',
      categories: buckets.map((bucket) => bucket.label),
      series: [
        {
          name: 'پذیرش‌شده',
          data: buckets.map((bucket) => receivedMap.get(bucket.key) ?? 0),
        },
        {
          name: 'تحویل‌داده‌شده',
          data: buckets.map((bucket) => deliveredMap.get(bucket.key) ?? 0),
        },
      ],
      total: received.reduce((sum, row) => sum + row.value, 0),
    };
  }

  private statusChart(
    filter: AnalyticsFilter,
    rows: { label: string; value: number }[],
  ): ReportChartResult {
    const counts = new Map(rows.map((row) => [row.label, row.value]));
    return {
      id: 'statuses',
      title: 'وضعیت تجهیزات',
      chartType: 'doughnut',
      dimension: 'status',
      metric: 'count',
      categories: DEVICE_STATUSES.map((status) => status.label),
      series: [
        {
          name: 'تعداد تجهیزات',
          data: DEVICE_STATUSES.map((status) => counts.get(status.key) ?? 0),
        },
      ],
      total: rows.reduce((sum, row) => sum + row.value, 0),
    };
  }

  private buildChart(
    id: string,
    title: string,
    chartType: ReportChartType,
    dimension: ReportDimension,
    metric: ReportMetric,
    rows: { label: string; value: number }[],
    horizontal = false,
  ): ReportChartResult {
    let list = rows;
    if ((chartType === 'pie' || chartType === 'doughnut') && rows.length > 12) {
      const visible = rows.slice(0, 12);
      const rest = rows.slice(12).reduce((sum, row) => sum + row.value, 0);
      list = rest > 0 ? [...visible, { label: 'سایر', value: rest }] : visible;
    }
    const categories = list.map((row) => this.displayCategory(dimension, row.label));
    return {
      id,
      title,
      chartType,
      dimension,
      metric,
      categories,
      series: [{ name: METRIC_LABELS[metric], data: list.map((row) => row.value) }],
      total: rows.reduce((sum, row) => sum + row.value, 0),
      horizontal: horizontal || undefined,
    };
  }

  private async runChart(
    chart: ReportChartConfig,
    filter: AnalyticsFilter,
  ): Promise<ReportChartResult> {
    const title = chart.title?.trim() || `${DIMENSION_LABELS[chart.dimension]} — ${METRIC_LABELS[chart.metric]}`;
    if (chart.chartType === 'stackedBar') {
      const result = await this.repo.aggregateStacked(filter, chart.dimension);
      return {
        id: chart.id,
        title,
        chartType: chart.chartType,
        dimension: chart.dimension,
        metric: 'count',
        categories: result.categories.map((category) =>
          this.displayCategory(chart.dimension, category),
        ),
        series: result.series,
        total: result.total,
      };
    }
    if (chart.chartType === 'combo') {
      const result = await this.repo.aggregateCombo(filter, chart.dimension);
      return {
        id: chart.id,
        title,
        chartType: chart.chartType,
        dimension: chart.dimension,
        metric: chart.metric,
        categories: result.categories.map((category) =>
          this.displayCategory(chart.dimension, category),
        ),
        series: result.series,
        total: result.total,
      };
    }

    const timeDimension = chart.dimension === 'month' || chart.dimension === 'year';
    const limit = timeDimension
      ? undefined
      : chart.chartType === 'pie' || chart.chartType === 'doughnut'
        ? 13
        : 20;
    const rows = await this.repo.aggregateSingle(filter, chart.dimension, chart.metric, limit);
    let list = rows;
    if ((chart.chartType === 'pie' || chart.chartType === 'doughnut') && rows.length > 12) {
      const visible = rows.slice(0, 12);
      const rest = rows.slice(12).reduce((sum, row) => sum + row.value, 0);
      list = rest > 0 ? [...visible, { label: 'سایر', value: rest }] : visible;
    }
    return {
      id: chart.id,
      title,
      chartType: chart.chartType,
      dimension: chart.dimension,
      metric: chart.metric,
      categories: list.map((row) => this.displayCategory(chart.dimension, row.label)),
      series: [{ name: METRIC_LABELS[chart.metric], data: list.map((row) => row.value) }],
      total: rows.reduce((sum, row) => sum + row.value, 0),
    };
  }

  private displayCategory(dimension: ReportDimension, label: string): string {
    if (dimension === 'month') return jalaliMonthLabel(label);
    if (dimension === 'year') return toPersianDigits(label);
    if (dimension === 'status') {
      return DEVICE_STATUSES.find((status) => status.key === label)?.label ?? label;
    }
    return label;
  }

  private configFromDto(dto: RunReportDto): ReportConfig {
    const config: ReportConfig = {
      ...this.cleanFilters(dto),
      charts: dto.charts.map((chart) => ({
        id: chart.id,
        title: chart.title?.trim() || undefined,
        dimension: chart.dimension,
        metric: chart.metric,
        chartType: chart.chartType,
      })),
      tableColumns: dto.tableColumns?.filter((column) => REPORT_TABLE_COLUMN_PATTERN.test(column)),
      tableLimit: dto.tableLimit,
    };
    this.assertFilter(config);
    return config;
  }

  private sanitizeStoredConfig(raw: unknown): ReportConfig {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new AppException(ErrorCodes.VALIDATION_ERROR, 'قالب گزارش ذخیره‌شده معتبر نیست.');
    }
    const source = raw as Record<string, unknown>;
    const chartsRaw = Array.isArray(source.charts) ? source.charts : [];
    if (chartsRaw.length === 0 || chartsRaw.length > 8) {
      throw new AppException(ErrorCodes.VALIDATION_ERROR, 'قالب گزارش ذخیره‌شده معتبر نیست.');
    }
    const charts: ReportChartConfig[] = chartsRaw.map((item) => {
      const chart = item as Record<string, unknown>;
      const dimension = String(chart.dimension ?? '');
      const metric = String(chart.metric ?? '');
      const chartType = String(chart.chartType ?? '');
      if (
        !REPORT_DIMENSIONS.includes(dimension as ReportDimension) ||
        !REPORT_METRICS.includes(metric as ReportMetric) ||
        !REPORT_CHART_TYPES.includes(chartType as ReportChartType)
      ) {
        throw new AppException(ErrorCodes.VALIDATION_ERROR, 'قالب گزارش ذخیره‌شده معتبر نیست.');
      }
      return {
        id: String(chart.id ?? `chart-${Math.random().toString(36).slice(2, 8)}`).slice(0, 60),
        title: typeof chart.title === 'string' ? chart.title.slice(0, 120) : undefined,
        dimension: dimension as ReportDimension,
        metric: metric as ReportMetric,
        chartType: chartType as ReportChartType,
      };
    });
    const tableColumns = Array.isArray(source.tableColumns)
      ? source.tableColumns
          .map((column) => String(column))
          .filter((column): column is ReportTableColumn => REPORT_TABLE_COLUMN_PATTERN.test(column))
      : undefined;
    const config: ReportConfig = {
      from: typeof source.from === 'string' ? source.from : undefined,
      to: typeof source.to === 'string' ? source.to : undefined,
      year: typeof source.year === 'number' ? source.year : undefined,
      month: typeof source.month === 'number' ? source.month : undefined,
      equipmentType: typeof source.equipmentType === 'string' ? source.equipmentType : undefined,
      manufacturer: typeof source.manufacturer === 'string' ? source.manufacturer : undefined,
      model: typeof source.model === 'string' ? source.model : undefined,
      job: typeof source.job === 'string' ? source.job : undefined,
      technicianId: typeof source.technicianId === 'string' ? source.technicianId : undefined,
      status: typeof source.status === 'string' ? source.status : undefined,
      operationType: typeof source.operationType === 'string' ? source.operationType : undefined,
      charts,
      tableColumns,
      tableLimit:
        typeof source.tableLimit === 'number' ? Math.min(Math.max(source.tableLimit, 1), 2000) : undefined,
    };
    this.assertFilter(config);
    return config;
  }

  private cleanFilters(filter: AnalyticsFilter): AnalyticsFilter {
    const output: AnalyticsFilter = {};
    if (filter.from) output.from = filter.from;
    if (filter.to) output.to = filter.to;
    if (filter.year) output.year = filter.year;
    if (filter.month) output.month = filter.month;
    if (filter.equipmentType) output.equipmentType = filter.equipmentType;
    if (filter.manufacturer) output.manufacturer = filter.manufacturer;
    if (filter.model) output.model = filter.model;
    if (filter.job) output.job = filter.job;
    if (filter.technicianId) output.technicianId = filter.technicianId;
    if (filter.status) output.status = filter.status;
    if (filter.operationType) output.operationType = filter.operationType;
    return output;
  }

  private assertFilter(filter: AnalyticsFilter): void {
    const from = filter.from ? new Date(filter.from).getTime() : null;
    const to = filter.to ? new Date(filter.to).getTime() : null;
    if ((from !== null && !Number.isFinite(from)) || (to !== null && !Number.isFinite(to))) {
      throw new AppException(
        ErrorCodes.VALIDATION_ERROR,
        'بازه تاریخ معتبر نیست؛ تاریخ شروع باید پیش از پایان باشد.',
      );
    }
    if (from !== null && to !== null && from >= to) {
      throw new AppException(
        ErrorCodes.VALIDATION_ERROR,
        'بازه تاریخ معتبر نیست؛ تاریخ شروع باید پیش از پایان باشد.',
      );
    }
  }

  private async findSavedRow(id: string): Promise<SavedReportRow | null> {
    return this.db.queryOne<SavedReportRow>(
      `SELECT r.id, r.name, r.description, r.config, r.is_shared, r.version,
              r.created_by, u.full_name AS owner_name, r.created_at, r.updated_at
         FROM saved_reports r
         LEFT JOIN users u ON u.id = r.created_by
        WHERE r.id = $1 AND r.deleted_at IS NULL`,
      [id],
    );
  }

  private assertCanManage(row: SavedReportRow, user: AuthUser): void {
    if (row.created_by === user.id) return;
    if (hasPermission(user.permissions, PERMISSIONS.REPORTS_MANAGE)) return;
    throw new AppException(
      ErrorCodes.FORBIDDEN,
      'فقط سازنده یا کاربر دارای مجوز مدیریت گزارش می‌تواند این قالب را تغییر دهد.',
      HttpStatus.FORBIDDEN,
    );
  }

  private toSavedReport(row: SavedReportRow, user: AuthUser): SavedReportDto {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      config: this.sanitizeStoredConfig(row.config),
      isShared: row.is_shared,
      version: row.version,
      ownerName: row.owner_name,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      canManage:
        row.created_by === user.id || hasPermission(user.permissions, PERMISSIONS.REPORTS_MANAGE),
    };
  }

  private actor(user: AuthUser): AuditActor {
    return { id: user.id, username: user.username };
  }

  private styleHeader(sheet: ExcelJS.Worksheet): void {
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2538AC' } };
    header.alignment = { horizontal: 'center', vertical: 'middle' };
    header.height = 24;
    sheet.eachRow((row) => {
      row.alignment = { vertical: 'middle', horizontal: 'right' };
    });
  }

  private csvCell(value: string): string {
    if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
  }
}
