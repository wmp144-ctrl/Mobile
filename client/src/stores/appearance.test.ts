import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureFormatting, formatJalaliDate, formatJalaliDateTime } from '@/lib/jalali';
import { formatNumber } from '@/lib/format';
import { useAppearance } from './appearance';

function response(payload: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
  });
}

describe('تنظیمات ظاهر و قالب نمایش', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-accent');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    configureFormatting({
      language: 'fa',
      calendar: 'jalali',
      timezone: 'Asia/Tehran',
      timeFormat: '24',
    });
  });

  it('پوسته، رنگ‌بندی و زبان را روی سند اعمال می‌کند', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        response({
          needsSetup: false,
          appName: 'سامانه',
          version: '1.0.0',
          workshopName: 'تعمیرگاه نمونه',
          workshopLogo: '',
          serverTime: '2026-10-23T10:00:00.000Z',
          appearance: {
            language: 'en',
            calendar: 'gregorian',
            timezone: 'Asia/Tehran',
            timeFormat: '12',
            theme: 'dark',
            accentColor: 'teal',
          },
        }),
      ),
    );

    await useAppearance.getState().load();

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.accent).toBe('teal');
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(useAppearance.getState().appearance.theme).toBe('dark');

    // تقویم و زبان انتخاب‌شده روی قالب‌بندی تاریخ و ارقام اعمال می‌شود
    expect(formatJalaliDate('2026-10-23T10:00:00.000Z')).toBe('23/10/2026');
    expect(formatNumber(1405)).toBe('1,405');
    expect(document.documentElement.lang).toBe('en');
  });

  it('در حالت پیش‌فرض تاریخ شمسی و ارقام فارسی نمایش داده می‌شود', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        response({
          needsSetup: false,
          appName: 'سامانه',
          version: '1.0.0',
          workshopName: 'تعمیرگاه نمونه',
          workshopLogo: '',
          serverTime: '2026-10-23T10:00:00.000Z',
          appearance: {
            language: 'fa',
            calendar: 'jalali',
            timezone: 'Asia/Tehran',
            timeFormat: '24',
            theme: 'light',
            accentColor: 'blue',
          },
        }),
      ),
    );

    await useAppearance.getState().load();

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dir).toBe('rtl');
    expect(formatJalaliDate('2026-10-23T10:00:00.000Z')).toContain('۱۴۰۵');
    expect(formatJalaliDateTime('2026-10-23T10:30:00.000Z')).toContain('۱۴');
  });
});
