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
  { key: 'textarea', label: 'متن بلند' },
  { key: 'number', label: 'عدد' },
  { key: 'date', label: 'تاریخ' },
  { key: 'select', label: 'انتخاب تک‌گزینه‌ای' },
  { key: 'multi_select', label: 'انتخاب چندگزینه‌ای' },
  { key: 'checkbox', label: 'تیک' },
] as const;

export const OPTION_CATEGORY_LABELS: Record<string, string> = {
  equipment_type: 'نوع تجهیز',
  manufacturer: 'سازنده / برند',
  accessory: 'لوازم همراه',
  operation_type: 'نوع اقدام',
  lock_status: 'وضعیت قفل دستگاه',
};

export const OPTION_CATEGORY_ORDER = [
  'equipment_type',
  'manufacturer',
  'accessory',
  'operation_type',
  'lock_status',
];
