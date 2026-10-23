import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  ClipboardList,
  Copy,
  Eye,
  FileText,
  FolderOpen,
  FolderPlus,
  HardDrive,
  ImagePlus,
  Images,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  StickyNote,
  Trash2,
  UserRound,
} from 'lucide-react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useApiQuery } from '@/lib/use-api';
import { usePermissions } from '@/lib/use-permissions';
import { formatJalaliDate, formatJalaliDateTime } from '@/lib/jalali';
import { formatBytes, formatNumber } from '@/lib/format';
import { DEVICE_STATUS_OPTIONS, statusBadgeVariant } from '@/lib/device-status';
import {
  accessStatusLabel,
  accessStatusVariant,
  backupStatusLabel,
  backupStatusVariant,
  folderCategoryLabel,
  launchHelper,
} from '@/lib/storage';
import type {
  DeviceConfigData,
  DeviceDetail,
  DeviceFileEntry,
  DeviceImageEntry,
  FieldDefinition,
  OpenTicket,
  StorageLocation,
} from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input, Label } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { StatusChangeDialog } from './status-change-dialog';
import { OperationDialog } from './operation-dialog';
import { FilePathDialog } from './file-path-dialog';

type TabKey = 'info' | 'status' | 'operations' | 'files' | 'images' | 'notes';

type PendingDelete =
  | { kind: 'operation' | 'file' | 'image' | 'note'; id: string; title: string }
  | null;

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-ink-100 py-2.5 last:border-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <span className="shrink-0 text-xs text-ink-500">{label}</span>
      <span className="text-sm font-medium text-ink-800">{children}</span>
    </div>
  );
}

function customFieldValue(field: FieldDefinition, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (field.type === 'checkbox') return value === true ? 'بله' : 'خیر';
  if (field.type === 'date' && typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : formatJalaliDate(date);
  }
  if (field.type === 'multi_select' && Array.isArray(value)) {
    return value
      .map((item) => field.options.find((option) => option.value === item)?.label ?? String(item))
      .join('، ');
  }
  if (field.type === 'select') {
    return field.options.find((option) => option.value === value)?.label ?? String(value);
  }
  return String(value);
}

