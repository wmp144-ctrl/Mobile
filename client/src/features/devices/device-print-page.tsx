import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Printer, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useApiQuery } from '@/lib/use-api';
import { useAuth } from '@/stores/auth';
import { formatJalaliDate, formatJalaliDateTime } from '@/lib/jalali';
import { formatBytes } from '@/lib/format';
import type { DeviceConfigData, DeviceDetail } from '@/lib/types';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-2 border-b border-dashed border-ink-200 py-1.5 text-sm">
      <span className="w-36 shrink-0 text-ink-500">{label}</span>
      <span className="font-medium text-ink-900">{value || '—'}</span>
    </div>
  );
}

export function DevicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const workshopName = useAuth((state) => state.workshopName);
  const [detail, setDetail] = useState<DeviceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detailQuery = useApiQuery<DeviceDetail>(() => api.get<DeviceDetail>(`/api/devices/${id}`), [id]);
  const configQuery = useApiQuery<DeviceConfigData>(
    () => api.get<DeviceConfigData>('/api/device-config'),
    [],
  );

  useEffect(() => {
    if (detailQuery.data) setDetail(detailQuery.data);
    if (detailQuery.error) setError(detailQuery.error);
  }, [detailQuery.data, detailQuery.error]);

  const accessories = useMemo(() => {
    const map = new Map((configQuery.data?.options.accessory ?? []).map((item) => [item.key, item.label]));
    return (detail?.accessories ?? []).map((key) => map.get(key) ?? key);
  }, [configQuery.data, detail]);

  if (error) {
    return <div className="p-8 text-sm text-rose-700">{error}</div>;
  }
  if (!detail) return <Spinner label="در حال آماده‌سازی نسخه چاپی..." />;

  return (
    <div dir="rtl" className="mx-auto max-w-[820px] bg-surface p-6 text-ink-900 print:max-w-none print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link to={`/devices/${detail.id}`}>
          <Button variant="outline">
            <ArrowRight className="size-4" />
            بازگشت به پرونده
          </Button>
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="size-4" />
          چاپ
        </Button>
      </div>

      <header className="flex items-start justify-between gap-6 border-b-2 border-ink-900 pb-3">
        <div>
          <h1 className="text-lg font-bold">{workshopName || 'تعمیرگاه تخصصی موبایل و تجهیزات الکترونیکی'}</h1>
          <p className="mt-1 text-xs text-ink-500">رسید پذیرش دستگاه — نسخه مشتری</p>
        </div>
        <div className="text-end">
          <p className="font-mono text-base font-bold" dir="ltr">
            {detail.intakeCode}
          </p>
          <p className="mt-1 text-xs text-ink-500">{formatJalaliDateTime(detail.receivedAt)}</p>
          <p className="mt-1 text-xs text-ink-500">وضعیت: {detail.status.label}</p>
        </div>
      </header>

      <div className="mt-4 grid gap-x-8 sm:grid-cols-2">
        <section>
          <h2 className="mb-1 text-sm font-bold">مشخصات دستگاه</h2>
          <Row label="نوع تجهیز" value={detail.equipmentType.label} />
          <Row label="سازنده" value={detail.manufacturer?.label} />
          <Row label="مدل" value={detail.model} />
          <Row label="شماره سریال" value={detail.serialNumber} />
          <Row label="IMEI 1" value={detail.imei1} />
          <Row label="IMEI 2" value={detail.imei2} />
          <Row label="لوازم همراه" value={accessories.join('، ')} />
          <Row label="وضعیت قفل" value={detail.lockStatus.label} />
        </section>
        <section>
          <h2 className="mb-1 text-sm font-bold">مالک و آورنده</h2>
          <Row label="نام مالک" value={detail.owner.fullName} />
          <Row label="تلفن مالک" value={detail.owner.phone} />
          <Row label="نام آورنده" value={detail.broughtBy.name} />
          <Row label="تلفن آورنده" value={detail.broughtBy.phone} />
          <Row label="شغل آورنده" value={detail.broughtBy.job} />
          <Row label="تکنسین مسئول" value={detail.technician?.fullName} />
          <Row label="تحویل پیش‌بینی‌شده" value={detail.dueAt ? formatJalaliDateTime(detail.dueAt) : null} />
          <Row label="وضعیت ظاهری" value={detail.physicalCondition} />
        </section>
      </div>

      <section className="mt-3">
        <h2 className="mb-1 text-sm font-bold">مشکل اعلام‌شده توسط مشتری</h2>
        <p className="whitespace-pre-wrap rounded border border-ink-200 p-3 text-sm leading-7">
          {detail.reportedProblem}
        </p>
        {detail.notes ? (
          <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-ink-600">توضیحات: {detail.notes}</p>
        ) : null}
      </section>

      {detail.operations.length > 0 ? (
        <section className="mt-4">
          <h2 className="mb-1 text-sm font-bold">اقدامات ثبت‌شده</h2>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-ink-300 text-ink-500">
                <th className="py-1.5 text-start font-medium">عنوان</th>
                <th className="py-1.5 text-start font-medium">تاریخ</th>
                <th className="py-1.5 text-start font-medium">حجم داده</th>
                <th className="py-1.5 text-start font-medium">نتیجه</th>
              </tr>
            </thead>
            <tbody>
              {detail.operations.map((operation) => (
                <tr key={operation.id} className="border-b border-dashed border-ink-200">
                  <td className="py-1.5">{operation.title}</td>
                  <td className="py-1.5">{formatJalaliDate(operation.performedAt)}</td>
                  <td className="py-1.5">
                    {operation.dataSizeBytes ? formatBytes(operation.dataSizeBytes) : '—'}
                  </td>
                  <td className="py-1.5">{operation.result.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="mt-8 grid grid-cols-2 gap-8 text-xs text-ink-500">
        <div className="border-t border-ink-300 pt-2 text-center">امضای مشتری</div>
        <div className="border-t border-ink-300 pt-2 text-center">امضای پذیرنده</div>
      </section>

      <p className="mt-6 text-[10px] leading-5 text-ink-400">
        این رسید به‌صورت خودکار توسط سامانه مدیریت تعمیرگاه صادر شده است. برای پیگیری وضعیت، کد پذیرش
        خود را در اختیار داشته باشید.
      </p>
    </div>
  );
}
