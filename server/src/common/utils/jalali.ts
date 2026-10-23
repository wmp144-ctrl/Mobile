import { toJalaali } from 'jalaali-js';

const TEHRAN = 'Asia/Tehran';
const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/** تبدیل ارقام لاتین به فارسی برای برچسب‌های نمودار و رابط کاربری */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)] ?? digit);
}

export const JALALI_MONTH_NAMES = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const;

const TEHRAN_PARTS_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: TEHRAN,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export interface JalaliParts {
  jy: number;
  jm: number;
  jd: number;
}

function toDate(value: string | Date): Date | null {
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

/** سال شمسی یک تاریخ به وقت تهران */
export function jalaliYear(date: Date = new Date()): number {
  return jalaliParts(date)?.jy ?? date.getUTCFullYear() - 621;
}

/** افزودن تعداد روز به یک تاریخ */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** اجزای تاریخ شمسی یک لحظه، بر اساس منطقه زمانی تهران */
export function jalaliParts(value: string | Date): JalaliParts | null {
  const date = toDate(value);
  if (!date) return null;
  const parts: Record<string, string> = {};
  for (const part of TEHRAN_PARTS_FORMATTER.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  const gy = Number(parts.year);
  const gm = Number(parts.month);
  const gd = Number(parts.day);
  if (!Number.isFinite(gy) || !Number.isFinite(gm) || !Number.isFinite(gd)) return null;
  return toJalaali(gy, gm, gd);
}

/** تاریخ شمسی ماشین‌خوان برای خروجی‌ها: 1405/07/30 */
export function formatJalaliDateLatin(value: string | Date | null | undefined): string {
  if (!value) return '';
  const parts = jalaliParts(value);
  if (!parts) return '';
  return `${parts.jy}/${String(parts.jm).padStart(2, '0')}/${String(parts.jd).padStart(2, '0')}`;
}

/** تاریخ و ساعت شمسی ماشین‌خوان: 1405/07/30 14:30 */
export function formatJalaliDateTimeLatin(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = toDate(value);
  const parts = jalaliParts(value);
  if (!date || !parts) return '';
  const hourMinute: Record<string, string> = {};
  for (const part of TEHRAN_PARTS_FORMATTER.formatToParts(date)) {
    if (part.type === 'hour' || part.type === 'minute') hourMinute[part.type] = part.value;
  }
  return `${formatJalaliDateLatin(value)} ${hourMinute.hour ?? '00'}:${hourMinute.minute ?? '00'}`;
}

/** تاریخ شمسی خوانا برای سربرگ‌ها و PDF: ۳۰ مهر ۱۴۰۵ */
export function formatJalaliLongLatin(value: string | Date | null | undefined): string {
  if (!value) return '';
  const parts = jalaliParts(value);
  if (!parts) return '';
  return `${parts.jd} ${JALALI_MONTH_NAMES[parts.jm - 1]} ${parts.jy}`;
}

export function jalaliMonthLabel(key: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return key;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const name = JALALI_MONTH_NAMES[month - 1] ?? String(month);
  return `${name} ${toPersianDigits(year)}`;
}

export function jalaliYearLabel(year: number): string {
  return String(year);
}

function monthKey(year: number, month: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export interface JalaliMonthBucket {
  key: string;
  label: string;
}

/**
 * ماه‌های شمسی قابل نمایش برای روند ماهانه.
 * اولویت با سال/ماه انتخاب‌شده و سپس بازه تاریخ است؛ در نبود فیلتر، ۱۲ ماه اخیر.
 */
export function jalaliMonthBuckets(
  filter: { from?: string; to?: string; year?: number; month?: number },
  now: Date = new Date(),
): JalaliMonthBucket[] {
  let start: { year: number; month: number } | null = null;
  let end: { year: number; month: number } | null = null;

  if (filter.year) {
    start = { year: filter.year, month: 1 };
    end = { year: filter.year, month: 12 };
  }

  if (filter.month && filter.year) {
    start = { year: filter.year, month: filter.month };
    end = { ...start };
  } else if (filter.month && !filter.year) {
    const current = jalaliParts(now);
    const year = current?.jy ?? new Date().getFullYear() - 621;
    start = { year, month: filter.month };
    end = { ...start };
  }

  if (!start && (filter.from || filter.to)) {
    const fromParts = filter.from ? jalaliParts(filter.from) : null;
    const toParts = filter.to ? jalaliParts(filter.to) : jalaliParts(now);
    if (fromParts) {
      start = { year: fromParts.jy, month: fromParts.jm };
    } else if (toParts) {
      start = shiftMonth(toParts.jy, toParts.jm, -11);
    }
    if (toParts) {
      end = { year: toParts.jy, month: toParts.jm };
    }
  }

  if (!start || !end) {
    const current = jalaliParts(now) ?? { jy: new Date().getFullYear() - 621, jm: 1, jd: 1 };
    end = { year: current.jy, month: current.jm };
    start = shiftMonth(current.jy, current.jm, -11);
  }

  let startIndex = start.year * 12 + (start.month - 1);
  let endIndex = end.year * 12 + (end.month - 1);
  if (endIndex < startIndex) [startIndex, endIndex] = [endIndex, startIndex];
  if (endIndex - startIndex > 59) startIndex = endIndex - 59;

  const buckets: JalaliMonthBucket[] = [];
  for (let index = startIndex; index <= endIndex; index += 1) {
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    const key = monthKey(year, month);
    buckets.push({ key, label: jalaliMonthLabel(key) });
  }
  return buckets;
}
