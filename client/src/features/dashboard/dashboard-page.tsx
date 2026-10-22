import { Activity, Database, KeyRound, RefreshCw, Users, UsersRound } from 'lucide-react';
import { api } from '@/lib/api';
import { useApiQuery } from '@/lib/use-api';
import { formatJalaliDateTime, formatJalaliLong, formatDuration } from '@/lib/jalali';
import { formatBytes, formatNumber } from '@/lib/format';
import type { DashboardOverview } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';

const STAT_ITEMS = [
  { key: 'usersTotal', label: 'کل کاربران', icon: Users, tone: 'bg-brand-50 text-brand-600' },
  { key: 'usersActive', label: 'کاربران فعال', icon: UsersRound, tone: 'bg-emerald-50 text-emerald-600' },
  { key: 'sessionsActive', label: 'نشست‌های باز', icon: KeyRound, tone: 'bg-amber-50 text-amber-600' },
  { key: 'auditToday', label: 'رویدادهای امروز', icon: Activity, tone: 'bg-violet-50 text-violet-600' },
] as const;

export function DashboardPage() {
  const { data, loading, error, reload } = useApiQuery<DashboardOverview>(
    () => api.get<DashboardOverview>('/api/dashboard/overview'),
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-ink-500">
            {data?.currentUser ? `${data.currentUser.fullName} عزیز، خوش آمدید` : 'خوش آمدید'}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-ink-900">داشبورد مدیریت</h1>
          <p className="mt-1 text-xs text-ink-400">{formatJalaliLong(new Date())}</p>
        </div>
        <Button variant="outline" onClick={() => void reload()} loading={loading}>
          <RefreshCw className="size-4" />
          به‌روزرسانی
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {loading && !data ? <Spinner label="در حال دریافت اطلاعات داشبورد..." /> : null}

      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {STAT_ITEMS.map((item) => (
              <Card key={item.key} className="transition hover:shadow-md">
                <CardContent className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-ink-500">{item.label}</p>
                    <p className="mt-2 text-2xl font-bold text-ink-900">
                      {formatNumber(data.stats[item.key])}
                    </p>
                  </div>
                  <span className={`flex size-11 items-center justify-center rounded-xl ${item.tone}`}>
                    <item.icon className="size-5" />
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <div>
                  <CardTitle>آخرین رویدادهای سامانه</CardTitle>
                  <p className="mt-1 text-xs text-ink-400">۸ رویداد اخیر ثبت‌شده در تاریخچه</p>
                </div>
              </CardHeader>
              <CardContent className="p-0 pt-4">
                {data.recentActivity.length === 0 ? (
                  <EmptyState title="هنوز رویدادی ثبت نشده است" description="پس از انجام عملیات توسط کاربران، رویدادها اینجا نمایش داده می‌شود." />
                ) : (
                  <Table className="min-w-[560px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>زمان</TableHead>
                        <TableHead>کاربر</TableHead>
                        <TableHead>رویداد</TableHead>
                        <TableHead>شرح</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.recentActivity.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="whitespace-nowrap text-xs text-ink-500">
                            {formatJalaliDateTime(log.createdAt)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {log.username ?? 'سیستم'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="brand">{log.actionLabel}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[320px] truncate text-xs text-ink-500">
                            {log.description ?? '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>توزیع کاربران بر اساس نقش</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.roleDistribution.every((item) => item.userCount === 0) ? (
                    <p className="py-4 text-center text-xs text-ink-400">هنوز کاربری ثبت نشده است.</p>
                  ) : (
                    data.roleDistribution.map((item) => {
                      const max = Math.max(...data.roleDistribution.map((entry) => entry.userCount), 1);
                      return (
                        <div key={item.roleKey}>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-ink-600">{item.roleName}</span>
                            <span className="font-medium text-ink-500">
                              {formatNumber(item.userCount)}
                            </span>
                          </div>
                          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100">
                            <div
                              className="h-full rounded-full bg-brand-500/80 transition-all"
                              style={{ width: `${(item.userCount / max) * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>وضعیت سرور</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-500">نسخه سامانه</span>
                    <span className="font-medium text-ink-800">{data.server.version}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-500">مدت فعالیت سرور</span>
                    <span className="font-medium text-ink-800">
                      {formatDuration(data.server.uptimeSeconds)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-ink-500">
                      <Database className="size-3.5" /> حجم پایگاه داده
                    </span>
                    <span className="font-medium text-ink-800">
                      {formatBytes(data.stats.databaseSize)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-500">کارگاه</span>
                    <span className="max-w-[150px] truncate font-medium text-ink-800">
                      {data.server.workshopName || 'تعریف نشده'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
