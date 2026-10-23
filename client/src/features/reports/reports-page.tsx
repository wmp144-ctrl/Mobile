import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  ArrowDown,
  ArrowUp,
  ChartNoAxesCombined,
  Download,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Layers,
  Pencil,
  Play,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Table2,
  Trash2,
} from 'lucide-react';
import { api, downloadPostFile } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useApiQuery } from '@/lib/use-api';
import { usePermissions } from '@/lib/use-permissions';
import { formatJalaliDate, formatJalaliDateTime } from '@/lib/jalali';
import { formatNumber } from '@/lib/format';
import type {
  AnalyticsOptions,
  ReportChartConfig,
  ReportConfig,
  ReportRunResult,
  ReportTableColumn,
  SavedReport,
} from '@/lib/types';
import type { ChartInstance } from '@/lib/echarts';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EChart } from '@/components/charts/echart';
import { buildChartOption } from './chart-options';
import { FiltersPanel } from './filters-panel';
import {
  buildFilterSummary,
  CHART_TYPE_OPTIONS,
  createChartConfig,
  DEFAULT_TABLE_COLUMNS,
  DIMENSION_OPTIONS,
  EMPTY_FILTER_FORM,
  filterFormError,
  filterFormToApi,
  filterToForm,
  METRIC_OPTIONS,
  TABLE_COLUMN_OPTIONS,
  type ReportFilterForm,
} from './reporting';
import {
  downloadChartPng,
  exportElementPagesToPdf,
  printReport as openPrintWindow,
  ReportPdfDocument,
} from './report-export';

type Tab = 'builder' | 'saved';

function fileStamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

