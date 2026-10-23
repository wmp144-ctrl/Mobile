import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FolderCog,
  FolderOpen,
  HardDrive,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useApiQuery } from '@/lib/use-api';
import { usePermissions } from '@/lib/use-permissions';
import { formatBytes, formatNumber } from '@/lib/format';
import { formatJalaliDateTime } from '@/lib/jalali';
import {
  ACCESS_STATUS_OPTIONS,
  BACKUP_STATUS_OPTIONS,
  accessStatusLabel,
  accessStatusVariant,
  backupStatusLabel,
  backupStatusVariant,
  folderCategoryLabel,
  launchHelper,
  storageLocationKindLabel,
} from '@/lib/storage';
import type {
  OpenTicket,
  Page,
  StorageConfig,
  StorageFileEntry,
  StorageLocation,
} from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, FieldHint, Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { StorageLocationDialog } from './storage-location-dialog';

type TabKey = 'files' | 'locations' | 'settings';

export function StoragePage() {
  const { can } = usePermissions();
  const canManage = can('files.manage');
  const [tab, setTab] = useState<TabKey>('files');

  const tabs: Array<{ key: TabKey; label: string; icon: ReactNode }> = [
    { key: 'files', label: 'فایل‌ها و بکاپ‌ها', icon: <FolderOpen className="size-4" /> },
    { key: 'locations', label: 'محل‌های ذخیره‌سازی', icon: <HardDrive className="size-4" /> },
    { key: 'settings', label: 'ساختار پوشه‌ها', icon: <FolderCog className="size-4" /> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="مدیریت فایل‌ها و محل نگهداری اطلاعات"
        description="مسیر بکاپ‌ها، فایل‌های ریکاوری و سلامت حافظه‌های سرور و شبکه را مدیریت کنید."
      />

      <div className="flex flex-wrap gap-1.5 rounded-xl border border-ink-200 bg-white p-1.5 shadow-sm">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition',
              tab === item.key
                ? 'bg-brand-50 text-brand-700'
                : 'text-ink-500 hover:bg-ink-50 hover:text-ink-800',
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'files' ? <FilesTab /> : null}
      {tab === 'locations' ? <LocationsTab canManage={canManage} /> : null}
      {tab === 'settings' ? <FolderSettingsTab canManage={canManage} /> : null}
    </div>
  );
}

