const TEHRAN = 'Asia/Tehran';

function parts(date: Date): Record<string, string> {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TEHRAN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const result: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') result[part.type] = part.value;
  }
  return result;
}

/** نام فایل پشتیبان با زمان محلی تهران: 20261022-172530 */
export function timestampForFileName(date = new Date()): string {
  const p = parts(date);
  return `${p.year}${p.month}${p.day}-${p.hour}${p.minute}${p.second}`;
}

/** زمان خوانا برای فایل‌های لاگ: 1405/07/30 - 17:25 */
export function formatTehranForLog(date = new Date()): string {
  return new Intl.DateTimeFormat('fa-IR', {
    timeZone: TEHRAN,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}