export function ReportsPage() {
  const toast = useToast();
  const { can } = usePermissions();
  const canManage = can('reports.manage');
  const [tab, setTab] = useState<Tab>('builder');
  const [form, setForm] = useState<ReportFilterForm>(EMPTY_FILTER_FORM);
  const [charts, setCharts] = useState<ReportChartConfig[]>([
    createChartConfig({ dimension: 'equipmentType', chartType: 'doughnut' }),
    createChartConfig({ dimension: 'month', chartType: 'line' }),
  ]);
  const [tableColumns, setTableColumns] = useState<ReportTableColumn[]>(DEFAULT_TABLE_COLUMNS);
  const [reportName, setReportName] = useState('');
  const [description, setDescription] = useState('');
  const [isShared, setIsShared] = useState(true);
  const [result, setResult] = useState<ReportRunResult | null>(null);
  const [resultConfig, setResultConfig] = useState<ReportConfig | null>(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [activeVersion, setActiveVersion] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedReport | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [chartImages, setChartImages] = useState<Record<string, string>>({});
  const pdfRef = useRef<HTMLDivElement | null>(null);
  const chartInstances = useRef<Record<string, ChartInstance>>({});

  const optionsQuery = useApiQuery<AnalyticsOptions>(
    () => api.get<AnalyticsOptions>('/api/reports/options'),
    [],
  );
  const savedQuery = useApiQuery<SavedReport[]>(
    () => api.get<SavedReport[]>('/api/reports/saved'),
    [],
  );

  const formError = filterFormError(form);
  const resultFilterForm = useMemo(
    () => (resultConfig ? filterToForm(resultConfig) : form),
    [resultConfig, form],
  );
  const resultSummary = useMemo(
    () => buildFilterSummary(resultFilterForm, optionsQuery.data),
    [resultFilterForm, optionsQuery.data],
  );

  useEffect(() => {
    if (!result) {
      setChartImages({});
      return;
    }
    const timer = window.setTimeout(() => {
      const images: Record<string, string> = {};
      for (const chart of result.charts) {
        const instance = chartInstances.current[chart.id];
        if (instance) {
          images[chart.id] = instance.getDataURL({
            type: 'png',
            pixelRatio: 2,
            backgroundColor: '#ffffff',
          });
        }
      }
      setChartImages(images);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [result]);

  function updateForm(field: keyof ReportFilterForm, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  function buildConfig(): ReportConfig {
    return {
      ...filterFormToApi(form),
      charts: charts.map((chart) => ({
        ...chart,
        title: chart.title?.trim() || undefined,
      })),
      tableColumns,
      tableLimit: 1000,
    };
  }

  async function runReport() {
    if (formError) {
      toast.error(formError);
      return;
    }
    if (charts.length === 0) {
      toast.error('حداقل یک نمودار برای گزارش انتخاب کنید.');
      return;
    }
    const config = buildConfig();
    setRunning(true);
    try {
      const data = await api.post<ReportRunResult>('/api/reports/run', config);
      setResult(data);
      setResultConfig(config);
      toast.success('گزارش با موفقیت محاسبه شد.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRunning(false);
    }
  }

  async function saveReport() {
    if (!canManage) return;
    if (reportName.trim().length < 2) {
      toast.error('نام گزارش را وارد کنید (حداقل ۲ نویسه).');
      return;
    }
    if (formError) {
      toast.error(formError);
      return;
    }
    if (charts.length === 0) {
      toast.error('حداقل یک نمودار برای گزارش انتخاب کنید.');
      return;
    }
    const config = buildConfig();
    setSaving(true);
    try {
      if (activeSavedId && activeVersion) {
        const saved = await api.patch<SavedReport>(`/api/reports/saved/${activeSavedId}`, {
          name: reportName.trim(),
          description: description.trim(),
          isShared,
          config,
          version: activeVersion,
        });
        setActiveVersion(saved.version);
        setReportName(saved.name);
        toast.success('قالب گزارش به‌روزرسانی شد.');
      } else {
        const saved = await api.post<SavedReport>('/api/reports/saved', {
          name: reportName.trim(),
          description: description.trim(),
          isShared,
          config,
        });
        setActiveSavedId(saved.id);
        setActiveVersion(saved.version);
        toast.success('قالب گزارش ذخیره شد.');
      }
      await savedQuery.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function loadSaved(saved: SavedReport) {
    setForm(filterToForm(saved.config));
    setCharts(saved.config.charts.length > 0 ? saved.config.charts : [createChartConfig()]);
    setTableColumns(
      saved.config.tableColumns && saved.config.tableColumns.length > 0
        ? saved.config.tableColumns
        : DEFAULT_TABLE_COLUMNS,
    );
    setReportName(saved.name);
    setDescription(saved.description ?? '');
    setIsShared(saved.isShared);
    setActiveSavedId(saved.id);
    setActiveVersion(saved.version);
    setTab('builder');
  }

  async function runSavedReport(saved: SavedReport) {
    setRunning(true);
    try {
      const data = await api.post<ReportRunResult>(`/api/reports/saved/${saved.id}/run`);
      setResult(data);
      setResultConfig(saved.config);
      loadSaved(saved);
      setTab('builder');
      toast.success(`گزارش «${saved.name}» اجرا شد.`);
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRunning(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/reports/saved/${deleteTarget.id}`);
      if (activeSavedId === deleteTarget.id) {
        setActiveSavedId(null);
        setActiveVersion(null);
      }
      toast.success('قالب گزارش حذف شد.');
      setDeleteTarget(null);
      await savedQuery.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  function collectImages(): Record<string, string> {
    const images: Record<string, string> = {};
    for (const chart of result?.charts ?? []) {
      const instance = chartInstances.current[chart.id];
      if (instance) {
        images[chart.id] = instance.getDataURL({
          type: 'png',
          pixelRatio: 2,
          backgroundColor: '#ffffff',
        });
      }
    }
    return images;
  }

  async function ensurePdfImages(): Promise<void> {
    const images = { ...chartImages, ...collectImages() };
    flushSync(() => setChartImages(images));
  }

  async function exportPdf() {
    if (!result) return;
    setExporting('pdf');
    try {
      await ensurePdfImages();
      await new Promise((resolve) => window.setTimeout(resolve, 40));
      if (!pdfRef.current) throw new Error('سند PDF آماده نشد.');
      await exportElementPagesToPdf(
        pdfRef.current,
        `${reportName.trim() || 'گزارش-تحلیلی'}-${fileStamp()}.pdf`,
      );
      toast.success('فایل PDF گزارش تولید شد.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setExporting(null);
    }
  }

  async function printCurrentReport() {
    if (!result) return;
    setExporting('print');
    try {
      await ensurePdfImages();
      await new Promise((resolve) => window.setTimeout(resolve, 40));
      if (!pdfRef.current) throw new Error('سند چاپ آماده نشد.');
      openPrintWindow(pdfRef.current);
      toast.info('پنجره چاپ گزارش باز شد.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setExporting(null);
    }
  }

  async function exportServer(format: 'excel' | 'csv', config = resultConfig) {
    if (!config) {
      toast.error('ابتدا گزارش را اجرا کنید.');
      return;
    }
    setExporting(format);
    try {
      await downloadPostFile(
        `/api/reports/export/${format}`,
        `${reportName.trim() || 'گزارش-تحلیلی'}-${fileStamp()}.${format === 'excel' ? 'xlsx' : 'csv'}`,
        config,
      );
      toast.success(`خروجی ${format === 'excel' ? 'Excel' : 'CSV'} آماده شد.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setExporting(null);
    }
  }

  function exportChartPng(chartId: string) {
    const chart = result?.charts.find((item) => item.id === chartId);
    const instance = chartInstances.current[chartId];
    if (!chart || !instance) {
      toast.error('نمودار هنوز آماده نیست. کمی بعد دوباره تلاش کنید.');
      return;
    }
    downloadChartPng(instance, `${chart.title}-${fileStamp()}.png`);
    toast.success('تصویر نمودار ذخیره شد.');
  }

  function updateChart(id: string, patch: Partial<ReportChartConfig>) {
    setCharts((previous) =>
      previous.map((chart) => (chart.id === id ? { ...chart, ...patch } : chart)),
    );
  }

  function moveChart(index: number, direction: -1 | 1) {
    setCharts((previous) => {
      const next = [...previous];
      const target = index + direction;
      if (target < 0 || target >= next.length) return previous;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function toggleColumn(column: ReportTableColumn) {
    setTableColumns((previous) =>
      previous.includes(column)
        ? previous.filter((item) => item !== column)
        : [...previous, column],
    );
  }

  return (
    <div>
      <PageHeader
        title="گزارش‌گیری پیشرفته"
        description="گزارش چندنموداری بسازید، فیلترها و ستون‌ها را انتخاب کنید و خروجی PDF، Excel و CSV بگیرید."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant={tab === 'builder' ? 'primary' : 'outline'}
              onClick={() => setTab('builder')}
            >
              <ChartNoAxesCombined className="size-4" />
              ساخت گزارش
            </Button>
            <Button
              variant={tab === 'saved' ? 'primary' : 'outline'}
              onClick={() => setTab('saved')}
            >
              <Layers className="size-4" />
              گزارش‌های ذخیره‌شده
              {savedQuery.data?.length ? ` (${formatNumber(savedQuery.data.length)})` : ''}
            </Button>
          </div>
        }
      />

      {tab === 'builder' ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>مشخصات و فیلترهای گزارش</CardTitle>
                <p className="mt-1 text-xs text-ink-400">
                  بازه زمانی و فیلترهای ترکیبی روی همه نمودارها و جدول اعمال می‌شوند.
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="xl:col-span-2">
                  <Label htmlFor="report-name">نام گزارش</Label>
                  <Input
                    id="report-name"
                    value={reportName}
                    onChange={(event) => setReportName(event.target.value)}
                    placeholder="مثلاً عملکرد تعمیرات مهر ۱۴۰۵"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="report-desc">توضیح</Label>
                  <Input
                    id="report-desc"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="توضیح اختیاری"
                    className="mt-1.5"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-600">
                    <input
                      type="checkbox"
                      checked={isShared}
                      onChange={(event) => setIsShared(event.target.checked)}
                      className="size-4 accent-brand-600"
                    />
                    اشتراک‌گذاری قالب با سایر کاربران
                  </label>
                </div>
              </div>
              <FiltersPanel
                form={form}
                onChange={updateForm}
                onClear={() => setForm(EMPTY_FILTER_FORM)}
                options={optionsQuery.data}
                error={formError}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>نمودارهای گزارش</CardTitle>
                <p className="mt-1 text-xs text-ink-400">
                  تا ۸ نمودار انتخاب کنید؛ ترتیب نمایش در صفحه، PDF و چاپ یکسان است.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCharts((previous) => [...previous, createChartConfig()])}
                disabled={charts.length >= 8}
              >
                <Plus className="size-4" />
                افزودن نمودار
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {charts.map((chart, index) => (
                <div
                  key={chart.id}
                  className="rounded-xl border border-ink-200 bg-ink-50/40 p-3"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-xs font-semibold text-ink-600">
                      <span className="flex size-6 items-center justify-center rounded-full bg-brand-600 text-[10px] text-white">
                        {formatNumber(index + 1)}
                      </span>
                      نمودار {formatNumber(index + 1)}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label="انتقال به بالا"
                        onClick={() => moveChart(index, -1)}
                        disabled={index === 0}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label="انتقال به پایین"
                        onClick={() => moveChart(index, 1)}
                        disabled={index === charts.length - 1}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-rose-600"
                        aria-label="حذف نمودار"
                        onClick={() =>
                          setCharts((previous) =>
                            previous.filter((item) => item.id !== chart.id),
                          )
                        }
                        disabled={charts.length === 1}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="sm:col-span-2 xl:col-span-1">
                      <Label htmlFor={`chart-title-${chart.id}`} className="mb-1.5 block text-[11px]">
                        عنوان نمودار
                      </Label>
                      <Input
                        id={`chart-title-${chart.id}`}
                        value={chart.title ?? ''}
                        onChange={(event) =>
                          updateChart(chart.id, { title: event.target.value })
                        }
                        placeholder="عنوان خودکار"
                        className="h-10 text-xs"
                      />
                    </div>
                    <div>
                      <Label
                        htmlFor={`chart-dimension-${chart.id}`}
                        className="mb-1.5 block text-[11px]"
                      >
                        گروه‌بندی بر اساس
                      </Label>
                      <Select
                        id={`chart-dimension-${chart.id}`}
                        value={chart.dimension}
                        onChange={(event) =>
                          updateChart(chart.id, {
                            dimension: event.target.value as ReportChartConfig['dimension'],
                          })
                        }
                        className="h-10 text-xs"
                      >
                        {DIMENSION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label
                        htmlFor={`chart-metric-${chart.id}`}
                        className="mb-1.5 block text-[11px]"
                      >
                        شاخص
                      </Label>
                      <Select
                        id={`chart-metric-${chart.id}`}
                        value={chart.metric}
                        onChange={(event) =>
                          updateChart(chart.id, {
                            metric: event.target.value as ReportChartConfig['metric'],
                          })
                        }
                        className="h-10 text-xs"
                      >
                        {METRIC_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label
                        htmlFor={`chart-type-${chart.id}`}
                        className="mb-1.5 block text-[11px]"
                      >
                        نوع نمودار
                      </Label>
                      <Select
                        id={`chart-type-${chart.id}`}
                        value={chart.chartType}
                        onChange={(event) =>
                          updateChart(chart.id, {
                            chartType: event.target.value as ReportChartConfig['chartType'],
                          })
                        }
                        className="h-10 text-xs"
                      >
                        {CHART_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>ستون‌های جدول داده‌ها</CardTitle>
                <p className="mt-1 text-xs text-ink-400">
                  جدول زیر نمودارها و برگه داده‌های Excel/CSV از این ستون‌ها ساخته می‌شود.
                </p>
              </div>
              <Badge variant="brand">
                <Table2 className="size-3.5" />
                {formatNumber(tableColumns.length)} ستون
              </Badge>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 pt-4 sm:grid-cols-3 xl:grid-cols-4">
              {TABLE_COLUMN_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-ink-200 bg-white px-2.5 py-2 text-xs text-ink-600 transition hover:border-brand-300"
                >
                  <input
                    type="checkbox"
                    checked={tableColumns.includes(option.value)}
                    onChange={() => toggleColumn(option.value)}
                    className="size-4 accent-brand-600"
                  />
                  {option.label}
                </label>
              ))}
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-ink-200 bg-white p-3 shadow-sm">
            <Button onClick={() => void runReport()} loading={running}>
              <Play className="size-4" />
              اجرای گزارش
            </Button>
            {canManage ? (
              <Button variant="outline" onClick={() => void saveReport()} loading={saving}>
                <Save className="size-4" />
                {activeSavedId ? 'به‌روزرسانی قالب' : 'ذخیره قالب گزارش'}
              </Button>
            ) : null}
            <div className="mx-1 hidden h-6 w-px bg-ink-200 sm:block" />
            <Button
              variant="outline"
              onClick={() => void exportPdf()}
              loading={exporting === 'pdf'}
              disabled={!result}
            >
              <FileText className="size-4" />
              PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => void printCurrentReport()}
              loading={exporting === 'print'}
              disabled={!result}
            >
              <Printer className="size-4" />
              چاپ
            </Button>
            <Button
              variant="outline"
              onClick={() => void exportServer('excel')}
              loading={exporting === 'excel'}
              disabled={!resultConfig}
            >
              <FileSpreadsheet className="size-4" />
              Excel
            </Button>
            <Button
              variant="outline"
              onClick={() => void exportServer('csv')}
              loading={exporting === 'csv'}
              disabled={!resultConfig}
            >
              <Download className="size-4" />
              CSV
            </Button>
            {activeSavedId ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setActiveSavedId(null);
                  setActiveVersion(null);
                  toast.info('حالت ویرایش قالب برداشته شد؛ ذخیره بعدی یک قالب جدید می‌سازد.');
                }}
              >
                گزارش جدید
              </Button>
            ) : null}
          </div>

          {running && !result ? <Spinner label="در حال محاسبه گزارش..." /> : null}

          {!result ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon={<ChartNoAxesCombined className="size-6" />}
                  title="هنوز گزارشی اجرا نشده است"
                  description="نمودارها و ستون‌های موردنظر را انتخاب کنید و دکمه «اجرای گزارش» را بزنید."
                  action={
                    <Button onClick={() => void runReport()} loading={running}>
                      <Play className="size-4" />
                      اجرای گزارش
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-ink-900">نتیجه گزارش</h2>
                  <p className="mt-1 text-xs text-ink-400">
                    تولیدشده در {formatJalaliDateTime(result.generatedAt)} —{' '}
                    {formatNumber(result.table.rows.length)} ردیف داده
                  </p>
                </div>
                <Badge variant="success">
                  {formatNumber(result.charts.length)} نمودار
                </Badge>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {result.charts.map((chart) => (
                  <Card key={chart.id}>
                    <CardHeader className="flex-wrap items-start gap-3">
                      <div>
                        <CardTitle>{chart.title}</CardTitle>
                        <p className="mt-1 text-xs text-ink-400">
                          مجموع: {formatNumber(chart.total)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => exportChartPng(chart.id)}
                        title="ذخیره تصویر PNG"
                      >
                        <ImageIcon className="size-4" />
                        PNG
                      </Button>
                    </CardHeader>
                    <CardContent className="pt-2">
                      <EChart
                        option={buildChartOption(chart)}
                        height={320}
                        ariaLabel={chart.title}
                        onReady={(instance) => {
                          chartInstances.current[chart.id] = instance;
                        }}
                        onDispose={() => {
                          delete chartInstances.current[chart.id];
                        }}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>جدول داده‌های گزارش</CardTitle>
                    <p className="mt-1 text-xs text-ink-400">
                      {formatNumber(result.table.rows.length)} ردیف نمایش داده شده است.
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="p-0 pt-4">
                  {result.table.columns.length === 0 ? (
                    <EmptyState
                      title="ستونی برای جدول انتخاب نشده است"
                      description="از بخش ستون‌های جدول، داده‌های موردنیاز را انتخاب و گزارش را دوباره اجرا کنید."
                    />
                  ) : (
                    <div className="max-h-[560px] overflow-auto">
                      {result.table.columns.length > 0 ? (
                        <Table className="min-w-[760px]">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-10">#</TableHead>
                              {result.table.columns.map((column) => (
                                <TableHead key={column.key}>{column.label}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {result.table.rows.map((row, index) => (
                              <TableRow key={index}>
                                <TableCell className="text-center text-xs text-ink-400">
                                  {formatNumber(index + 1)}
                                </TableCell>
                                {result.table.columns.map((column) => {
                                  const value = row[column.key];
                                  return (
                                    <TableCell
                                      key={column.key}
                                      className="whitespace-nowrap text-xs text-ink-600"
                                    >
                                      {column.type === 'date' && typeof value === 'string'
                                        ? formatJalaliDate(value)
                                        : column.type === 'number' && typeof value === 'number'
                                          ? formatNumber(value)
                                          : (value ?? '—')}
                                    </TableCell>
                                  );
                                })}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ink-500">
              قالب‌های ذخیره‌شده مشترک و قالب‌های شخصی شما؛ با «اجرای مجدد» همان گزارش با داده‌های
              فعلی ساخته می‌شود.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void savedQuery.reload()}
              loading={savedQuery.loading}
            >
              <RefreshCw className="size-4" />
              به‌روزرسانی
            </Button>
          </div>

          {savedQuery.loading && !savedQuery.data ? (
            <Spinner label="در حال دریافت قالب‌های گزارش..." />
          ) : null}

          {savedQuery.error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {savedQuery.error}
            </div>
          ) : null}

          {savedQuery.data && savedQuery.data.length === 0 ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon={<Layers className="size-6" />}
                  title="قالبی ذخیره نشده است"
                  description="در بخش «ساخت گزارش»، فیلترها و نمودارها را آماده کنید و قالب را ذخیره کنید."
                  action={
                    <Button variant="outline" onClick={() => setTab('builder')}>
                      <Plus className="size-4" />
                      ساخت اولین قالب
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {savedQuery.data?.map((saved) => (
              <Card key={saved.id} className="flex flex-col">
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle className="truncate">{saved.name}</CardTitle>
                    {saved.description ? (
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-500">
                        {saved.description}
                      </p>
                    ) : null}
                  </div>
                  <Badge variant={saved.isShared ? 'brand' : 'default'}>
                    {saved.isShared ? 'مشترک' : 'شخصی'}
                  </Badge>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3 pt-3">
                  <div className="flex flex-wrap gap-1.5 text-[11px] text-ink-500">
                    <Badge variant="default">
                      {formatNumber(saved.config.charts.length)} نمودار
                    </Badge>
                    <Badge variant="default">{saved.ownerName ?? 'سیستم'}</Badge>
                    <span className="py-1">{formatJalaliDateTime(saved.updatedAt)}</span>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => void runSavedReport(saved)} loading={running}>
                      <Play className="size-3.5" />
                      اجرای مجدد
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => loadSaved(saved)}>
                      <Pencil className="size-3.5" />
                      ویرایش
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void exportServer('excel', saved.config)}
                      loading={exporting === 'excel'}
                    >
                      <FileSpreadsheet className="size-3.5" />
                      Excel
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void exportServer('csv', saved.config)}
                      loading={exporting === 'csv'}
                    >
                      <Download className="size-3.5" />
                      CSV
                    </Button>
                    {saved.canManage ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-600"
                        onClick={() => setDeleteTarget(saved)}
                      >
                        <Trash2 className="size-3.5" />
                        حذف
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {result ? (
        <ReportPdfDocument
          ref={pdfRef}
          report={result}
          title={reportName.trim() || 'گزارش تحلیلی تعمیرگاه'}
          filterSummary={resultSummary}
          chartImages={chartImages}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
        title="حذف قالب گزارش"
        description={`آیا از حذف «${deleteTarget?.name ?? ''}» مطمئن هستید؟ این عملیات قابل بازگشت نیست.`}
        confirmLabel="حذف قالب"
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
