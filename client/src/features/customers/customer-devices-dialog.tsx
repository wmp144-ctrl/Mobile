import { Link } from 'react-router-dom';
import { ArrowUpLeft, Smartphone } from 'lucide-react';
import { api } from '@/lib/api';
import { useApiQuery } from '@/lib/use-api';
import { formatJalaliDate } from '@/lib/jalali';
import type { Customer, CustomerDeviceEntry } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface CustomerDevicesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
}

/** سوابق تمام دستگاه‌های یک مشتری؛ از همان پرونده مشتری قابل مشاهده است. */
export function CustomerDevicesDialog({ open, onOpenChange, customer }: CustomerDevicesDialogProps) {
  const query = useApiQuery<CustomerDeviceEntry[]>(
    () =>
      customer
        ? api.get<CustomerDeviceEntry[]>(`/api/customers/${customer.id}/devices`)
        : Promise.resolve([]),
    [customer?.id],
  );

  const devices = query.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>دستگاه‌های {customer?.fullName ?? 'مشتری'}</DialogTitle>
          <p className="text-xs text-ink-400">
            تمام پرونده‌های پذیرش‌شده برای این مشتری، از جدیدترین تا قدیمی‌ترین.
          </p>
        </DialogHeader>

        {query.loading && !query.data ? <Spinner label="در حال دریافت دستگاه‌ها..." /> : null}

        {query.error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {query.error}
          </div>
        ) : null}

        {!query.loading && !query.error && devices.length === 0 ? (
          <EmptyState
            icon={<Smartphone className="size-6" />}
            title="دستگاهی ثبت نشده است"
            description="برای این مشتری هنوز پرونده دستگاهی پذیرش نشده است."
          />
        ) : null}

        {devices.length > 0 ? (
          <div className="overflow-x-auto">
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow>
                  <TableHead>کد پذیرش</TableHead>
                  <TableHead>نوع تجهیز</TableHead>
                  <TableHead>مدل</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>تاریخ پذیرش</TableHead>
                  <TableHead>تاریخ تحویل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell>
                      <Link
                        to={`/devices/${device.id}`}
                        onClick={() => onOpenChange(false)}
                        className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-brand-700 hover:underline"
                        dir="ltr"
                      >
                        {device.intakeCode}
                        <ArrowUpLeft className="size-3" />
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-ink-600">{device.equipmentType}</TableCell>
                    <TableCell className="text-xs text-ink-600" dir="ltr">
                      {device.model || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="default">{device.status.label}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-ink-500">
                      {formatJalaliDate(device.receivedAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-ink-500">
                      {device.deliveredAt ? formatJalaliDate(device.deliveredAt) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-[11px] text-ink-400">
              برای مشاهده پرونده کامل، روی کد پذیرش کلیک کنید.
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
