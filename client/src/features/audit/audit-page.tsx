import { useEffect, useState } from 'react';
import { Eye, Filter, RotateCcw, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useApiQuery } from '@/lib/use-api';
import {
  formatJalaliDateTime,
  jalaliEndOfDayIso,
  jalaliStartOfDayIso,
  parseJalali,
} from '@/lib/jalali';
import type { AuditActionSummary, AuditLog, Page } from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { JalaliDateInput } from '@/components/ui/jalali-date-input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';

const PAGE_SIZE = 15;

function badgeVariant(action: string): 'success' | 'danger' | 'warning' | 'brand' | 'default' {
  if (action.includes('failed') || action.includes('rejected') || action.includes('locked')) return 'danger';
  if (action.includes('created') || action.includes('login') || action.includes('completed')) return 'success';
  if (action.includes('deleted') || action.includes('revoked')) return 'warning';
  if (action.includes('updated') || action.includes('changed') || action.includes('reset')) return 'brand';
  return 'default';
}

export function AuditPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [action, setAction] = useState('');
  const [fromDraft, setFromDraft] = useState('');
  const [toDraft, setToDraft] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditLog | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, action, from, to]);

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (searchTerm) params.set('search', searchTerm);
  if (action) params.set('action', action);
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const logsQuery = useApiQuery<Page<AuditLog>>(
    () => api.get<Page<AuditLog>>(`/api/audit-logs?${params.toString()}`),
    [page, searchTerm, action, from, to],
  );
  const actionsQuery = useApiQuery<AuditActionSummary[]>(
    () => api.get<AuditActionSummary[]>('/api/audit-logs/actions'),
    [],
  );

  function applyDates() {
    if (fromDraft.trim() && !parseJalali(fromDraft)) {
      toast.error('تاریخ «از» معتبر نیست. نمونه درست: ۱۴۰۵/۰۷/۳۰');
      return;
    }
    if (toDraft.trim() && !parseJalali(toDraft)) {
      toast.error('تاریخ «تا» معتبر نیست. نمونه درست: ۱۴۰۵/۰۷/۳۰');
      return;
    }
    const fromIso = fromDraft.trim() ? jalaliStartOfDayIso(fromDraft) : '';
    const toIso = toDraft.trim() ? jalaliEndOfDayIso(toDraft) : '';
    if (fromIso && toIso && fromIso >= toIso) {
      toast.error('تاریخ شروع باید قبل از تاریخ پایان باشد.');
      return;
    }
    setFrom(fromIso ?? '');
    setTo(toIso ?? '');
  }

  function resetFilters() {
    setSearch('');
    setAction('');
    setFromDraft('');
    setToDraft('');
    setFrom('');
    setTo('');
  }

  const logs = logsQuery.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="تاریخچه تغییرات"
        description="تمام ورودها، تغییرات کاربران و تنظیمات به‌صورت دائمی ثبت می‌شود."
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="جستجو در کاربر، شرح یا نوع رویداد..."
              className="ps-9"
              aria-label="جستجوی تاریخچه"
            />
          </div>
          <div className="w-48">
            <Select
              value={action}
              onChange={(event) => setAction(event.target.value)}
              aria-label="فیلتر نوع رویداد"
            >
              <option value="">همه رویدادها</option>
              {(actionsQuery.data ?? []).map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <JalaliDateInput
              value={fromDraft}
              onChange={setFromDraft}
              placeholder="از تاریخ"
              ariaLabel="از تاریخ شمسی"
            />
          </div>
          <div className="w-40">
            <JalaliDateInput
              value={toDraft}
              onChange={setToDraft}
              placeholder="تا تاریخ"
              ariaLabel="تا تاریخ شمسی"
            />
          </div>
          <Button variant="outline" onClick={applyDates}>
            <Filter className="size-4" />
            اعمال
          </Button>
          <Button variant="ghost" onClick={resetFilters}>
            <RotateCcw className="size-4" />
            پاک کردن
          </Button>
        </div>
      </Card>

      <Card>
        {logsQuery.loading && !logsQuery.data ? <Spinner label="در حال دریافت تاریخچه..." /> : null}

        {logsQuery.error ? (
          <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {logsQuery.error}
          </div>
        ) : null}

        {logsQuery.data && logs.length === 0 ? (
          <EmptyState
            title="رویدادی یافت نشد"
            description="با فیلترهای انتخاب‌شده رویدادی وجود ندارد. بازه زمانی یا نوع رویداد را تغییر دهید."
          />
        ) : null}

        {logs.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>زمان</TableHead>
                <TableHead>کاربر</TableHead>
                <TableHead>رویداد</TableHead>
                <TableHead>شرح</TableHead>
                <TableHead>IP</TableHead>
                <TableHead className="text-end">جزئیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-xs text-ink-500">
                    {formatJalaliDateTime(log.createdAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className="text-sm">{log.username ?? 'سیستم'}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={badgeVariant(log.action)}>{log.actionLabel}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[360px] text-xs leading-6 text-ink-500">
                    <span className="line-clamp-2">{log.description ?? '—'}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-ink-400" dir="ltr">
                    {log.ip ?? '—'}
                  </TableCell>
                  <TableCell className="text-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelected(log)}
                      aria-label="مشاهده جزئیات رویداد"
                      title="مشاهده جزئیات"
                    >
                      <Eye className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}

        {logsQuery.data ? (
          <Pagination
            page={logsQuery.data.page}
            pageSize={logsQuery.data.pageSize}
            total={logsQuery.data.total}
            totalPages={logsQuery.data.totalPages}
            onPageChange={setPage}
          />
        ) : null}
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => (open ? undefined : setSelected(null))}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{selected?.actionLabel}</DialogTitle>
            <DialogDescription>{selected?.description}</DialogDescription>
          </DialogHeader>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink-400">زمان</dt>
              <dd className="mt-1 text-ink-700">{formatJalaliDateTime(selected?.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-400">کاربر</dt>
              <dd className="mt-1 text-ink-700">{selected?.username ?? 'سیستم'}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-400">شناسه رویداد</dt>
              <dd className="mt-1 text-ink-700" dir="ltr">
                {selected?.action}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-400">نشانی IP</dt>
              <dd className="mt-1 text-ink-700" dir="ltr">
                {selected?.ip ?? '—'}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-ink-400">مرورگر / دستگاه</dt>
              <dd className="mt-1 break-all text-xs leading-6 text-ink-600" dir="ltr">
                {selected?.userAgent ?? '—'}
              </dd>
            </div>
          </dl>
          {selected?.metadata ? (
            <div>
              <p className="mb-2 text-xs text-ink-400">جزئیات فنی</p>
              <pre
                dir="ltr"
                className="max-h-52 overflow-auto rounded-xl bg-ink-900 p-3 text-[11px] leading-5 text-ink-100"
              >
                {JSON.stringify(selected.metadata, null, 2)}
              </pre>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
