import { isValidJalaaliDate, toGregorian } from 'jalaali-js';

const TEHRAN = 'Asia/Tehran';

const dateFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: TEHRAN,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const dateTimeFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: TEHRAN,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const longDateFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: TEHRAN,
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

function toDate(value: string | Date): Date | null {
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

/** تاریخ شمسی کوتاه: ۱۴۰۵/۰۷/۳۰ */
export function formatJalaliDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = toDate(value);
  return date ? dateFormatter.format(date) : '—';
}

/** تاریخ و ساعت شمسی: ۱۴۰۵/۰۷/۳۰ - ۱۴:۳۰ */
export function formatJalaliDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = toDate(value);
  return date ? dateTimeFormatter.format(date).replace(/[،,]\s*/, ' - ') : '—';
}

/** تاریخ کامل با نام روز و ماه: پنجشنبه ۳۰ مهر ۱۴۰۵ */
export function formatJalaliLong(value: string | Date = new Date()): string {
  const date = toDate(value);
  return date ? longDateFormatter.format(date) : '—';
}

export function normalizeDigits(input: string): string {
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  let result = '';
  for (const char of input) {
    const pIndex = persian.indexOf(char);
    const aIndex = arabic.indexOf(char);
    if (pIndex >= 0) result += String(pIndex);
    else if (aIndex >= 0) result += String(aIndex);
    else result += char;
  }
  return result;
}

export interface ParsedJalali {
  jy: number;
  jm: number;
  jd: number;
}

/** تبدیل ورودی «۱۴۰۵/۰۷/۳۰» به اجزای تاریخ شمسی */
export function parseJalali(value: string): ParsedJalali | null {
  const normalized = normalizeDigits(value.trim()).replace(/[-.]/g, '/');
  const match = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;
  const jy = Number(match[1]);
  const jm = Number(match[2]);
  const jd = Number(match[3]);
  if (!isValidJalaaliDate(jy, jm, jd)) return null;
  return { jy, jm, jd };
}

/** ایران از سال ۱۴۰۱ ساعت تابستانی ندارد؛ اختلاف ثابت +۰۳:۳۰ */
const TEHRAN_OFFSET_MINUTES = 3 * 60 + 30;

/** ابتدای روز شمسی به وقت تهران، به‌صورت ISO */
export function jalaliStartOfDayIso(value: string): string | null {
  const parsed = parseJalali(value);
  if (!parsed) return null;
  const gregorian = toGregorian(parsed.jy, parsed.jm, parsed.jd);
  const utcMs =
    Date.UTC(gregorian.gy, gregorian.gm - 1, gregorian.gd, 0, 0, 0) -
    TEHRAN_OFFSET_MINUTES * 60_000;
  return new Date(utcMs).toISOString();
}

/** پایان روز شمسی (۰۰:۰۰ روز بعد) به وقت تهران، به‌صورت ISO */
export function jalaliEndOfDayIso(value: string): string | null {
  const start = jalaliStartOfDayIso(value);
  if (!start) return null;
  return new Date(new Date(start).getTime() + 86_400_000).toISOString();
}

/** نمایش مدت زمان به فارسی */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} ثانیه`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} دقیقه`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return remainingMinutes ? `${hours} ساعت و ${remainingMinutes} دقیقه` : `${hours} ساعت`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days} روز و ${remainingHours} ساعت` : `${days} روز`;
}
