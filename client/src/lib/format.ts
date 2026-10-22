const faNumber = new Intl.NumberFormat('fa-IR');

export function formatNumber(value: number): string {
  return faNumber.format(value);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '۰ بایت';
  const units = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const rounded = size >= 10 || unit === 0 ? Math.round(size) : Math.round(size * 10) / 10;
  return `${faNumber.format(rounded)} ${units[unit]}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '؟';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[1][0]}`;
}

export function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return 'دستگاه ناشناس';
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Chrome\//.test(userAgent)
      ? 'Chrome'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'مرورگر';
  const os = /Windows/.test(userAgent)
    ? 'ویندوز'
    : /Mac OS/.test(userAgent)
      ? 'مک'
      : /Android/.test(userAgent)
        ? 'اندروید'
        : /Linux/.test(userAgent)
          ? 'لینوکس'
          : '';
  return os ? `${browser} روی ${os}` : browser;
}
