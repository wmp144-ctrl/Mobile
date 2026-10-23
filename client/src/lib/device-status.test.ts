import { describe, expect, it } from 'vitest';
import { DEVICE_STATUS_OPTIONS, mergeDeviceStatuses } from './device-status';

describe('ترکیب وضعیت‌های دستگاه', () => {
  it('در نبود تنظیمات، وضعیت‌های پیش‌فرض را برمی‌گرداند', () => {
    expect(mergeDeviceStatuses(undefined)).toEqual(DEVICE_STATUS_OPTIONS);
    expect(mergeDeviceStatuses([])).toEqual(DEVICE_STATUS_OPTIONS);
  });

  it('برچسب پایگاه داده را جایگزین می‌کند و وضعیت سفارشی را اضافه می‌کند', () => {
    const merged = mergeDeviceStatuses([
      { key: 'received', label: 'پذیرش شده', tone: 'neutral', isActive: true },
      { key: 'in_progress', label: 'در حال انجام', tone: 'brand', isActive: true },
      { key: 'c_abc123', label: 'در انتظار قطعه خاص', tone: 'warning', isActive: true },
    ]);

    expect(merged[0]).toEqual({ key: 'received', label: 'پذیرش شده', tone: 'neutral' });
    expect(merged.map((item) => item.key)).toContain('c_abc123');
    expect(merged.find((item) => item.key === 'c_abc123')).toEqual({
      key: 'c_abc123',
      label: 'در انتظار قطعه خاص',
      tone: 'warning',
    });
  });

  it('وضعیت‌های غیرفعال را حذف می‌کند و رنگ نامعتبر را به info تبدیل می‌کند', () => {
    const merged = mergeDeviceStatuses([
      { key: 'received', label: 'دریافت شده', tone: 'neutral', isActive: true },
      { key: 'delivered', label: 'تحویل داده شده', tone: 'success', isActive: false },
      { key: 'c_def456', label: 'وضعیت جدید', tone: 'rainbow', isActive: true },
    ]);

    expect(merged.map((item) => item.key)).not.toContain('delivered');
    expect(merged.find((item) => item.key === 'c_def456')?.tone).toBe('info');
    expect(merged.map((item) => item.key)).not.toContain('in_progress');
  });
});
