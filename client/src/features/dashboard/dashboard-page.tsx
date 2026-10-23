import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarPlus,
  CheckCircle2,
  ChartNoAxesCombined,
  PackageCheck,
  RefreshCw,
  SlidersHorizontal,
  Smartphone,
  Truck,
  Users,
  Wrench,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useApiQuery } from '@/lib/use-api';
import { usePermissions } from '@/lib/use-permissions';
import { formatJalaliDateTime, formatJalaliLong } from '@/lib/jalali';
import { formatNumber } from '@/lib/format';
import type {
  AnalyticsDashboard,
  AnalyticsOptions,
  ReportChartResult,
} from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EChart } from '@/components/charts/echart';
import { buildChartOption } from '@/features/reports/chart-options';
import { FiltersPanel } from '@/features/reports/filters-panel';
import {
  EMPTY_FILTER_FORM,
  filterFormError,
  filterFormToApi,
  filterToQuery,
  type ReportFilterForm,
} from '@/features/reports/reporting';

const STAT_CARDS = [
  {
    key: 'totalEquipment',
    label: 'کل تجهیزات دریافتی',
    description: 'همه پرونده‌های ثبت‌شده',
    icon: Smartphone,
    tone: 'bg-brand-50 text-brand-600',
  },
  {
    key: 'receivedToday',
    label: 'دریافتی امروز',
    description: 'پذیرش‌های امروز',
    icon: CalendarPlus,
    tone: 'bg-sky-50 text-sky-600',
  },
  {
    key: 'inProgress',
    label: 'در حال انجام',
    description: 'در جریان کار تعمیرگاه',
    icon: Wrench,
    tone: 'bg-amber-50 text-amber-600',
  },
  {
    key: 'done',
    label: 'انجام‌شده',
    description: 'تعمیر موفق',
    icon: CheckCircle2,
    tone: 'bg-emerald-50 text-emerald-600',
  },
  {
    key: 'failed',
    label: 'ناموفق',
    description: 'ناموفق یا غیرقابل تعمیر',
    icon: XCircle,
    tone: 'bg-rose-50 text-rose-600',
  },
  {
    key: 'ready',
    label: 'آماده تحویل',
    description: 'منتظر تحویل به مشتری',
    icon: PackageCheck,
    tone: 'bg-teal-50 text-teal-600',
  },
  {
    key: 'delivered',
    label: 'تحویل‌داده‌شده',
    description: 'پرونده‌های بسته‌شده',
    icon: Truck,
    tone: 'bg-violet-50 text-violet-600',
  },
  {
    key: 'customers',
    label: 'کل مشتریان',
    description: 'مالکان در نتیجه فیلتر',
    icon: Users,
    tone: 'bg-indigo-50 text-indigo-600',
  },
] as const;

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function ChartCard({
  title,
  subtitle,
  chart,
  height = 300,
  className,
}: {
  title: string;
  subtitle: string;
  chart: ReportChartResult;
  height?: number;
  className?: string;
}) {
  const option = useMemo(() => buildChartOption(chart), [chart]);
  return (
    <Card className={className}>
      <CardHeader className="flex-wrap items-start gap-3">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="mt-1 text-xs text-ink-400">{subtitle}</p>
        </div>
        <Badge variant="brand">
          {formatNumber(chart.total)} {chart.chartType === 'line' ? 'مورد پذیرش' : 'مورد'}
        </Badge>
      </CardHeader>
      <CardContent className="pt-3">
        <EChart option={option} height={height} ariaLabel={title} />
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const { can } = usePermissions();
  const canReports = can('reports.view');
  const [form, setForm] = useState<ReportFilterForm>(EMPTY_FILTER_FORM);
  const formError = filterFormError(form);
  const query = useMemo(() => filterToQuery(filterFormToApi(form)), [form]);
  const debouncedQuery = useDebouncedValue(query, 350);

  const optionsQuery = useApiQuery<AnalyticsOptions>(
    () => api.get<AnalyticsOptions>('/api/analytics/options'),
    [],
  );
  const dashboardQuery = useApiQuery<AnalyticsDashboard>(
    () => api.get<AnalyticsDashboard>(`/api/analytics/dashboard${debouncedQuery}`),
    [debouncedQuery],
  );

  const data = dashboardQuery.data;

  function update(field: keyof ReportFilterForm, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-ink-500">
              {data?.workshop.name ? data.workshop.name : 'سامانه مدیریت تعمیرگاه'}
            </p>
            <Badge variant="brand">داشبورد تحلیلی</Badge>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-ink-900">داشبورد مدیریت</h1>
          <p className="mt-1 text-xs text-ink-400">
            {formatJalaliLong(new Date())}
            {data ? ` — آخرین به‌روزرسانی: ${formatJalaliDateTime(data.generatedAt)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canReports ? (
            <Link to="/reports">
              <Button variant="outline">
                <ChartNoAxesCombined className="size-4" />
                گزارش‌گیری پیشرفته
              </Button>
            </Link>
          ) : null}
          <Button
            variant="outline"
            onClick={() => void dashboardQuery.reload()}
            loading={dashboardQuery.loading}
          >
            <RefreshCw className="size-4" />
            به‌روزرسانی
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <SlidersHorizontal className="size-4" />
            </span>
            <div>
              <CardTitle>فیلترهای داشبورد</CardTitle>
              <p className="mt-0.5 text-xs text-ink-400">
                کارت‌ها و نمودارها با تغییر هر فیلتر به‌صورت خودکار و یکپارچه به‌روزرسانی می‌شوند.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <FiltersPanel
            form={form}
            onChange={update}
            onClear={() => setForm(EMPTY_FILTER_FORM)}
            options={optionsQuery.data}
            error={formError}
          />
        </CardContent>
      </Card>

      {dashboardQuery.error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {dashboardQuery.error}
        </div>
      ) : null}

      {dashboardQuery.loading && !data ? <Spinner label="در حال محاسبه آمار داشبورد..." /> : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {STAT_CARDS.map((item) => (
              <Card key={item.key} className="transition hover:-translate-y-0.5 hover:shadow-md">
                <CardContent className="flex items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-xs text-ink-500">{item.label}</p>
                    <p className="mt-1.5 text-2xl font-bold text-ink-900">
                      {formatNumber(data.stats[item.key])}
                    </p>
                    <p className="mt-0.5 text-[10px] text-ink-400">{item.description}</p>
                  </div>
                  <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${item.tone}`}>
                    <item.icon className="size-5" />
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard
              title="توزیع نوع تجهیزات"
              subtitle="سهم هر نوع تجهیز از کل پرونده‌های فیلترشده"
              chart={data.charts.equipmentTypes}
              height={310}
            />
            <ChartCard
              title="توزیع سازندگان"
              subtitle="سهم هر برند از تجهیزات ثبت‌شده"
              chart={data.charts.manufacturers}
              height={310}
            />
            <ChartCard
              title="روند ماهانه"
              subtitle="تعداد تجهیزات پذیرش‌شده و تحویل‌داده‌شده به تفکیک ماه شمسی"
              chart={data.charts.monthlyTrend}
              height={320}
              className="xl:col-span-2"
            />
            <ChartCard
              title="مقایسه سالانه"
              subtitle="تعداد تجهیزات در سال‌های شمسی مختلف"
              chart={data.charts.yearly}
              height={300}
            />
            <ChartCard
              title="وضعیت تجهیزات"
              subtitle="تعداد دستگاه‌ها در هر وضعیت تعمیر"
              chart={data.charts.statuses}
              height={320}
            />
            <ChartCard
              title="نوع شغل آورنده"
              subtitle="مقایسه تعداد مراجعه‌کنندگان بر اساس شغل"
              chart={data.charts.jobs}
              height={320}
              className="xl:col-span-2"
            />
          </div>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>آخرین پذیرش‌ها</CardTitle>
                <p className="mt-1 text-xs text-ink-400">
                  پنج پرونده اخیر مطابق با فیلترهای فعلی
                </p>
              </div>
              <Link to="/devices" className="text-xs text-brand-700 hover:underline">
                همه تجهیزات
              </Link>
            </CardHeader>
            <CardContent className="p-0 pt-4">
              {data.recentDevices.rows.length === 0 ? (
                <EmptyState
                  title="دستگاهی با این فیلترها پیدا نشد"
                  description="فیلترها را تغییر دهید یا اولین پذیرش را ثبت کنید."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[680px]">
                    <TableHeader>
                      <TableRow>
                        {data.recentDevices.columns.map((column) => (
                          <TableHead key={column.key}>{column.label}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.recentDevices.rows.map((row, index) => (
                        <TableRow key={`${row.intakeCode ?? index}`}>
                          {data.recentDevices.columns.map((column) => {
                            const value = row[column.key];
                            return (
                              <TableCell
                                key={column.key}
                                className="whitespace-nowrap text-xs text-ink-600"
                              >
                                {column.key === 'intakeCode' && typeof value === 'string' ? (
                                  <Link
                                    to={`/devices?search=${encodeURIComponent(value)}`}
                                    className="font-medium text-brand-700 hover:underline"
                                    dir="ltr"
                                  >
                                    {value}
                                  </Link>
                                ) : column.type === 'date' && typeof value === 'string' ? (
                                  formatJalaliDateTime(value)
                                ) : column.type === 'number' && typeof value === 'number' ? (
                                  formatNumber(value)
                                ) : (
                                  (value ?? '—')
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