function AuthenticatedImage({
  image,
  canManage,
  onDelete,
}: {
  image: DeviceImageEntry;
  canManage: boolean;
  onDelete: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    api
      .objectUrl(image.url)
      .then((url) => {
        objectUrl = url;
        if (active) setSrc(url);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image.url]);

  return (
    <div className="overflow-hidden rounded-xl border border-ink-200">
      <div className="flex aspect-[4/3] items-center justify-center bg-ink-50">
        {src ? (
          <img src={src} alt={image.caption ?? image.originalName} className="size-full object-cover" />
        ) : failed ? (
          <span className="text-xs text-ink-400">تصویر قابل نمایش نیست</span>
        ) : (
          <RefreshCw className="size-5 animate-spin text-ink-400" />
        )}
      </div>
      <div className="flex items-start justify-between gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-ink-700">{image.caption ?? image.originalName}</p>
          <p className="mt-0.5 text-[11px] text-ink-400">
            {formatJalaliDateTime(image.createdAt)} — {formatBytes(image.sizeBytes)}
            {image.uploadedByName ? ` — ${image.uploadedByName}` : ''}
          </p>
        </div>
        {canManage ? (
          <Button variant="ghost" size="icon" aria-label="حذف تصویر" onClick={onDelete}>
            <Trash2 className="size-4 text-rose-600" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { can } = usePermissions();
  const canManage = can('repairs.manage');
  const canFiles = can('files.view') || can('files.manage');
  const canManageFiles = can('files.manage');

  const [device, setDevice] = useState<DeviceDetail | null>(null);
  const [tab, setTab] = useState<TabKey>('info');
  const [statusOpen, setStatusOpen] = useState(false);
  const [operationOpen, setOperationOpen] = useState(false);
  const [editingOperationId, setEditingOperationId] = useState<string | null>(null);
  const [fileOpen, setFileOpen] = useState(false);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageCaption, setImageCaption] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [fileBusy, setFileBusy] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);

  const detailQuery = useApiQuery<DeviceDetail>(() => api.get<DeviceDetail>(`/api/devices/${id}`), [id]);
  const configQuery = useApiQuery<DeviceConfigData>(
    () => api.get<DeviceConfigData>('/api/device-config'),
    [],
  );

  useEffect(() => {
    if (detailQuery.data) setDevice(detailQuery.data);
  }, [detailQuery.data]);

  const accessories = useMemo(() => {
    const map = new Map((configQuery.data?.options.accessory ?? []).map((item) => [item.key, item.label]));
    return (device?.accessories ?? []).map((key) => map.get(key) ?? key);
  }, [configQuery.data, device]);

  const customFieldDefs = useMemo(
    () => (configQuery.data?.fields ?? []).filter((field) => !field.isSystem && field.isEnabled),
    [configQuery.data],
  );

  const editingOperation =
    device?.operations.find((operation) => operation.id === editingOperationId) ?? null;
  const editingFile = device?.files.find((file) => file.id === editingFileId) ?? null;

  async function revealPassword() {
    if (!device) return;
    setPasswordLoading(true);
    try {
      const result = await api.get<{ password: string | null }>(`/api/devices/${device.id}/password`);
      setPassword(result.password);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPasswordLoading(false);
    }
  }

  useEffect(() => {
    if (!canFiles) return;
    let active = true;
    api
      .get<StorageLocation[]>('/api/storage/locations')
      .then((items) => {
        if (active) setLocations(items);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [canFiles]);

  async function copyPath(path: string) {
    try {
      await navigator.clipboard.writeText(path);
      toast.success('مسیر فایل کپی شد.');
    } catch {
      toast.error('کپی خودکار ممکن نشد. مسیر را دستی انتخاب کنید.');
    }
  }

  async function openFolder(file: DeviceFileEntry) {
    if (!device) return;
    setFileBusy(`open-${file.id}`);
    try {
      const ticket = await api.post<OpenTicket>(
        `/api/devices/${device.id}/files/${file.id}/open-ticket`,
      );
      launchHelper(ticket);
      toast.info('درخواست بازکردن پوشه به برنامه کمکی ارسال شد.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setFileBusy(null);
    }
  }

  async function checkFileAccess(file: DeviceFileEntry) {
    if (!device) return;
    setFileBusy(`check-${file.id}`);
    try {
      await api.post(`/api/devices/${device.id}/files/${file.id}/check`);
      toast.success('دسترسی به مسیر بررسی شد.');
      await detailQuery.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setFileBusy(null);
    }
  }

  async function provisionFolder() {
    if (!device) return;
    setProvisioning(true);
    try {
      await api.post(`/api/devices/${device.id}/storage/provision`);
      toast.success('پوشه دستگاه ساخته و بررسی شد.');
      await detailQuery.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setProvisioning(false);
    }
  }

  async function addNote() {
    if (!device || noteText.trim().length === 0) return;
    setNoteSaving(true);
    try {
      const updated = await api.post<DeviceDetail>(`/api/devices/${device.id}/notes`, {
        body: noteText.trim(),
      });
      setDevice(updated);
      setNoteText('');
      toast.success('یادداشت ثبت شد.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setNoteSaving(false);
    }
  }

  async function uploadImage() {
    if (!device || !imageFile) {
      toast.error('یک فایل تصویری انتخاب کنید.');
      return;
    }
    setImageUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', imageFile);
      if (imageCaption.trim()) formData.append('caption', imageCaption.trim());
      const updated = await api.upload<DeviceDetail>(`/api/devices/${device.id}/images`, formData);
      setDevice(updated);
      setImageFile(null);
      setImageCaption('');
      toast.success('تصویر دستگاه ثبت شد.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setImageUploading(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete || !device) return;
    setDeleting(true);
    const endpoints: Record<NonNullable<PendingDelete>['kind'], string> = {
      operation: `/api/devices/${device.id}/operations/${pendingDelete.id}`,
      file: `/api/devices/${device.id}/files/${pendingDelete.id}`,
      image: `/api/devices/${device.id}/images/${pendingDelete.id}`,
      note: `/api/devices/${device.id}/notes/${pendingDelete.id}`,
    };
    try {
      const updated = await api.delete<DeviceDetail>(endpoints[pendingDelete.kind]);
      setDevice(updated);
      toast.success('حذف انجام شد و در تاریخچه سامانه ثبت گردید.');
      setPendingDelete(null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  if (detailQuery.loading && !device) return <Spinner label="در حال دریافت پرونده دستگاه..." />;

  if (detailQuery.error || !device) {
    return (
      <div>
        <PageHeader title="پرونده دستگاه" />
        <Card>
          <CardContent className="space-y-3 text-sm text-ink-600">
            <p>{detailQuery.error ?? 'پرونده دستگاه پیدا نشد.'}</p>
            <Link to="/devices">
              <Button variant="outline">بازگشت به فهرست تجهیزات</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isOverdue =
    Boolean(device.dueAt) &&
    new Date(device.dueAt as string).getTime() < Date.now() &&
    !['delivered', 'failed', 'unrepairable', 'cancelled'].includes(device.status.key);

  const primaryFile = device.files.find((file) => file.isPrimary) ?? null;

  const tabs: Array<{ key: TabKey; label: string; icon: ReactNode; count?: number }> = [
    { key: 'info', label: 'مشخصات', icon: <ClipboardList className="size-4" /> },
    { key: 'status', label: 'وضعیت و تاریخچه', icon: <CalendarClock className="size-4" /> },
    { key: 'operations', label: 'اقدامات', icon: <HardDrive className="size-4" />, count: device.operations.length },
    ...(canFiles
      ? [
          {
            key: 'files' as const,
            label: 'فایل و بکاپ',
            icon: <FolderOpen className="size-4" />,
            count: device.files.length,
          },
        ]
      : []),
    { key: 'images', label: 'تصاویر', icon: <Images className="size-4" />, count: device.images.length },
    { key: 'notes', label: 'یادداشت‌ها', icon: <StickyNote className="size-4" />, count: device.technicianNotes.length },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/devices" className="mb-2 inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-800">
            <ArrowRight className="size-3.5" />
            بازگشت به فهرست تجهیزات
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-ink-900" dir="ltr">
              {device.intakeCode}
            </h1>
            <Badge variant={statusBadgeVariant(device.status.tone)}>{device.status.label}</Badge>
            {isOverdue ? <Badge variant="danger">تأخیر در تحویل</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {device.equipmentType.label}
            {device.manufacturer ? ` — ${device.manufacturer.label}` : ''}
            {device.model ? ` — ${device.model}` : ''} — مالک: {device.owner.fullName}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <Button variant="outline" onClick={() => setStatusOpen(true)}>
              <RefreshCw className="size-4" />
              تغییر وضعیت
            </Button>
          ) : null}
          {canManage ? (
            <Link to={`/devices/${device.id}/edit`}>
              <Button variant="outline">
                <Pencil className="size-4" />
                ویرایش
              </Button>
            </Link>
          ) : null}
          <Button variant="outline" onClick={() => window.open(`/devices/${device.id}/print`, '_blank', 'noopener')}>
            <Printer className="size-4" />
            چاپ پرونده
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-ink-200 pb-2">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm transition',
              tab === item.key
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-ink-600 hover:bg-ink-100',
            )}
          >
            {item.icon}
            {item.label}
            {typeof item.count === 'number' && item.count > 0 ? (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px]',
                  tab === item.key ? 'bg-white/20' : 'bg-ink-200 text-ink-600',
                )}
              >
                {item.count.toLocaleString('fa-IR')}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'info' ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>مشخصات دستگاه</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="grid gap-x-8 sm:grid-cols-2">
                <InfoRow label="نوع تجهیز">{device.equipmentType.label}</InfoRow>
                <InfoRow label="سازنده">{device.manufacturer?.label ?? '—'}</InfoRow>
                <InfoRow label="مدل">{device.model || '—'}</InfoRow>
                <InfoRow label="شماره سریال">
                  <span dir="ltr">{device.serialNumber || '—'}</span>
                </InfoRow>
                <InfoRow label="IMEI 1">
                  <span dir="ltr">{device.imei1 || '—'}</span>
                </InfoRow>
                <InfoRow label="IMEI 2">
                  <span dir="ltr">{device.imei2 || '—'}</span>
                </InfoRow>
                <InfoRow label="وضعیت قفل">{device.lockStatus.label}</InfoRow>
                <InfoRow label="لوازم همراه">{accessories.length > 0 ? accessories.join('، ') : '—'}</InfoRow>
                <InfoRow label="وضعیت ظاهری">{device.physicalCondition || '—'}</InfoRow>
                <InfoRow label="مشکل اعلام‌شده">{device.reportedProblem}</InfoRow>
                {device.notes ? <InfoRow label="توضیحات">{device.notes}</InfoRow> : null}
                {customFieldDefs.map((field) => (
                  <InfoRow key={field.id} label={field.label}>
                    {customFieldValue(field, device.customFields[field.key])}
                  </InfoRow>
                ))}
                <InfoRow label="رمز دستگاه">
                  {device.hasPassword ? (
                    password ? (
                      <span className="inline-flex items-center gap-2">
                        <code className="rounded bg-ink-100 px-2 py-1 text-xs" dir="ltr">
                          {password}
                        </code>
                        <Button variant="ghost" size="sm" onClick={() => setPassword(null)}>
                          پنهان کردن
                        </Button>
                      </span>
                    ) : canManage ? (
                      <Button variant="outline" size="sm" loading={passwordLoading} onClick={() => void revealPassword()}>
                        <Eye className="size-4" />
                        نمایش رمز دستگاه
                      </Button>
                    ) : (
                      <span className="text-xs text-ink-500">ثبت شده (نیازمند مجوز مدیریت)</span>
                    )
                  ) : (
                    'ثبت نشده'
                  )}
                </InfoRow>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>مالک و آورنده</CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                    <UserRound className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink-800">{device.owner.fullName}</p>
                    <p className="text-xs text-ink-500" dir="ltr">
                      {device.owner.phone || 'بدون شماره'}
                    </p>
                  </div>
                </div>
                <InfoRow label="شغل مالک">{device.owner.jobTitle || '—'}</InfoRow>
                <InfoRow label="نام آورنده">{device.broughtBy.name}</InfoRow>
                <InfoRow label="تلفن آورنده">
                  <span dir="ltr">{device.broughtBy.phone || '—'}</span>
                </InfoRow>
                <InfoRow label="شغل آورنده">{device.broughtBy.job || '—'}</InfoRow>
                <InfoRow label="تکنسین مسئول">{device.technician?.fullName ?? 'تعیین نشده'}</InfoRow>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>زمان‌ها</CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <InfoRow label="زمان دریافت">{formatJalaliDateTime(device.receivedAt)}</InfoRow>
                <InfoRow label="تحویل پیش‌بینی‌شده">
                  {device.dueAt ? formatJalaliDateTime(device.dueAt) : '—'}
                </InfoRow>
                <InfoRow label="تحویل واقعی">
                  {device.deliveredAt ? formatJalaliDateTime(device.deliveredAt) : '—'}
                </InfoRow>
                <InfoRow label="آخرین تغییر وضعیت">{formatJalaliDateTime(device.statusChangedAt)}</InfoRow>
                <InfoRow label="ثبت‌کننده پرونده">{device.createdByName ?? '—'}</InfoRow>
                <InfoRow label="تاریخ ثبت">{formatJalaliDateTime(device.createdAt)}</InfoRow>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === 'status' ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>تاریخچه وضعیت</CardTitle>
              <p className="mt-1 text-xs text-ink-400">
                هر تغییر وضعیت با زمان، کاربر و توضیح به‌صورت دائمی ثبت می‌شود.
              </p>
            </div>
            {canManage ? (
              <Button variant="outline" onClick={() => setStatusOpen(true)}>
                <RefreshCw className="size-4" />
                تغییر وضعیت
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            {device.statusHistory.length === 0 ? (
              <EmptyState title="تاریخچه‌ای ثبت نشده است" />
            ) : (
              <ol className="relative space-y-4 border-s border-ink-200 ps-5">
                {device.statusHistory.map((entry) => (
                  <li key={entry.id} className="relative">
                    <span className="absolute -start-[25px] top-1.5 size-3 rounded-full border-2 border-white bg-brand-500" />
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={statusBadgeVariant(
                        DEVICE_STATUS_OPTIONS.find((item) => item.key === entry.toStatus.key)?.tone ?? 'neutral',
                      )}>
                        {entry.toStatus.label}
                      </Badge>
                      {entry.fromStatus ? (
                        <span className="text-[11px] text-ink-400">از «{entry.fromStatus.label}»</span>
                      ) : null}
                      <span className="text-[11px] text-ink-400">{formatJalaliDateTime(entry.changedAt)}</span>
                      {entry.changedByName ? (
                        <span className="text-[11px] text-ink-400">— {entry.changedByName}</span>
                      ) : null}
                    </div>
                    {entry.note ? <p className="mt-1 text-xs leading-6 text-ink-600">{entry.note}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === 'operations' ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>اقدامات انجام‌شده</CardTitle>
              <p className="mt-1 text-xs text-ink-400">
                بکاپ، ریکاوری، تعمیر و سایر عملیات این دستگاه را ثبت و پیگیری کنید.
              </p>
            </div>
            {canManage ? (
              <Button
                onClick={() => {
                  setEditingOperationId(null);
                  setOperationOpen(true);
                }}
              >
                <Plus className="size-4" />
                ثبت اقدام
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="p-0 pt-4">
            {device.operations.length === 0 ? (
              <EmptyState
                icon={<HardDrive className="size-6" />}
                title="اقدامی ثبت نشده است"
                description="پس از انجام هر عملیات، جزئیات آن را برای پیگیری در پرونده ثبت کنید."
              />
            ) : (
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>نوع / عنوان</TableHead>
                    <TableHead>تاریخ</TableHead>
                    <TableHead>تکنسین</TableHead>
                    <TableHead>حجم داده</TableHead>
                    <TableHead>محل ذخیره</TableHead>
                    <TableHead>نتیجه</TableHead>
                    {canManage ? <TableHead className="text-end">عملیات</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {device.operations.map((operation) => (
                    <TableRow key={operation.id}>
                      <TableCell>
                        <Badge variant="brand">{operation.operationType.label}</Badge>
                        <p className="mt-1 text-xs font-medium text-ink-800">{operation.title}</p>
                        {operation.description ? (
                          <p className="mt-0.5 max-w-[280px] text-[11px] leading-5 text-ink-500">
                            {operation.description}
                          </p>
                        ) : null}
                        {operation.deviceStatusAfter ? (
                          <p className="mt-0.5 text-[11px] text-ink-400">
                            وضعیت پس از اقدام: {operation.deviceStatusAfter.label}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-ink-500">
                        {formatJalaliDateTime(operation.performedAt)}
                      </TableCell>
                      <TableCell className="text-xs text-ink-600">
                        {operation.technicianName ?? '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-ink-500">
                        {operation.dataSizeBytes ? formatBytes(operation.dataSizeBytes) : '—'}
                      </TableCell>
                      <TableCell className="max-w-[220px] text-xs text-ink-500">
                        {operation.storagePath ? (
                          <button
                            type="button"
                            onClick={() => void copyPath(operation.storagePath as string)}
                            className="inline-flex items-center gap-1 break-all text-start hover:text-ink-800"
                            dir="ltr"
                          >
                            <Copy className="size-3 shrink-0" />
                            {operation.storagePath}
                          </button>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            operation.result.key === 'success'
                              ? 'success'
                              : operation.result.key === 'partial'
                                ? 'warning'
                                : 'danger'
                          }
                        >
                          {operation.result.label}
                        </Badge>
                      </TableCell>
                      {canManage ? (
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="ویرایش اقدام"
                              onClick={() => {
                                setEditingOperationId(operation.id);
                                setOperationOpen(true);
                              }}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="حذف اقدام"
                              onClick={() =>
                                setPendingDelete({ kind: 'operation', id: operation.id, title: operation.title })
                              }
                            >
                              <Trash2 className="size-4 text-rose-600" />
                            </Button>
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === 'files' ? (
        <Card>
          <CardHeader className="flex-wrap">
            <div>
              <CardTitle>پرونده فایل، بکاپ و مسیرهای ذخیره‌سازی</CardTitle>
              <p className="mt-1 text-xs text-ink-400">
                پوشه اختصاصی دستگاه، بکاپ‌ها، فایل‌های ریکاوری و سالم بودن مسیرها را مدیریت کنید.
              </p>
            </div>
            {canManageFiles ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void provisionFolder()} loading={provisioning}>
                  <FolderPlus className="size-4" />
                  {primaryFile ? 'بازسازی / بررسی پوشه' : 'ایجاد پوشه دستگاه'}
                </Button>
                <Button
                  onClick={() => {
                    setEditingFileId(null);
                    setFileOpen(true);
                  }}
                >
                  <Plus className="size-4" />
                  ثبت مسیر فایل
                </Button>
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="p-0 pt-4">
            {device.storageSummary ? (
              <div className="mx-5 mb-4 grid gap-2 rounded-xl bg-ink-50/70 p-3 sm:grid-cols-4">
                <div className="rounded-lg bg-white px-3 py-2">
                  <p className="text-[11px] text-ink-400">تعداد مسیرها</p>
                  <p className="text-sm font-semibold text-ink-800">
                    {formatNumber(device.storageSummary.filesTotal)}
                  </p>
                </div>
                <div className="rounded-lg bg-white px-3 py-2">
                  <p className="text-[11px] text-ink-400">حجم ثبت‌شده</p>
                  <p className="text-sm font-semibold text-ink-800">
                    {formatBytes(device.storageSummary.totalBytes)}
                  </p>
                </div>
                <div className="rounded-lg bg-white px-3 py-2">
                  <p className="text-[11px] text-ink-400">مسیرهای دارای هشدار</p>
                  <p className="text-sm font-semibold text-ink-800">
                    {formatNumber(device.storageSummary.unavailableCount)}
                  </p>
                </div>
                <div className="rounded-lg bg-white px-3 py-2">
                  <p className="text-[11px] text-ink-400">آخرین بررسی</p>
                  <p className="text-sm font-semibold text-ink-800">
                    {device.storageSummary.lastCheckedAt
                      ? formatJalaliDateTime(device.storageSummary.lastCheckedAt)
                      : '—'}
                  </p>
                </div>
              </div>
            ) : null}

            {primaryFile ? (
              <div className="mx-5 mb-4 rounded-xl border border-brand-100 bg-brand-50/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <FolderOpen className="size-4 text-brand-600" />
                      <span className="text-sm font-semibold text-ink-900">پوشه اختصاصی دستگاه</span>
                      <Badge variant={accessStatusVariant(primaryFile.accessStatus)}>
                        {accessStatusLabel(primaryFile.accessStatus)}
                      </Badge>
                      {primaryFile.storageLocation ? (
                        <Badge>{primaryFile.storageLocation.name}</Badge>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      dir="ltr"
                      onClick={() => void copyPath(primaryFile.clientPath ?? primaryFile.path)}
                      className="mt-2 inline-flex items-start gap-1 break-all text-start text-xs text-brand-700 hover:underline"
                    >
                      <Copy className="mt-0.5 size-3 shrink-0" />
                      {primaryFile.clientPath ?? primaryFile.path}
                    </button>
                    {primaryFile.clientPath ? (
                      <p className="mt-1 break-all text-[11px] text-ink-400" dir="ltr">
                        {primaryFile.path}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void openFolder(primaryFile)}
                      loading={fileBusy === `open-${primaryFile.id}`}
                    >
                      <FolderOpen className="size-4" />
                      بازکردن پوشه
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void checkFileAccess(primaryFile)}
                      loading={fileBusy === `check-${primaryFile.id}`}
                    >
                      <RefreshCw className="size-4" />
                      بررسی دسترسی
                    </Button>
                  </div>
                </div>
              </div>
            ) : canManageFiles ? (
              <div className="mx-5 mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-800">
                پوشه اختصاصی این دستگاه ساخته نشده است. با دکمه «ایجاد پوشه دستگاه» مسیر سال/کد پذیرش
                و زیرپوشه‌های پیش‌فرض ساخته می‌شوند.
              </div>
            ) : null}

            {device.files.length === 0 ? (
              <EmptyState
                icon={<FileText className="size-6" />}
                title="مسیر فایلی ثبت نشده است"
                description="پس از بکاپ‌گیری، مسیر فایل‌ها را ثبت کنید تا در تحویل دستگاه قابل پیگیری باشد."
              />
            ) : (
              <Table className="min-w-[1060px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>عنوان</TableHead>
                    <TableHead>دسته</TableHead>
                    <TableHead>مسیر</TableHead>
                    <TableHead>حجم</TableHead>
                    <TableHead>بکاپ</TableHead>
                    <TableHead>دسترسی</TableHead>
                    <TableHead>اقدام مرتبط</TableHead>
                    {canFiles ? <TableHead className="text-end">عملیات</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {device.files.map((file) => (
                    <TableRow key={file.id}>
                      <TableCell className="text-xs font-medium text-ink-800">
                        <div className="flex items-center gap-1.5">
                          {file.label}
                          {file.isPrimary ? <Badge variant="brand">اصلی</Badge> : null}
                        </div>
                        {file.notes ? (
                          <p className="mt-0.5 text-[11px] text-ink-500">{file.notes}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-ink-500">
                        {folderCategoryLabel(file.category)}
                      </TableCell>
                      <TableCell className="max-w-[280px] text-xs">
                        <button
                          type="button"
                          onClick={() => void copyPath(file.clientPath ?? file.path)}
                          className="inline-flex items-center gap-1 break-all text-start text-brand-700 hover:underline"
                          dir="ltr"
                        >
                          <Copy className="size-3 shrink-0" />
                          {file.clientPath ?? file.path}
                        </button>
                        {file.alternativePath ? (
                          <p className="mt-1 break-all text-[10px] text-ink-400" dir="ltr">
                            جایگزین: {file.alternativePath}
                          </p>
                        ) : null}
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
                        {file.lastCheckedAt ? (
                          <p className="mt-1 whitespace-nowrap text-[10px] text-ink-400">
                            {formatJalaliDate(file.lastCheckedAt)}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs text-ink-500">
                        {file.relatedOperationTitle ?? '—'}
                      </TableCell>
                      {canFiles ? (
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="بازکردن پوشه"
                              onClick={() => void openFolder(file)}
                              loading={fileBusy === `open-${file.id}`}
                            >
                              <FolderOpen className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="بررسی دسترسی"
                              onClick={() => void checkFileAccess(file)}
                              loading={fileBusy === `check-${file.id}`}
                            >
                              <RefreshCw className="size-4" />
                            </Button>
                            {canManageFiles ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="ویرایش مسیر فایل"
                                  onClick={() => {
                                    setEditingFileId(file.id);
                                    setFileOpen(true);
                                  }}
                                >
                                  <Pencil className="size-4" />
                                </Button>
                                {!file.isPrimary ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="حذف مسیر فایل"
                                    onClick={() =>
                                      setPendingDelete({ kind: 'file', id: file.id, title: file.label })
                                    }
                                  >
                                    <Trash2 className="size-4 text-rose-600" />
                                  </Button>
                                ) : null}
                              </>
                            ) : null}
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <p className="border-t border-ink-100 px-5 py-3 text-[11px] leading-6 text-ink-400">
              مسیر شبکه‌ای ثبت‌شده در محل ذخیره‌سازی مرجع است. برای بازکردن پوشه، برنامه کمکی ویندوز
              روی کلاینت باید نصب شده باشد؛ مسیر را می‌توانید با کلیک روی آن کپی کنید.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {tab === 'images' ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>تصاویر دستگاه</CardTitle>
              <p className="mt-1 text-xs text-ink-400">
                تصویر وضعیت ظاهری دستگاه در زمان پذیرش یا مراحل تعمیر را ثبت کنید (حداکثر ۶ مگابایت).
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {canManageFiles ? (
              <div className="flex flex-wrap items-end gap-3 rounded-xl bg-ink-50 p-3">
                <div className="min-w-[220px] flex-1">
                  <Label htmlFor="image-file">انتخاب تصویر</Label>
                  <Input
                    id="image-file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="mt-1.5 h-auto py-2"
                    onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
                  />
                </div>
                <div className="min-w-[200px] flex-1">
                  <Label htmlFor="image-caption">توضیح تصویر</Label>
                  <Input
                    id="image-caption"
                    value={imageCaption}
                    onChange={(event) => setImageCaption(event.target.value)}
                    className="mt-1.5"
                    placeholder="مثلاً وضعیت صفحه قبل از تعمیر"
                  />
                </div>
                <Button onClick={() => void uploadImage()} loading={imageUploading}>
                  <ImagePlus className="size-4" />
                  بارگذاری تصویر
                </Button>
              </div>
            ) : null}

            {device.images.length === 0 ? (
              <EmptyState
                icon={<Images className="size-6" />}
                title="تصویری ثبت نشده است"
                description="برای مستندسازی وضعیت دستگاه، تصاویر آن را بارگذاری کنید."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {device.images.map((image) => (
                  <AuthenticatedImage
                    key={image.id}
                    image={image}
                    canManage={canManageFiles}
                    onDelete={() => setPendingDelete({ kind: 'image', id: image.id, title: image.originalName })}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === 'notes' ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>یادداشت‌های تکنسین</CardTitle>
              <p className="mt-1 text-xs text-ink-400">
                نکات فنی و مشاهدات تعمیر را ثبت کنید؛ یادداشت‌ها با نام و زمان ثبت می‌شوند.
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {canManage ? (
              <div>
                <Label htmlFor="note-body">یادداشت جدید</Label>
                <Textarea
                  id="note-body"
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  className="mt-1.5"
                  rows={3}
                  placeholder="مثلاً برد اصلی سالم است و مشکل از ال‌سی‌دی است."
                />
                <div className="mt-2 flex justify-end">
                  <Button onClick={() => void addNote()} loading={noteSaving} disabled={!noteText.trim()}>
                    <StickyNote className="size-4" />
                    ثبت یادداشت
                  </Button>
                </div>
              </div>
            ) : null}

            {device.technicianNotes.length === 0 ? (
              <EmptyState title="یادداشتی ثبت نشده است" />
            ) : (
              <ul className="space-y-3">
                {device.technicianNotes.map((note) => (
                  <li key={note.id} className="rounded-xl border border-ink-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="whitespace-pre-wrap text-sm leading-6 text-ink-700">{note.body}</p>
                      {canManage ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="حذف یادداشت"
                          onClick={() => setPendingDelete({ kind: 'note', id: note.id, title: 'یادداشت' })}
                        >
                          <Trash2 className="size-4 text-rose-600" />
                        </Button>
                      ) : null}
                    </div>
                    <p className="mt-2 text-[11px] text-ink-400">
                      {note.createdByName ?? '—'} — {formatJalaliDateTime(note.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      <StatusChangeDialog
        open={statusOpen}
        onOpenChange={setStatusOpen}
        device={device}
        onChanged={(updated) => setDevice(updated)}
      />

      <OperationDialog
        open={operationOpen}
        onOpenChange={(open) => {
          setOperationOpen(open);
          if (!open) setEditingOperationId(null);
        }}
        deviceId={device.id}
        operation={editingOperation}
        operationTypes={configQuery.data?.options.operation_type ?? []}
        technicians={configQuery.data?.technicians ?? []}
        onSaved={(updated) => setDevice(updated)}
      />

      <FilePathDialog
        open={fileOpen}
        onOpenChange={(open) => {
          setFileOpen(open);
          if (!open) setEditingFileId(null);
        }}
        deviceId={device.id}
        file={editingFile}
        operations={device.operations}
        locations={locations}
        onSaved={(updated) => setDevice(updated)}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="حذف مورد"
        description={
          pendingDelete
            ? `«${pendingDelete.title}» حذف می‌شود. این عملیات در تاریخچه سامانه ثبت می‌گردد.`
            : ''
        }
        confirmLabel="حذف"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
