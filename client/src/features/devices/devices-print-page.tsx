import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Printer, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { formatJalaliDate } from '@/lib/jalali';
import type { DeviceSummary, Page } from '@/lib/types';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';

export function DevicesPrintPage() {
  const [params] = useSearchParams();
  const workshopName = useAuth((state) => state.workshopName);
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams(params);
    query.set('page', '1');
    query.set('pageSize', '100');
    setLoading(true);
    api
      .get<Page<DeviceSummary>>(`/api/devices?${query.toString()}`)
      .then((result) => {
        if (!active) return;
        setDevices(result.items);
        setTotal(result.total);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'خطا در دریافت فهرست');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [params]);

  if (loading) return <Spinner label="در حال آماده‌سازی نسخه چاپی..." />;
  if (error) return <div className="p-8 text-sm text-rose-700">{error}</div>;

  return (
    <div dir="rtl" className="mx-auto max-w-[1100px] bg-surface p-6 text-ink-900 print:max-w-none print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link to="/devices">
          <Button variant="outline">
            <ArrowRight className="size-4" />
            بازگشت به فهرست تجهیزات
          </Button>
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="size-4" />
          چاپ
        </Button>
      </div>

      <header className="mb-4 flex items-end justify-between border-b-2 border-ink-900 pb-3">
        <div>
          <h1 className="text-lg font-bold">{workshopName || 'تعمیرگاه تخصصی موبایل و تجهیزات الکترونیکی'}</h1>
          <p className="mt-1 text-xs text-ink-500">فهرست تجهیزات و پرونده‌های تعمیر</p>
        </div>
        <p className="text-xs text-ink-500">
          {formatJalaliDate(new Date())} — {total.toLocaleString('fa-IR')} پرونده
        </p>
      </header>

      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-ink-400 text-ink-600">
            <th className="py-2 text-start font-medium">کد پذیرش</th>
            <th className="py-2 text-start font-medium">وضعیت</th>
            <th className="py-2 text-start font-medium">تجهیز</th>
            <th className="py-2 text-start font-medium">مالک</th>
            <th className="py-2 text-start font-medium">تلفن</th>
            <th className="py-2 text-start font-medium">دریافت</th>
            <th className="py-2 text-start font-medium">تحویل پیش‌بینی</th>
            <th className="py-2 text-start font-medium">تکنسین</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((device) => (
            <tr key={device.id} className="border-b border-dashed border-ink-200">
              <td className="py-1.5 font-mono" dir="ltr">
                {device.intakeCode}
              </td>
              <td className="py-1.5">{device.status.label}</td>
              <td className="py-1.5">
                {device.equipmentType.label}
                {device.model ? ` — ${device.model}` : ''}
              </td>
              <td className="py-1.5">{device.owner.fullName}</td>
              <td className="py-1.5" dir="ltr">
                {device.owner.phone ?? '—'}
              </td>
              <td className="py-1.5">{formatJalaliDate(device.receivedAt)}</td>
              <td className="py-1.5">{device.dueAt ? formatJalaliDate(device.dueAt) : '—'}</td>
              <td className="py-1.5">{device.technician?.fullName ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {devices.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-500">پرونده‌ای با فیلترهای جاری پیدا نشد.</p>
      ) : null}

      {total > devices.length ? (
        <p className="mt-3 text-[10px] text-ink-400">
          برای چاپ کامل، فهرست را با فیلترهای دقیق‌تر محدود کنید یا از خروجی اکسل استفاده کنید.
        </p>
      ) : null}
    </div>
  );
}
