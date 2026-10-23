export const REPORT_DIMENSIONS = [
  'equipmentType',
  'manufacturer',
  'model',
  'status',
  'job',
  'technician',
  'month',
  'year',
  'operationType',
  'customer',
] as const;
export type ReportDimension = (typeof REPORT_DIMENSIONS)[number];

export const REPORT_METRICS = [
  'count',
  'delivered',
  'failed',
  'active',
  'customers',
  'operations',
] as const;
export type ReportMetric = (typeof REPORT_METRICS)[number];

export const REPORT_CHART_TYPES = [
  'bar',
  'line',
  'pie',
  'doughnut',
  'area',
  'stackedBar',
  'combo',
] as const;
export type ReportChartType = (typeof REPORT_CHART_TYPES)[number];

export const REPORT_TABLE_COLUMNS = [
  'intakeCode',
  'ownerName',
  'ownerPhone',
  'job',
  'equipmentType',
  'manufacturer',
  'model',
  'status',
  'technician',
  'receivedAt',
  'dueAt',
  'deliveredAt',
  'operationCount',
  'reportedProblem',
] as const;
export type ReportTableColumn = (typeof REPORT_TABLE_COLUMNS)[number];

export const DIMENSION_LABELS: Record<ReportDimension, string> = {
  equipmentType: 'نوع تجهیز',
  manufacturer: 'سازنده',
  model: 'مدل',
  status: 'وضعیت دستگاه',
  job: 'نوع شغل آورنده',
  technician: 'تکنسین',
  month: 'ماه شمسی',
  year: 'سال شمسی',
  operationType: 'نوع عملیات',
  customer: 'مشتری',
};

export const METRIC_LABELS: Record<ReportMetric, string> = {
  count: 'تعداد تجهیزات',
  delivered: 'تعداد تحویل‌شده',
  failed: 'تعداد ناموفق',
  active: 'تعداد در جریان',
  customers: 'تعداد مشتریان',
  operations: 'تعداد عملیات',
};

export const CHART_TYPE_LABELS: Record<ReportChartType, string> = {
  bar: 'میله‌ای',
  line: 'خطی',
  pie: 'دایره‌ای',
  doughnut: 'دونات',
  area: 'ناحیه‌ای',
  stackedBar: 'میله‌ای انباشته',
  combo: 'ترکیبی',
};

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

export interface DashboardResponse {
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

export interface OptionItem {
  value: string;
  label: string;
  count?: number;
}

export interface AnalyticsOptions {
  equipmentTypes: OptionItem[];
  manufacturers: OptionItem[];
  models: string[];
  jobs: string[];
  technicians: { value: string; label: string }[];
  operationTypes: OptionItem[];
  statuses: { value: string; label: string; tone: string }[];
  years: { value: number; label: string }[];
  currentYear: number;
  currentMonth: number;
  workshop: { name: string; phone: string; address: string; logo: string };
}

export interface SavedReportDto {
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

export const UNKNOWN_FILTER_VALUE = '__unknown__';

export const WORK_STATUS_KEYS = [
  'received',
  'pending_review',
  'reviewing',
  'awaiting_customer',
  'in_progress',
  'awaiting_part',
] as const;

export const FAILED_STATUS_KEYS = ['failed', 'unrepairable'] as const;
