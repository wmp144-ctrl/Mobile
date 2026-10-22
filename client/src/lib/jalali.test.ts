import { describe, expect, it } from 'vitest';
import {
  formatJalaliDate,
  formatJalaliDateTime,
  isoToJalaliDateInput,
  isoToTimeInput,
  jalaliDateTimeToIso,
  jalaliEndOfDayIso,
  jalaliStartOfDayIso,
  normalizeDigits,
  parseJalali,
} from './jalali';

describe('تقویم هجری شمسی', () => {
  it('تاریخ میلادی را به شمسی نمایش می‌دهد', () => {
    expect(formatJalaliDate('2026-10-22T10:00:00.000Z')).toBe('۱۴۰۵/۰۷/۳۰');
  });

  it('تاریخ و ساعت را با تقویم شمسی نمایش می‌دهد', () => {
    const formatted = formatJalaliDateTime('2026-10-22T10:00:00.000Z');
    expect(formatted).toContain('۱۴۰۵/۰۷/۳۰');
    expect(formatted).toContain('۱۳:۳۰');
  });

  it('ورودی با ارقام فارسی را می‌پذیرد', () => {
    expect(parseJalali('۱۴۰۵/۰۷/۳۰')).toEqual({ jy: 1405, jm: 7, jd: 30 });
  });

  it('ورودی نامعتبر را رد می‌کند', () => {
    expect(parseJalali('۱۴۰۵/۱۳/۴۰')).toBeNull();
    expect(parseJalali('abc')).toBeNull();
  });

  it('ابتدای روز شمسی را به وقت تهران محاسبه می‌کند', () => {
    expect(jalaliStartOfDayIso('۱۴۰۵/۰۷/۳۰')).toBe('2026-10-21T20:30:00.000Z');
    expect(jalaliEndOfDayIso('۱۴۰۵/۰۷/۳۰')).toBe('2026-10-22T20:30:00.000Z');
  });

  it('ارقام فارسی و عربی را به لاتین تبدیل می‌کند', () => {
    expect(normalizeDigits('۱۲3٤')).toBe('1234');
  });

  it('تاریخ و ساعت شمسی را به ISO تبدیل می‌کند', () => {
    expect(jalaliDateTimeToIso('۱۴۰۵/۰۷/۳۰', '۱۳:۳۰')).toBe('2026-10-22T10:00:00.000Z');
    expect(jalaliDateTimeToIso('۱۴۰۵/۰۷/۳۰', '۲۴:۰۰')).toBeNull();
    expect(jalaliDateTimeToIso('نامعتبر', '۱۰:۰۰')).toBeNull();
  });

  it('تاریخ ISO را به ورودی تاریخ و ساعت شمسی برمی‌گرداند', () => {
    expect(isoToJalaliDateInput('2026-10-22T10:00:00.000Z')).toBe('1405/07/30');
    expect(isoToTimeInput('2026-10-22T10:00:00.000Z')).toBe('13:30');
    expect(isoToJalaliDateInput(null)).toBe('');
  });
});
