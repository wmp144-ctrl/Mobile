import {
  isoToJalaliDateInput,
  jalaliEndOfDayIso,
  jalaliStartOfDayIso,
  parseJalali,
} from '@/lib/jalali';
import type {
  AnalyticsFilter,
  AnalyticsOptions,
  ReportChartConfig,
  ReportChartType,
  ReportDimension,
  ReportMetric,
  ReportTableColumn,
} from '@/lib/types';

export const UNKNOWN_FILTER_VALUE = '__unknown__';

export const JALALI_MONTH_OPTIONS = [
  { value: 1, label: 'فروردین' },
  { value: 2, label: 'اردیبهشت' },
  { value: 3, label: 'خرداد' },
  { value: 4, label: 'تیر' },
  { value: 5, label: 'مرداد' },
  { value: 6, label: 'شهریور' },
  { value: 7, label: 'مهر' },
  { value: 8, label: 'آبان' },
  { value: 9, label: 'آذر' },
  { value: 10, label: 'دی' },
  { value: 11, label: 'بهمن' },
  { value: 12, label: 'اسفند' },
];

export const DIMENSION_OPTIONS: { value: ReportDimension; label: string }[] = [
  { value: 'equipmentType', label: 'نوع تجهیز' },
  { value: 'manufacturer', label: 'سازنده' },
  { value: 'model', label: 'مدل' },
  { value: 'status', label: 'وضعیت دستگاه' },
  { value: 'job', label: 'نوع شغل آورنده' },
  { value: 'technician', label: 'تکنسین' },
  { value: 'month', label: 'ماه شمسی' },
  { value: 'year', label: 'سال شمسی' },
  { value: 'operationType', label: 'نوع عملیات' },
  { value: 'customer', label: 'مشتری' },
];

export const METRIC_OPTIONS: { value: ReportMetric; label: string }[] = [
  { value: 'count', label: 'تعداد تجهیزات' },
  { value: 'delivered', label: 'تعداد تحویل‌شده' },
  { value: 'failed', label: 'تعداد ناموفق' },
  { value: 'active', label: 'تعداد در جریان' },
  { value: 'customers', label: 'تعداد مشتریان' },
  { value: 'operations', label: 'تعداد عملیات' },
];

export const CHART_TYPE_OPTIONS: { value: ReportChartType; label: string }[] = [
  { value: 'bar', label: 'میله‌ای' },
  { value: 'line', label: 'خطی' },
  { value: 'pie', label: 'دایره‌ای' },
  { value: 'doughnut', label: 'دونات' },
  { value: 'area', label: 'ناحیه‌ای' },
  { value: 'stackedBar', label: 'میله‌ای انباشته' },
  { value: 'combo', label: 'ترکیبی (میله + خط)' },
];

export const TABLE_COLUMN_OPTIONS: { value: ReportTableColumn; label: string }[] = [
  { value: 'intakeCode', label: 'کد پذیرش' },
  { value: 'ownerName', label: 'مالک' },
  { value: 'ownerPhone', label: 'تلفن مالک' },
  { value: 'job', label: 'نوع شغل آورنده' },
  { value: 'equipmentType', label: 'نوع تجهیز' },
  { value: 'manufacturer', label: 'سازنده' },
  { value: 'model', label: 'مدل' },
  { value: 'status', label: 'وضعیت' },
  { value: 'technician', label: 'تکنسین' },
  { value: 'receivedAt', label: 'تاریخ پذیرش' },
  { value: 'dueAt', label: 'تاریخ پیش‌بینی تحویل' },
  { value: 'deliveredAt', label: 'تاریخ تحویل' },
  { value: 'operationCount', label: 'تعداد اقدامات' },
  { value: 'reportedProblem', label: 'مشکل اعلام‌شده' },
];

export const DEFAULT_TABLE_COLUMNS: ReportTableColumn[] = [
  'intakeCode',
  'ownerName',
  'equipmentType',
  'status',
  'receivedAt',
];

export interface ReportFilterForm {
  fromDate: string;
  toDate: string;
  year: string;
  month: string;
  equipmentType: string;
  manufacturer: string;
  model: string;
  job: string;
  technicianId: string;
  status: string;
  operationType: string;
}

export const EMPTY_FILTER_FORM: ReportFilterForm = {
  fromDate: '',
  toDate: '',
  year: '',
  month: '',
  equipmentType: '',
  manufacturer: '',
  model: '',
  job: '',
  technicianId: '',
  status: '',
  operationType: '',
};

export function filterFormError(form: ReportFilterForm): string | null {
  if (form.fromDate.trim() && !parseJalali(form.fromDate)) {
    return 'تاریخ شروع معتبر نیست؛ نمونه درست: ۱۴۰۵/۰۷/۰۱';
  }
  if (form.toDate.trim() && !parseJalali(form.toDate)) {
    return 'تاریخ پایان معتبر نیست؛ نمونه درست: ۱۴۰۵/۰۷/۳۰';
  }
  const from = form.fromDate.trim() ? jalaliStartOfDayIso(form.fromDate) : null;
  const to = form.toDate.trim() ? jalaliEndOfDayIso(form.toDate) : null;
  if (from && to && from >= to) {
    return 'تاریخ شروع باید پیش از تاریخ پایان باشد.';
  }
  return null;
}

