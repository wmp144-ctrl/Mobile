import { isValidJalaaliDate, toGregorian } from 'jalaali-js';

const TEHRAN = 'Asia/Tehran';

export interface FormatPreferences {
  language: 'fa' | 'en';
  calendar: 'jalali' | 'gregorian';
  timezone: string;
  timeFormat: '24' | '12';
}

let preferences: FormatPreferences = {
  language: 'fa',
  calendar: 'jalali',
  timezone: TEHRAN,
  timeFormat: '24',
};

interface FormatterCache {
  key: string;
  date: Intl.DateTimeFormat;
  dateTime: Intl.DateTimeFormat;
  long: Intl.DateTimeFormat;
}

let cache: FormatterCache | null = null;

/** اعمال تنظیمات زبان، تقویم، منطقه زمانی و قالب ساعت از تنظیمات سامانه */
export function configureFormatting(next: Partial<FormatPreferences>): void {
  preferences = { ...preferences, ...next };
  cache = null;
}

export function getFormattingPreferences(): FormatPreferences {
  return { ...preferences };
}

function formatters(): FormatterCache {
  const key = `${preferences.language}|${preferences.calendar}|${preferences.timezone}|${preferences.timeFormat}`;
  if (cache?.key === key) return cache;
  const locale =
    preferences.calendar === 'jalali'
      ? preferences.language === 'fa'
        ? 'fa-IR-u-ca-persian'
        : 'en-GB-u-ca-persian'
      : preferences.language === 'fa'
        ? 'fa-IR'
        : 'en-GB';
  const base = {
    timeZone: preferences.timezone || TEHRAN,
    year: 'numeric' as const,
    month: '2-digit' as const,
    day: '2-digit' as const,
  };
  cache = {
    key,
    date: new Intl.DateTimeFormat(locale, base),
    dateTime: new Intl.DateTimeFormat(locale, {
      ...base,
      hour: '2-digit',
      minute: '2-digit',
      hour12: preferences.timeFormat === '12',
    }),
    long: new Intl.DateTimeFormat(locale, {
      timeZone: base.timeZone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  };
  return cache;
}

function toDate(value: string | Date): Date | null {
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

/** تاریخ کوتاه: ۱۴۰۵/۰۷/۳۰ (یا تاریخ میلادی بر اساس تنظیمات) */
export function formatJalaliDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = toDate(value);
  return date ? formatters().date.format(date) : '—';
}

/** تاریخ و ساعت: ۱۴۰۵/۰۷/۳۰ - ۱۴:۳۰ */
export function formatJalaliDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = toDate(value);
  return date
    ? formatters()
        .dateTime.format(date)
        .replace(/[،,]\s*/, ' - ')
    : '—';
}

/** تاریخ کامل با نام روز و ماه: پنجشنبه ۳۰ مهر ۱۴۰۵ */
export function formatJalaliLong(value: string | Date = new Date()): string {
  const date = toDate(value);
  return date ? formatters().long.format(date) : '—';
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

/** اجزای تاریخ و ساعت شمسی برای پر کردن فرم‌ها (ارقام لاتین) */
const latnPartsFormatter = new Intl.DateTimeFormat('en-US-u-ca-persian', {
  timeZone: TEHRAN,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function readParts(value: string | Date): Record<string, string> {
  const date = typeof value === 'string' ? new Date(value) : value;
  const parts: Record<string, string> = {};
  for (const part of latnPartsFormatter.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  return parts;
}

/** تاریخ ISO به ورودی تاریخ شمسی «۱۴۰۵/۰۷/۳۰» */
export function isoToJalaliDateInput(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = readParts(date);
  return `${parts.year}/${parts.month}/${parts.day}`;
}

/** تاریخ ISO به ورودی ساعت «۱۴:۳۰» */
export function isoToTimeInput(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = readParts(date);
  return `${parts.hour}:${parts.minute}`;
}

/** تبدیل تاریخ و ساعت شمسی به ISO (به وقت تهران) */
export function jalaliDateTimeToIso(dateValue: string, timeValue = '00:00'): string | null {
  const parsed = parseJalali(dateValue);
  if (!parsed) return null;
  const timeMatch = normalizeDigits(timeValue.trim()).match(/^(\d{1,2}):(\d{1,2})$/);
  if (!timeMatch) return null;
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (hour > 23 || minute > 59) return null;
  const gregorian = toGregorian(parsed.jy, parsed.jm, parsed.jd);
  const utcMs =
    Date.UTC(gregorian.gy, gregorian.gm - 1, gregorian.gd, hour, minute) -
    TEHRAN_OFFSET_MINUTES * 60_000;
  return new Date(utcMs).toISOString();
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
