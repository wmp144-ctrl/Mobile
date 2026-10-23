import type { BadgeProps } from '@/components/ui/badge';

export interface DeviceStatusOption {
  key: string;
  label: string;
  tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'brand';
}

export const DEVICE_STATUS_OPTIONS: DeviceStatusOption[] = [
  { key: 'received', label: 'دریافت شده', tone: 'neutral' },
  { key: 'pending_review', label: 'در انتظار بررسی', tone: 'info' },
  { key: 'reviewing', label: 'در حال بررسی', tone: 'info' },
  { key: 'awaiting_customer', label: 'در انتظار تأیید مشتری', tone: 'warning' },
  { key: 'in_progress', label: 'در حال انجام', tone: 'brand' },
  { key: 'awaiting_part', label: 'منتظر قطعه', tone: 'warning' },
  { key: 'done', label: 'انجام شده', tone: 'success' },
  { key: 'failed', label: 'ناموفق', tone: 'danger' },
  { key: 'unrepairable', label: 'غیرقابل تعمیر', tone: 'danger' },
  { key: 'ready_delivery', label: 'آماده تحویل', tone: 'success' },
  { key: 'delivered', label: 'تحویل داده شده', tone: 'success' },
  { key: 'cancelled', label: 'انصراف مشتری', tone: 'neutral' },
];

const STATUS_MAP = new Map(DEVICE_STATUS_OPTIONS.map((status) => [status.key, status]));

const STATUS_TONES: DeviceStatusOption['tone'][] = [
  'neutral',
  'info',
  'warning',
  'success',
  'danger',
  'brand',
];

function normalizeTone(tone: string): DeviceStatusOption['tone'] {
  return STATUS_TONES.includes(tone as DeviceStatusOption['tone'])
    ? (tone as DeviceStatusOption['tone'])
    : 'info';
}

/**
 * وضعیت‌های پیش‌فرض را با وضعیت‌های تعریف‌شده توسط مدیر ترکیب می‌کند.
 * ترتیب وضعیت‌های پیش‌فرض حفظ می‌شود و وضعیت‌های سفارشی در انتها می‌آیند.
 */
export function mergeDeviceStatuses(
  configured?: Array<{
    key: string;
    label: string;
    tone: string;
    isActive: boolean;
  }> | null,
): DeviceStatusOption[] {
  if (!configured || configured.length === 0) return DEVICE_STATUS_OPTIONS;
  const byKey = new Map(configured.filter((item) => item.isActive).map((item) => [item.key, item]));
  const result: DeviceStatusOption[] = [];
  for (const builtin of DEVICE_STATUS_OPTIONS) {
    const item = byKey.get(builtin.key);
    if (!item) continue;
    result.push({ key: builtin.key, label: item.label, tone: normalizeTone(item.tone) });
    byKey.delete(builtin.key);
  }
  for (const item of byKey.values()) {
    result.push({ key: item.key, label: item.label, tone: normalizeTone(item.tone) });
  }
  return result.length > 0 ? result : DEVICE_STATUS_OPTIONS;
}

export function deviceStatusLabel(key: string | null | undefined): string {
  if (!key) return '—';
  return STATUS_MAP.get(key)?.label ?? key;
}

export function statusBadgeVariant(tone: string): BadgeProps['variant'] {
  switch (tone) {
    case 'success':
      return 'success';
    case 'warning':
      return 'warning';
    case 'danger':
      return 'danger';
    case 'brand':
    case 'info':
      return 'brand';
    default:
      return 'default';
  }
}

export const OPERATION_RESULT_OPTIONS = [
  { key: 'success', label: 'موفق' },
  { key: 'partial', label: 'ناقص / با هشدار' },
  { key: 'failed', label: 'ناموفق' },
];

export const STORAGE_KIND_OPTIONS = [
  { key: 'network', label: 'پوشه شبکه' },
  { key: 'local', label: 'دیسک محلی سرور' },
  { key: 'external', label: 'حافظه خارجی' },
];

export const FIELD_TYPE_OPTIONS = [
  { key: 'text', label: 'متن کوتاه' },
  { key: 'textarea', label: 'متن چندخطی' },
  { key: 'number', label: 'عدد' },
  { key: 'amount', label: 'مبلغ' },
  { key: 'date', label: 'تاریخ' },
  { key: 'datetime', label: 'تاریخ و ساعت' },
  { key: 'select', label: 'انتخاب تک‌گزینه‌ای' },
  { key: 'multi_select', label: 'انتخاب چندگزینه‌ای' },
  { key: 'checkbox', label: 'چک‌باکس' },
  { key: 'file', label: 'فایل' },
] as const;

export const OPTION_CATEGORY_LABELS: Record<string, string> = {
  equipment_type: 'نوع تجهیز',
  manufacturer: 'سازنده / برند',
  accessory: 'لوازم همراه',
  operation_type: 'نوع اقدام',
  lock_status: 'وضعیت قفل دستگاه',
  device_status: 'وضعیت دستگاه',
};

export const OPTION_CATEGORY_ORDER = [
  'equipment_type',
  'manufacturer',
  'accessory',
  'operation_type',
  'lock_status',
  'device_status',
];
