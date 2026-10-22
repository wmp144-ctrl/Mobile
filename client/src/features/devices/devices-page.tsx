import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Columns3,
  Download,
  Eye,
  FilterX,
  Pencil,
  Plus,
  Printer,
  Search,
  Smartphone,
} from 'lucide-react';
import { api, downloadFile } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useApiQuery } from '@/lib/use-api';
import { usePermissions } from '@/lib/use-permissions';
import { formatJalaliDateTime, jalaliEndOfDayIso, jalaliStartOfDayIso } from '@/lib/jalali';
import type { DeviceConfigData, DeviceSummary, Page } from '@/lib/types';
import { DEVICE_STATUS_OPTIONS, statusBadgeVariant } from '@/lib/device-status';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { JalaliDateInput } from '@/components/ui/jalali-date-input';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { useToast } from '@/components/ui/toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

type ColumnKey =
  | 'intakeCode'
  | 'status'
  | 'equipment'
  | 'manufacturer'
  | 'model'
  | 'serialNumber'
  | 'imei1'
  | 'owner'
  | 'phone'
  | 'technician'
  | 'receivedAt'
  | 'dueAt'
  | 'problem';

const COLUMNS: Array<{ key: ColumnKey; label: string; sortBy?: string }> = [
  { key: 'intakeCode', label: 'کد پذیرش', sortBy: 'intakeCode' },
  { key: 'status', label: 'وضعیت', sortBy: 'status' },
  { key: 'equipment', label: 'نوع تجهیز', sortBy: 'equipmentType' },
  { key: 'manufacturer', label: 'سازنده', sortBy: 'manufacturer' },
  { key: 'model', label: 'مدل', sortBy: 'model' },
  { key: 'serialNumber', label: 'شماره سریال' },
  { key: 'imei1', label: 'IMEI 1' },
  { key: 'owner', label: 'مالک', sortBy: 'owner' },
  { key: 'phone', label: 'تلفن' },
  { key: 'technician', label: 'تکنسین' },
  { key: 'receivedAt', label: 'زمان دریافت', sortBy: 'receivedAt' },
  { key: 'dueAt', label: 'تحویل پیش‌بینی‌شده', sortBy: 'dueAt' },
  { key: 'problem', label: 'مشکل اعلام‌شده' },
];

const DEFAULT_COLUMNS: ColumnKey[] = [
  'intakeCode',
  'status',
  'equipment',
  'model',
  'owner',
  'phone',
  'technician',
  'receivedAt',
  'dueAt',
];

const COLUMN_STORAGE_KEY = 'devices.visibleColumns';

function loadColumns(): ColumnKey[] {
  try {
    const raw = window.localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!raw) return DEFAULT_COLUMNS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_COLUMNS;
    const valid = parsed.filter((key): key is ColumnKey =>
      COLUMNS.some((column) => column.key === key),
    );
    return valid.length > 0 ? valid : DEFAULT_COLUMNS;
  } catch {
    return DEFAULT_COLUMNS;
  }
}

