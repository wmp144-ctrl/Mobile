import type { BadgeProps } from '@/components/ui/badge';
import type { OpenTicket } from './types';

export const FOLDER_CATEGORY_OPTIONS = [
  { key: 'root', label: 'پوشه اصلی دستگاه' },
  { key: 'original', label: 'فایل اصلی (Original)' },
  { key: 'backup', label: 'بکاپ (Backup)' },
  { key: 'recovered', label: 'ریکاوری‌شده (Recovered)' },
  { key: 'report', label: 'گزارش (Reports)' },
  { key: 'image', label: 'تصویر (Images)' },
  { key: 'document', label: 'مستندات (Documents)' },
  { key: 'other', label: 'سایر' },
] as const;

export const BACKUP_STATUS_OPTIONS = [
  { key: 'none', label: 'بدون بکاپ' },
  { key: 'pending', label: 'در انتظار بکاپ' },
  { key: 'in_progress', label: 'در حال بکاپ' },
  { key: 'completed', label: 'بکاپ کامل' },
  { key: 'failed', label: 'بکاپ ناموفق' },
] as const;

export const ACCESS_STATUS_OPTIONS = [
  { key: 'unknown', label: 'بررسی نشده' },
  { key: 'ok', label: 'در دسترس' },
  { key: 'missing', label: 'یافت نشد' },
  { key: 'unavailable', label: 'غیرقابل دسترسی' },
] as const;

export const STORAGE_LOCATION_KIND_OPTIONS = [
  { key: 'server', label: 'دیسک سرور' },
  { key: 'nas', label: 'هارد شبکه / NAS' },
  { key: 'external', label: 'حافظه خارجی' },
] as const;

function labelOf(options: readonly { key: string; label: string }[], key: string): string {
  return options.find((option) => option.key === key)?.label ?? key;
}

export function folderCategoryLabel(key: string): string {
  return labelOf(FOLDER_CATEGORY_OPTIONS, key);
}

export function backupStatusLabel(key: string): string {
  return labelOf(BACKUP_STATUS_OPTIONS, key);
}

export function accessStatusLabel(key: string): string {
  return labelOf(ACCESS_STATUS_OPTIONS, key);
}

export function storageLocationKindLabel(key: string): string {
  return labelOf(STORAGE_LOCATION_KIND_OPTIONS, key);
}

export function accessStatusVariant(key: string): BadgeProps['variant'] {
  if (key === 'ok') return 'success';
  if (key === 'missing') return 'warning';
  if (key === 'unavailable') return 'danger';
  return 'default';
}

export function backupStatusVariant(key: string): BadgeProps['variant'] {
  if (key === 'completed') return 'success';
  if (key === 'failed') return 'danger';
  if (key === 'pending' || key === 'in_progress') return 'warning';
  return 'default';
}

export function helperProtocolUrl(ticket: OpenTicket): string {
  const server = typeof window !== 'undefined' ? window.location.origin : '';
  return `repairdesk://open?server=${encodeURIComponent(server)}&token=${encodeURIComponent(
    ticket.token,
  )}`;
}

/** فراخوانی برنامه کمکی ویندوز؛ در نبود برنامه، مرورگر پیام خطا نمایش می‌دهد. */
export function launchHelper(ticket: OpenTicket): void {
  const url = helperProtocolUrl(ticket);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
