export interface DeviceStatusDefinition {
  key: string;
  label: string;
  tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'brand';
  /** دستگاه در این وضعیت به‌عنوان کار در جریان شمرده می‌شود */
  active: boolean;
  /** پرونده با این وضعیت بسته می‌شود */
  closed: boolean;
}

export const DEVICE_STATUSES: DeviceStatusDefinition[] = [
  { key: 'received', label: 'دریافت شده', tone: 'neutral', active: true, closed: false },
  { key: 'pending_review', label: 'در انتظار بررسی', tone: 'info', active: true, closed: false },
  { key: 'reviewing', label: 'در حال بررسی', tone: 'info', active: true, closed: false },
  { key: 'awaiting_customer', label: 'در انتظار تأیید مشتری', tone: 'warning', active: true, closed: false },
  { key: 'in_progress', label: 'در حال انجام', tone: 'brand', active: true, closed: false },
  { key: 'awaiting_part', label: 'منتظر قطعه', tone: 'warning', active: true, closed: false },
  { key: 'done', label: 'انجام شده', tone: 'success', active: true, closed: false },
  { key: 'failed', label: 'ناموفق', tone: 'danger', active: false, closed: true },
  { key: 'unrepairable', label: 'غیرقابل تعمیر', tone: 'danger', active: false, closed: true },
  { key: 'ready_delivery', label: 'آماده تحویل', tone: 'success', active: true, closed: false },
  { key: 'delivered', label: 'تحویل داده شده', tone: 'success', active: false, closed: true },
  { key: 'cancelled', label: 'انصراف مشتری', tone: 'neutral', active: false, closed: true },
];

const STATUS_MAP = new Map(DEVICE_STATUSES.map((status) => [status.key, status]));

export const DEFAULT_DEVICE_STATUS = 'received';

export function findDeviceStatus(key: string): DeviceStatusDefinition | null {
  return STATUS_MAP.get(key) ?? null;
}

export function deviceStatusLabel(key: string | null | undefined): string {
  if (!key) return '—';
  return STATUS_MAP.get(key)?.label ?? key;
}

/** وضعیت‌هایی که پرونده را باز نگه می‌دارند (کار در جریان) */
export const ACTIVE_STATUS_KEYS: string[] = DEVICE_STATUSES.filter((status) => status.active).map(
  (status) => status.key,
);

export const CLOSED_STATUS_KEYS: string[] = DEVICE_STATUSES.filter((status) => status.closed).map(
  (status) => status.key,
);

export const OPERATION_RESULTS = [
  { key: 'success', label: 'موفق' },
  { key: 'partial', label: 'ناقص / با هشدار' },
  { key: 'failed', label: 'ناموفق' },
] as const;

export function operationResultLabel(key: string | null | undefined): string {
  return OPERATION_RESULTS.find((item) => item.key === key)?.label ?? '—';
}

export const LOCK_STATUS_KEYS = [
  'unlocked',
  'pin',
  'pattern',
  'password',
  'biometric',
  'icloud',
  'google',
  'frp',
  'unknown',
] as const;

export const OPTION_CATEGORIES = [
  'equipment_type',
  'manufacturer',
  'accessory',
  'operation_type',
  'lock_status',
  'device_status',
] as const;

export type OptionCategory = (typeof OPTION_CATEGORIES)[number];

export const OPTION_CATEGORY_LABELS: Record<OptionCategory, string> = {
  equipment_type: 'نوع تجهیز',
  manufacturer: 'سازنده / برند',
  accessory: 'لوازم همراه',
  operation_type: 'نوع اقدام',
  lock_status: 'وضعیت قفل دستگاه',
  device_status: 'وضعیت دستگاه',
};

/**
 * وضعیت‌های سفارشی مدیر در فهرست گزینه‌ها ذخیره می‌شوند؛ وضعیت‌های پیش‌فرض نیز
 * در همان فهرست نگهداری می‌شوند تا برچسب همه آن‌ها یک منبع داشته باشد.
 */
export const DEVICE_STATUS_CATEGORY: OptionCategory = 'device_status';

export const DEFAULT_STATUS_TONE = 'info' as const;