export function filterFormToApi(form: ReportFilterForm): AnalyticsFilter {
  const filter: AnalyticsFilter = {};
  if (form.fromDate.trim() && parseJalali(form.fromDate)) {
    const from = jalaliStartOfDayIso(form.fromDate);
    if (from) filter.from = from;
  }
  if (form.toDate.trim() && parseJalali(form.toDate)) {
    const to = jalaliEndOfDayIso(form.toDate);
    if (to) filter.to = to;
  }
  if (form.year) filter.year = Number(form.year);
  if (form.month) filter.month = Number(form.month);
  if (form.equipmentType) filter.equipmentType = form.equipmentType;
  if (form.manufacturer) filter.manufacturer = form.manufacturer;
  if (form.model) filter.model = form.model;
  if (form.job) filter.job = form.job;
  if (form.technicianId) filter.technicianId = form.technicianId;
  if (form.status) filter.status = form.status;
  if (form.operationType) filter.operationType = form.operationType;
  return filter;
}

export function filterToForm(filter: AnalyticsFilter): ReportFilterForm {
  return {
    fromDate: filter.from ? isoToJalaliDateInput(filter.from) : '',
    toDate: filter.to ? isoToJalaliDateInput(new Date(new Date(filter.to).getTime() - 1)) : '',
    year: filter.year ? String(filter.year) : '',
    month: filter.month ? String(filter.month) : '',
    equipmentType: filter.equipmentType ?? '',
    manufacturer: filter.manufacturer ?? '',
    model: filter.model ?? '',
    job: filter.job ?? '',
    technicianId: filter.technicianId ?? '',
    status: filter.status ?? '',
    operationType: filter.operationType ?? '',
  };
}

export function filterToQuery(filter: AnalyticsFilter): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function activeFilterCount(form: ReportFilterForm): number {
  return Object.values(form).filter((value) => String(value).trim().length > 0).length;
}

export function labelForOption(
  options: { value: string; label: string }[],
  value: string,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function optionsForSelect(
  options: AnalyticsOptions | null,
  key: 'equipmentTypes' | 'manufacturers' | 'operationTypes',
): { value: string; label: string; count?: number }[] {
  return options?.[key] ?? [];
}

export function buildFilterSummary(
  form: ReportFilterForm,
  options: AnalyticsOptions | null,
): { label: string; value: string }[] {
  const items: { label: string; value: string }[] = [];
  if (form.fromDate && form.toDate) {
    items.push({ label: 'بازه تاریخ', value: `از ${form.fromDate} تا ${form.toDate}` });
  } else if (form.fromDate) {
    items.push({ label: 'بازه تاریخ', value: `از ${form.fromDate}` });
  } else if (form.toDate) {
    items.push({ label: 'بازه تاریخ', value: `تا ${form.toDate}` });
  }
  if (form.year) {
    items.push({ label: 'سال شمسی', value: options?.years.find((year) => String(year.value) === form.year)?.label ?? form.year });
  }
  if (form.month) {
    items.push({
      label: 'ماه شمسی',
      value: JALALI_MONTH_OPTIONS.find((month) => String(month.value) === form.month)?.label ?? form.month,
    });
  }
  if (form.equipmentType) {
    items.push({ label: 'نوع تجهیز', value: labelForOption(options?.equipmentTypes ?? [], form.equipmentType) });
  }
  if (form.manufacturer) {
    items.push({ label: 'سازنده', value: labelForOption(options?.manufacturers ?? [], form.manufacturer) });
  }
  if (form.model) {
    items.push({ label: 'مدل', value: form.model === UNKNOWN_FILTER_VALUE ? 'نامشخص' : form.model });
  }
  if (form.job) {
    items.push({ label: 'نوع شغل آورنده', value: form.job === UNKNOWN_FILTER_VALUE ? 'نامشخص' : form.job });
  }
  if (form.technicianId) {
    items.push({ label: 'تکنسین', value: labelForOption(options?.technicians ?? [], form.technicianId) });
  }
  if (form.status) {
    items.push({ label: 'وضعیت دستگاه', value: labelForOption(options?.statuses ?? [], form.status) });
  }
  if (form.operationType) {
    items.push({ label: 'نوع عملیات', value: labelForOption(options?.operationTypes ?? [], form.operationType) });
  }
  return items;
}

let chartSequence = 0;

export function createChartConfig(overrides: Partial<ReportChartConfig> = {}): ReportChartConfig {
  chartSequence += 1;
  return {
    id: `chart-${Date.now()}-${chartSequence}`,
    dimension: 'equipmentType',
    metric: 'count',
    chartType: 'bar',
    ...overrides,
  };
}