function FilesTab() {
  const toast = useToast();
  const [searchInput, setSearchInput] = useState('');
  const [backupInput, setBackupInput] = useState('');
  const [accessInput, setAccessInput] = useState('');
  const [applied, setApplied] = useState({ search: '', backup: '', access: '' });
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);

  const filesQuery = useApiQuery<Page<StorageFileEntry>>(() => {
    const params = new URLSearchParams();
    if (applied.search) params.set('search', applied.search);
    if (applied.backup) params.set('backupStatus', applied.backup);
    if (applied.access) params.set('accessStatus', applied.access);
    params.set('page', String(page));
    params.set('pageSize', '20');
    return api.get<Page<StorageFileEntry>>(`/api/storage/files?${params.toString()}`);
  }, [applied.search, applied.backup, applied.access, page]);

  function applyFilters(event?: FormEvent) {
    event?.preventDefault();
    setPage(1);
    setApplied({ search: searchInput.trim(), backup: backupInput, access: accessInput });
  }

  async function copyPath(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('مسیر کپی شد.');
    } catch {
      toast.error('کپی خودکار ممکن نشد. مسیر را دستی انتخاب کنید.');
    }
  }

  async function openFolder(file: StorageFileEntry) {
    setBusy(`open-${file.id}`);
    try {
      const ticket = await api.post<OpenTicket>(
        `/api/devices/${file.deviceId}/files/${file.id}/open-ticket`,
      );
      launchHelper(ticket);
      toast.info('درخواست بازکردن پوشه به برنامه کمکی ارسال شد.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function checkAccess(file: StorageFileEntry) {
    setBusy(`check-${file.id}`);
    try {
      await api.post(`/api/devices/${file.deviceId}/files/${file.id}/check`);
      toast.success('دسترسی به مسیر بررسی شد.');
      await filesQuery.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  const items = filesQuery.data?.items ?? [];

  return (
    <Card>
      <CardHeader className="flex-wrap">
        <div>
          <CardTitle>جست‌وجوی فایل‌ها و بکاپ‌ها</CardTitle>
          <p className="mt-1 text-xs text-ink-400">
            جست‌وجو با کد پذیرش، IMEI، سریال، نام مالک، عنوان یا مسیر فایل انجام می‌شود.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-0 pt-5">
        <form onSubmit={applyFilters} className="flex flex-wrap items-end gap-3 px-5">
          <div className="min-w-[240px] flex-1">
            <Label htmlFor="file-search">جست‌وجو</Label>
            <div className="relative mt-1.5">
              <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
              <Input
                id="file-search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                className="pe-9"
                placeholder="مثلاً MR-1405-0007 یا IMEI دستگاه"
              />
            </div>
          </div>
          <div className="w-[180px]">
            <Label htmlFor="file-backup-filter">وضعیت بکاپ</Label>
            <Select
              id="file-backup-filter"
              value={backupInput}
              onChange={(event) => setBackupInput(event.target.value)}
              className="mt-1.5"
            >
              <option value="">همه وضعیت‌ها</option>
              {BACKUP_STATUS_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-[170px]">
            <Label htmlFor="file-access-filter">وضعیت دسترسی</Label>
            <Select
              id="file-access-filter"
              value={accessInput}
              onChange={(event) => setAccessInput(event.target.value)}
              className="mt-1.5"
            >
              <option value="">همه</option>
              {ACCESS_STATUS_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="outline">
            <Search className="size-4" />
            جست‌وجو
          </Button>
          <Button type="button" variant="ghost" onClick={() => filesQuery.reload()}>
            <RefreshCw className="size-4" />
            بازخوانی
          </Button>
        </form>

        {filesQuery.loading && !filesQuery.data ? (
          <Spinner label="در حال دریافت فایل‌ها..." />
        ) : null}

        {filesQuery.error ? (
          <div className="mx-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {filesQuery.error}
          </div>
        ) : null}

        {filesQuery.data && items.length === 0 ? (
          <EmptyState
            icon={<FolderOpen className="size-6" />}
            title="فایلی یافت نشد"
            description="با ثبت دستگاه در بخش تجهیزات، پوشه اصلی و مسیرهای فایل به‌صورت خودکار ساخته می‌شوند."
          />
        ) : null}

        {items.length > 0 ? (
          <>
            <Table className="min-w-[1080px]">
              <TableHeader>
                <TableRow>
                  <TableHead>کد پذیرش</TableHead>
                  <TableHead>عنوان / مالک</TableHead>
                  <TableHead>مسیر</TableHead>
                  <TableHead>دسته</TableHead>
                  <TableHead>حجم</TableHead>
                  <TableHead>بکاپ</TableHead>
                  <TableHead>دسترسی</TableHead>
                  <TableHead>آخرین بررسی</TableHead>
                  <TableHead className="text-end">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((file) => (
                  <TableRow key={file.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      <Link
                        to={`/devices/${file.deviceId}`}
                        className="font-medium text-brand-700 hover:underline"
                        dir="ltr"
                      >
                        {file.intakeCode}
                      </Link>
                      {file.isPrimary ? (
                        <Badge variant="brand" className="ms-1.5">
                          اصلی
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      <p className="font-medium text-ink-800">{file.label}</p>
                      <p className="mt-0.5 text-[11px] text-ink-400">{file.ownerName}</p>
                    </TableCell>
                    <TableCell className="max-w-[260px] text-xs">
                      <button
                        type="button"
                        dir="ltr"
                        onClick={() => void copyPath(file.clientPath ?? file.path)}
                        className="inline-flex items-start gap-1 break-all text-start text-brand-700 hover:underline"
                      >
                        <Copy className="mt-0.5 size-3 shrink-0" />
                        {file.clientPath ?? file.path}
                      </button>
                      {file.clientPath ? (
                        <p className="mt-0.5 break-all text-[10px] text-ink-400" dir="ltr">
                          {file.path}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-ink-500">
                      {folderCategoryLabel(file.category)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-ink-500">
                      {file.sizeBytes === null ? '—' : formatBytes(file.sizeBytes)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={backupStatusVariant(file.backupStatus)}>
                        {backupStatusLabel(file.backupStatus)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={accessStatusVariant(file.accessStatus)}>
                        {accessStatusLabel(file.accessStatus)}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-[11px] text-ink-400">
                      {file.lastCheckedAt ? formatJalaliDateTime(file.lastCheckedAt) : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void openFolder(file)}
                          loading={busy === `open-${file.id}`}
                        >
                          <FolderOpen className="size-4" />
                          بازکردن
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="بررسی دسترسی"
                          onClick={() => void checkAccess(file)}
                          loading={busy === `check-${file.id}`}
                        >
                          <RefreshCw className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              page={filesQuery.data!.page}
              pageSize={filesQuery.data!.pageSize}
              total={filesQuery.data!.total}
              totalPages={filesQuery.data!.totalPages}
              onPageChange={setPage}
            />
          </>
        ) : null}

        <p className="px-5 pb-2 text-[11px] leading-6 text-ink-400">
          برای بازکردن مستقیم پوشه، برنامه کمکی «Repair Desk Helper» باید روی رایانه کلاینت نصب شده
          باشد. مسیر شبکه‌ای ثبت‌شده مرجع است و مسیر درایو محلی هر کلاینت از آن ساخته می‌شود.
        </p>
      </CardContent>
    </Card>
  );
}

function LocationsTab({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const locationsQuery = useApiQuery<StorageLocation[]>(
    () => api.get<StorageLocation[]>('/api/storage/locations?includeInactive=true'),
    [],
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StorageLocation | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StorageLocation | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function check(location: StorageLocation) {
    setBusy(`check-${location.id}`);
    try {
      await api.post(`/api/storage/locations/${location.id}/check`);
      toast.success(`سلامت «${location.name}» بررسی شد.`);
      await locationsQuery.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function openRoot(location: StorageLocation) {
    setBusy(`open-${location.id}`);
    try {
      const ticket = await api.post<OpenTicket>(`/api/storage/locations/${location.id}/open-ticket`);
      launchHelper(ticket);
      toast.info('درخواست بازکردن مسیر به برنامه کمکی ارسال شد.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!pendingDelete) return;
    setBusy(`delete-${pendingDelete.id}`);
    try {
      await api.delete(`/api/storage/locations/${pendingDelete.id}`);
      toast.success('محل ذخیره‌سازی حذف شد.');
      setPendingDelete(null);
      await locationsQuery.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  const locations = locationsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>محل‌های ذخیره‌سازی</CardTitle>
            <p className="mt-1 text-xs text-ink-400">
              ظرفیت، فضای آزاد، آخرین دسترسی موفق و وضعیت اتصال هر دیسک یا هارد شبکه.
            </p>
          </div>
          {canManage ? (
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="size-4" />
              افزودن محل
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {locationsQuery.loading && !locationsQuery.data ? (
            <Spinner label="در حال بررسی حافظه‌ها..." />
          ) : null}
          {locationsQuery.error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {locationsQuery.error}
            </div>
          ) : null}
          {!locationsQuery.loading && locations.length === 0 ? (
            <EmptyState
              icon={<HardDrive className="size-6" />}
              title="محل ذخیره‌سازی ثبت نشده است"
              description="یک پوشه روی سرور یا هارد شبکه معرفی کنید تا پوشه دستگاه‌ها خودکار ساخته شود."
            />
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            {locations.map((location) => (
              <div
                key={location.id}
                className={cn(
                  'rounded-2xl border p-4',
                  location.health.available
                    ? 'border-ink-200 bg-white'
                    : 'border-rose-200 bg-rose-50/40',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="text-sm font-semibold text-ink-900">{location.name}</h3>
                      {location.isDefault ? <Badge variant="brand">پیش‌فرض</Badge> : null}
                      {!location.isActive ? <Badge>غیرفعال</Badge> : null}
                      <Badge>{storageLocationKindLabel(location.kind)}</Badge>
                    </div>
                    <p className="mt-1 break-all text-[11px] text-ink-500" dir="ltr">
                      {location.rootPath}
                    </p>
                    {location.clientRoot ? (
                      <p className="mt-0.5 break-all text-[11px] text-ink-400" dir="ltr">
                        کلاینت: {location.clientRoot}
                      </p>
                    ) : null}
                  </div>
                  <Badge
                    variant={
                      !location.health.available
                        ? 'danger'
                        : location.health.writable
                          ? 'success'
                          : 'warning'
                    }
                  >
                    {location.health.available ? (
                      <CheckCircle2 className="me-1 size-3" />
                    ) : (
                      <WifiOff className="me-1 size-3" />
                    )}
                    {!location.health.available
                      ? 'قطع'
                      : location.health.writable
                        ? 'متصل'
                        : 'فقط خواندنی'}
                  </Badge>
                </div>

                <div className="mt-3 space-y-1.5">
                  <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        location.health.lowSpace ? 'bg-amber-500' : 'bg-brand-500',
                      )}
                      style={{ width: `${Math.min(location.health.usagePercent ?? 0, 100)}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 text-[11px] text-ink-500">
                    <span>
                      استفاده‌شده: {location.health.usedBytes === null ? '—' : formatBytes(location.health.usedBytes)}
                    </span>
                    <span>
                      آزاد: {location.health.freeBytes === null ? '—' : formatBytes(location.health.freeBytes)}
                    </span>
                    <span>
                      کل: {location.health.totalBytes === null ? '—' : formatBytes(location.health.totalBytes)}
                    </span>
                  </div>
                </div>

                {location.health.lowSpace ? (
                  <p className="mt-2 flex items-center gap-1 text-[11px] text-amber-700">
                    <AlertTriangle className="size-3.5" />
                    فضای آزاد کمتر از آستانه هشدار است.
                  </p>
                ) : null}
                {location.health.error ? (
                  <p className="mt-2 text-[11px] leading-5 text-rose-700">{location.health.error}</p>
                ) : null}
                <p className="mt-2 text-[11px] text-ink-400">
                  آخرین دسترسی موفق:{' '}
                  {location.health.lastSuccessAt
                    ? formatJalaliDateTime(location.health.lastSuccessAt)
                    : 'ثبت نشده'}{' '}
                  — {formatNumber(location.fileCount)} مسیر ثبت‌شده — حجم داده:{' '}
                  {formatBytes(location.dataBytes)}
                </p>
                {location.driveLetter || location.volumeLabel || location.volumeId ? (
                  <p className="mt-1 text-[11px] text-ink-400" dir="ltr">
                    {[location.driveLetter, location.volumeLabel, location.volumeId]
                      .filter(Boolean)
                      .join(' — ')}
                  </p>
                ) : null}
                {location.notes ? (
                  <p className="mt-1 text-[11px] text-ink-500">{location.notes}</p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void check(location)}
                    loading={busy === `check-${location.id}`}
                  >
                    <RefreshCw className="size-4" />
                    بررسی سلامت
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void openRoot(location)}
                    loading={busy === `open-${location.id}`}
                  >
                    <FolderOpen className="size-4" />
                    بازکردن
                  </Button>
                  {canManage ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(location);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                        ویرایش
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPendingDelete(location)}
                      >
                        <Trash2 className="size-4 text-rose-600" />
                        حذف
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <StorageLocationDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        location={editing}
        onSaved={() => void locationsQuery.reload()}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="حذف محل ذخیره‌سازی"
        description={`آیا از حذف «${pendingDelete?.name ?? ''}» اطمینان دارید؟ مسیرهای فایل متصل باید ابتدا جابه‌جا شوند.`}
        confirmLabel="حذف"
        onConfirm={() => void remove()}
        loading={busy === `delete-${pendingDelete?.id}`}
      />
    </div>
  );
}

function FolderSettingsTab({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const configQuery = useApiQuery<StorageConfig>(() => api.get<StorageConfig>('/api/storage/config'), []);
  const locationsQuery = useApiQuery<StorageLocation[]>(
    () => api.get<StorageLocation[]>('/api/storage/locations'),
    [],
  );
  const [layout, setLayout] = useState('{year}/{intakeCode}');
  const [subfolders, setSubfolders] = useState('');
  const [lowSpace, setLowSpace] = useState('5');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!configQuery.data) return;
    setLayout(configQuery.data.folderLayout);
    setSubfolders(configQuery.data.subfolders.join(', '));
    setLowSpace(String(configQuery.data.lowSpaceGb));
  }, [configQuery.data]);

  const defaultLocation = useMemo(
    () => (locationsQuery.data ?? []).find((location) => location.isDefault) ?? null,
    [locationsQuery.data],
  );

  const example = useMemo(() => {
    const year = '1405';
    const code = 'MR-1405-0001';
    const relative = layout.replace(/\{year\}/g, year).replace(/\{intakeCode\}/g, code);
    const root = defaultLocation?.clientRoot ?? defaultLocation?.rootPath ?? 'RepairStorage';
    return `${root.replace(/[\\/]+$/, '')}\\${relative.replace(/\//g, '\\')}`;
  }, [layout, defaultLocation]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canManage || saving) return;
    const names = subfolders
      .split(/[,،\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (names.length === 0) {
      toast.error('حداقل یک زیرپوشه تعریف کنید.');
      return;
    }
    setSaving(true);
    try {
      await api.patch<StorageConfig>('/api/storage/config', {
        folderLayout: layout.trim(),
        subfolders: names,
        lowSpaceGb: Number(lowSpace),
      });
      toast.success('ساختار پوشه‌ها ذخیره شد. دستگاه‌های جدید با این ساختار ساخته می‌شوند.');
      await configQuery.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>ساختار خودکار پوشه دستگاه</CardTitle>
            <p className="mt-1 text-xs text-ink-400">
              هنگام پذیرش، پوشه‌ها زیر محل پیش‌فرض ساخته می‌شوند.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <div>
              <Label htmlFor="folder-layout">الگوی مسیر سالانه *</Label>
              <Input
                id="folder-layout"
                value={layout}
                onChange={(event) => setLayout(event.target.value)}
                className="mt-1.5"
                dir="ltr"
                disabled={!canManage}
                placeholder="{year}/{intakeCode}"
              />
              <FieldHint>
                از <code dir="ltr">{'{year}'}</code> برای سال شمسی و <code dir="ltr">{'{intakeCode}'}</code>{' '}
                برای کد پذیرش استفاده کنید. مثال: <code dir="ltr">RepairStorage/{'{year}'}/{'{intakeCode}'}</code>
              </FieldHint>
            </div>
            <div>
              <Label htmlFor="folder-subfolders">زیرپوشه‌ها (با کاما جدا کنید)</Label>
              <Input
                id="folder-subfolders"
                value={subfolders}
                onChange={(event) => setSubfolders(event.target.value)}
                className="mt-1.5"
                dir="ltr"
                disabled={!canManage}
                placeholder="Original, Backup, Recovered, Reports, Images, Documents"
              />
            </div>
            <div>
              <Label htmlFor="folder-low-space">آستانه هشدار فضای آزاد (گیگابایت)</Label>
              <Input
                id="folder-low-space"
                type="number"
                min={1}
                value={lowSpace}
                onChange={(event) => setLowSpace(event.target.value)}
                className="mt-1.5"
                disabled={!canManage}
              />
            </div>
            <div className="rounded-xl border border-dashed border-ink-200 bg-ink-50/60 px-4 py-3">
              <p className="text-[11px] text-ink-500">نمونه مسیر قابل دسترس در کلاینت:</p>
              <p className="mt-1 break-all text-xs text-ink-800" dir="ltr">
                {example}
              </p>
              <p className="mt-2 text-[11px] text-ink-400">
                {defaultLocation
                  ? `محل پیش‌فرض: ${defaultLocation.name}`
                  : 'هیچ محل پیش‌فرضی تعریف نشده است.'}
              </p>
            </div>
            {canManage ? (
              <Button type="submit" loading={saving}>
                ذخیره ساختار
              </Button>
            ) : (
              <p className="text-xs text-ink-400">تغییر ساختار پوشه نیازمند مجوز مدیریت فایل‌ها است.</p>
            )}
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>نکات نگهداری</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs leading-6 text-ink-500">
            <p>• مسیر شبکه‌ای (UNC یا درایو نگاشت‌شده) مرجع است، نه درایو محلی هر رایانه.</p>
            <p>• در صورت جابه‌جایی اطلاعات، مسیر جایگزین را در پرونده دستگاه ثبت کنید.</p>
            <p>• حذف یا تغییر مسیرها در تاریخچه تغییرات با نام کاربر ثبت می‌شود.</p>
            <p>• برای بازکردن پوشه، برنامه کمکی ویندوز را از پوشه <code dir="ltr">tools/storage-helper</code> نصب کنید.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