export function DevicesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const canManage = can('repairs.manage');

  const [search, setSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState('');
  const [equipmentType, setEquipmentType] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortBy, setSortBy] = useState('receivedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(loadColumns);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, status, equipmentType, manufacturer, technicianId, fromDate, toDate, pageSize]);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(visibleColumns));
    } catch {
      /* ذخیره نشدن تنظیمات نمایش ستون‌ها مانع کار نیست */
    }
  }, [visibleColumns]);

  const filters = useMemo(() => {
    const params = new URLSearchParams();
    if (searchTerm) params.set('search', searchTerm);
    if (status) params.set('status', status);
    if (equipmentType) params.set('equipmentType', equipmentType);
    if (manufacturer) params.set('manufacturer', manufacturer);
    if (technicianId) params.set('technicianId', technicianId);
    const from = fromDate ? jalaliStartOfDayIso(fromDate) : null;
    const to = toDate ? jalaliEndOfDayIso(toDate) : null;
    if (from) params.set('receivedFrom', from);
    if (to) params.set('receivedTo', to);
    params.set('sortBy', sortBy);
    params.set('sortDir', sortDir);
    return params;
  }, [searchTerm, status, equipmentType, manufacturer, technicianId, fromDate, toDate, sortBy, sortDir]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams(filters);
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    return params.toString();
  }, [filters, page, pageSize]);

  const devicesQuery = useApiQuery<Page<DeviceSummary>>(
    () => api.get<Page<DeviceSummary>>(`/api/devices?${queryString}`),
    [queryString],
  );
  const configQuery = useApiQuery<DeviceConfigData>(
    () => api.get<DeviceConfigData>('/api/device-config'),
    [],
  );

  const devices = devicesQuery.data?.items ?? [];
  const options = configQuery.data?.options;
  const activeFilterCount = [
    searchTerm,
    status,
    equipmentType,
    manufacturer,
    technicianId,
    fromDate,
    toDate,
  ].filter(Boolean).length;

  function toggleSort(columnSortBy?: string) {
    if (!columnSortBy) return;
    if (sortBy === columnSortBy) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(columnSortBy);
      setSortDir('asc');
    }
  }

  function toggleColumn(key: ColumnKey) {
    setVisibleColumns((current) =>
      current.includes(key)
        ? current.length > 1
          ? current.filter((item) => item !== key)
          : current
        : [...current, key],
    );
  }

  function clearFilters() {
    setSearch('');
    setStatus('');
    setEquipmentType('');
    setManufacturer('');
    setTechnicianId('');
    setFromDate('');
    setToDate('');
  }

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams(filters);
      await downloadFile(`/api/devices/export?${params.toString()}`, 'devices.xlsx');
      toast.success('خروجی اکسل تجهیزات آماده شد.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setExporting(false);
    }
  }

  function handlePrint() {
    window.open(`/devices/print?${filters.toString()}`, '_blank', 'noopener');
  }

  return (
    <div>
      <PageHeader
        title="مدیریت تجهیزات"
        description="پذیرش دستگاه‌ها، وضعیت تعمیر و پرونده دیجیتال هر تجهیز را مدیریت کنید."
        actions={
          <>
            <Button variant="outline" onClick={() => void handleExport()} loading={exporting}>
              <Download className="size-4" />
              خروجی اکسل
            </Button>
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="size-4" />
              چاپ فهرست
            </Button>
            {canManage ? (
              <Button onClick={() => navigate('/devices/new')}>
                <Plus className="size-4" />
                پذیرش جدید
              </Button>
            ) : null}
          </>
        }
      />

      <Card>
        <div className="space-y-3 border-b border-ink-100 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="جستجو بر اساس کد پذیرش، IMEI، سریال، مالک، تلفن، مدل یا اقدام..."
                className="ps-9"
                aria-label="جستجوی تجهیزات"
              />
            </div>
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="w-48"
              aria-label="فیلتر وضعیت"
            >
              <option value="">همه وضعیت‌ها</option>
              {DEVICE_STATUS_OPTIONS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </Select>
            <Select
              value={equipmentType}
              onChange={(event) => setEquipmentType(event.target.value)}
              className="w-40"
              aria-label="فیلتر نوع تجهیز"
            >
              <option value="">همه تجهیزات</option>
              {(options?.equipment_type ?? []).map((option) => (
                <option key={option.id} value={option.key}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              value={manufacturer}
              onChange={(event) => setManufacturer(event.target.value)}
              className="w-40"
              aria-label="فیلتر سازنده"
            >
              <option value="">همه سازنده‌ها</option>
              {(options?.manufacturer ?? []).map((option) => (
                <option key={option.id} value={option.key}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              value={technicianId}
              onChange={(event) => setTechnicianId(event.target.value)}
              className="w-44"
              aria-label="فیلتر تکنسین"
            >
              <option value="">همه تکنسین‌ها</option>
              {(configQuery.data?.technicians ?? []).map((technician) => (
                <option key={technician.id} value={technician.id}>
                  {technician.fullName}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <span className="mb-1 block text-xs text-ink-500">از تاریخ پذیرش</span>
              <JalaliDateInput value={fromDate} onChange={setFromDate} ariaLabel="از تاریخ پذیرش" />
            </div>
            <div className="w-40">
              <span className="mb-1 block text-xs text-ink-500">تا تاریخ پذیرش</span>
              <JalaliDateInput value={toDate} onChange={setToDate} ariaLabel="تا تاریخ پذیرش" />
            </div>
            <Select
              value={String(pageSize)}
              onChange={(event) => setPageSize(Number(event.target.value))}
              className="w-32"
              aria-label="تعداد ردیف در صفحه"
            >
              <option value="10">۱۰ ردیف</option>
              <option value="20">۲۰ ردیف</option>
              <option value="50">۵۰ ردیف</option>
            </Select>

            <details className="relative">
              <summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-ink-200 bg-white px-3.5 text-sm text-ink-700 hover:border-ink-300">
                <Columns3 className="size-4" />
                ستون‌ها
              </summary>
              <div className="absolute z-20 mt-2 w-56 rounded-xl border border-ink-200 bg-white p-2 shadow-xl">
                {COLUMNS.map((column) => (
                  <label
                    key={column.key}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink-700 hover:bg-ink-50"
                  >
                    <span
                      className={cn(
                        'flex size-4 items-center justify-center rounded border',
                        visibleColumns.includes(column.key)
                          ? 'border-brand-500 bg-brand-500 text-white'
                          : 'border-ink-300 bg-white',
                      )}
                    >
                      {visibleColumns.includes(column.key) ? <Check className="size-3" /> : null}
                    </span>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={visibleColumns.includes(column.key)}
                      onChange={() => toggleColumn(column.key)}
                    />
                    {column.label}
                  </label>
                ))}
              </div>
            </details>

            {activeFilterCount > 0 ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <FilterX className="size-4" />
                پاک کردن فیلترها
              </Button>
            ) : null}

            <span className="ms-auto text-xs text-ink-400">
              {devicesQuery.data ? `${devicesQuery.data.total} پرونده` : ''}
            </span>
          </div>
        </div>

        {devicesQuery.loading && !devicesQuery.data ? <Spinner label="در حال دریافت تجهیزات..." /> : null}

        {devicesQuery.error ? (
          <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {devicesQuery.error}
          </div>
        ) : null}

        {devicesQuery.data && devices.length === 0 ? (
          <EmptyState
            icon={<Smartphone className="size-6" />}
            title="تجهیزی یافت نشد"
            description={
              activeFilterCount > 0
                ? 'با فیلترهای انتخاب‌شده پرونده‌ای پیدا نشد. فیلترها را تغییر دهید.'
                : 'هنوز دستگاهی پذیرش نشده است. با دکمه «پذیرش جدید» اولین پرونده را ثبت کنید.'
            }
            action={
              activeFilterCount === 0 && canManage ? (
                <Button onClick={() => navigate('/devices/new')}>
                  <Plus className="size-4" />
                  پذیرش جدید
                </Button>
              ) : null
            }
          />
        ) : null}

        {devices.length > 0 ? (
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                {COLUMNS.filter((column) => visibleColumns.includes(column.key)).map((column) => (
                  <TableHead key={column.key}>
                    {column.sortBy ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.sortBy)}
                        className="inline-flex items-center gap-1 hover:text-ink-800"
                      >
                        {column.label}
                        {sortBy === column.sortBy ? (
                          sortDir === 'asc' ? (
                            <ArrowUp className="size-3.5" />
                          ) : (
                            <ArrowDown className="size-3.5" />
                          )
                        ) : (
                          <ArrowUpDown className="size-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      column.label
                    )}
                  </TableHead>
                ))}
                <TableHead className="text-end">عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.map((device) => (
                <TableRow key={device.id} className="cursor-pointer" onClick={() => navigate(`/devices/${device.id}`)}>
                  {visibleColumns.includes('intakeCode') ? (
                    <TableCell className="whitespace-nowrap font-medium" dir="ltr">
                      {device.intakeCode}
                    </TableCell>
                  ) : null}
                  {visibleColumns.includes('status') ? (
                    <TableCell>
                      <Badge variant={statusBadgeVariant(device.status.tone)}>
                        {device.status.label}
                      </Badge>
                    </TableCell>
                  ) : null}
                  {visibleColumns.includes('equipment') ? (
                    <TableCell className="whitespace-nowrap text-xs text-ink-600">
                      {device.equipmentType.label}
                    </TableCell>
                  ) : null}
                  {visibleColumns.includes('manufacturer') ? (
                    <TableCell className="whitespace-nowrap text-xs text-ink-600">
                      {device.manufacturer?.label ?? '—'}
                    </TableCell>
                  ) : null}
                  {visibleColumns.includes('model') ? (
                    <TableCell className="max-w-[180px] truncate text-xs text-ink-700">
                      {device.model || '—'}
                    </TableCell>
                  ) : null}
                  {visibleColumns.includes('serialNumber') ? (
                    <TableCell className="text-xs text-ink-500" dir="ltr">
                      {device.serialNumber || '—'}
                    </TableCell>
                  ) : null}
                  {visibleColumns.includes('imei1') ? (
                    <TableCell className="text-xs text-ink-500" dir="ltr">
                      {device.imei1 || '—'}
                    </TableCell>
                  ) : null}
                  {visibleColumns.includes('owner') ? (
                    <TableCell className="whitespace-nowrap text-xs text-ink-700">
                      {device.owner.fullName}
                    </TableCell>
                  ) : null}
                  {visibleColumns.includes('phone') ? (
                    <TableCell className="text-xs text-ink-500" dir="ltr">
                      {device.owner.phone || '—'}
                    </TableCell>
                  ) : null}
                  {visibleColumns.includes('technician') ? (
                    <TableCell className="whitespace-nowrap text-xs text-ink-600">
                      {device.technician?.fullName ?? '—'}
                    </TableCell>
                  ) : null}
                  {visibleColumns.includes('receivedAt') ? (
                    <TableCell className="whitespace-nowrap text-xs text-ink-500">
                      {formatJalaliDateTime(device.receivedAt)}
                    </TableCell>
                  ) : null}
                  {visibleColumns.includes('dueAt') ? (
                    <TableCell className="whitespace-nowrap text-xs text-ink-500">
                      {device.dueAt ? formatJalaliDateTime(device.dueAt) : '—'}
                    </TableCell>
                  ) : null}
                  {visibleColumns.includes('problem') ? (
                    <TableCell className="max-w-[220px] truncate text-xs text-ink-500">
                      {device.reportedProblem}
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <div
                      className="flex items-center justify-end gap-1"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`مشاهده پرونده ${device.intakeCode}`}
                        title="مشاهده پرونده"
                        onClick={() => navigate(`/devices/${device.id}`)}
                      >
                        <Eye className="size-4" />
                      </Button>
                      {canManage ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`ویرایش ${device.intakeCode}`}
                          title="ویرایش"
                          onClick={() => navigate(`/devices/${device.id}/edit`)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`چاپ ${device.intakeCode}`}
                        title="چاپ رسید"
                        onClick={() =>
                          window.open(`/devices/${device.id}/print`, '_blank', 'noopener')
                        }
                      >
                        <Printer className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}

        {devicesQuery.data ? (
          <Pagination
            page={devicesQuery.data.page}
            pageSize={devicesQuery.data.pageSize}
            total={devicesQuery.data.total}
            totalPages={devicesQuery.data.totalPages}
            onPageChange={setPage}
          />
        ) : null}
      </Card>
    </div>
  );
}
