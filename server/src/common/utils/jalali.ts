const TEHRAN = 'Asia/Tehran';

const persianYearFormatter = new Intl.DateTimeFormat('en-US-u-ca-persian', {
  timeZone: TEHRAN,
  year: 'numeric',
});

/** سال شمسی یک تاریخ به وقت تهران */
export function jalaliYear(date: Date = new Date()): number {
  const formatted = persianYearFormatter.format(date);
  const year = Number.parseInt(formatted.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(year) ? year : date.getUTCFullYear() - 621;
}

/** افزودن تعداد روز به یک تاریخ */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
