import { useEffect, useState, type FormEvent } from 'react';
import { DatabaseBackup, Download, HardDriveDownload, Save, ShieldCheck, Store } from 'lucide-react';
import { api, downloadFile } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useApiQuery } from '@/lib/use-api';
import { usePermissions } from '@/lib/use-permissions';
import { formatJalaliDateTime } from '@/lib/jalali';
import { formatBytes } from '@/lib/format';
import type { AppSettings, BackupFile, BackupStatus } from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, FieldHint, Label } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { DeviceConfigSection } from './device-config-section';

interface SettingsFormState {
  workshopName: string;
  workshopAddress: string;
  workshopPhone: string;
  idleTimeoutMinutes: string;
  maxFailedLogins: string;
  lockoutMinutes: string;
  sessionDays: string;
  backupRetentionCount: string;
}

const EMPTY_FORM: SettingsFormState = {
  workshopName: '',
  workshopAddress: '',
  workshopPhone: '',
  idleTimeoutMinutes: '10',
  maxFailedLogins: '5',
  lockoutMinutes: '15',
  sessionDays: '7',
  backupRetentionCount: '14',
};

export function SettingsPage() {
  const { can } = usePermissions();
  const canManage = can('settings.manage');
  const canBackup = can('backups.manage');
  const toast = useToast();

  const settingsQuery = useApiQuery<AppSettings>(() => api.get<AppSettings>('/api/settings'), []);
  const [form, setForm] = useState<SettingsFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settingsQuery.data) return;
    const data = settingsQuery.data;
    setForm({
      workshopName: data.workshop.name,
      workshopAddress: data.workshop.address,
      workshopPhone: data.workshop.phone,
      idleTimeoutMinutes: String(data.security.idleTimeoutMinutes),
      maxFailedLogins: String(data.security.maxFailedLogins),
      lockoutMinutes: String(data.security.lockoutMinutes),
      sessionDays: String(data.security.sessionDays),
      backupRetentionCount: String(data.backup.retentionCount),
    });
  }, [settingsQuery.data]);

  function update<K extends keyof SettingsFormState>(field: K, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canManage || saving) return;

    const numericFields: Array<[keyof SettingsFormState, number, number, string]> = [
      ['idleTimeoutMinutes', 2, 240, 'مدت قفل خودکار باید بین ۲ تا ۲۴۰ دقیقه باشد.'],
      ['maxFailedLogins', 3, 20, 'تعداد تلاش ناموفق باید بین ۳ تا ۲۰ باشد.'],
      ['lockoutMinutes', 1, 1440, 'مدت قفل حساب باید بین ۱ تا ۱۴۴۰ دقیقه باشد.'],
      ['sessionDays', 1, 30, 'مدت اعتبار نشست باید بین ۱ تا ۳۰ روز باشد.'],
      ['backupRetentionCount', 1, 365, 'تعداد نسخه‌های پشتیبان باید بین ۱ تا ۳۶۵ باشد.'],
    ];
    for (const [field, min, max, message] of numericFields) {
      const value = Number(form[field]);
      if (!Number.isInteger(value) || value < min || value > max) {
        toast.error(message);
        return;
      }
    }

    setSaving(true);
    try {
      await api.patch('/api/settings', {
        workshopName: form.workshopName.trim(),
        workshopAddress: form.workshopAddress.trim(),
        workshopPhone: form.workshopPhone.trim(),
        idleTimeoutMinutes: Number(form.idleTimeoutMinutes),
        maxFailedLogins: Number(form.maxFailedLogins),
        lockoutMinutes: Number(form.lockoutMinutes),
        sessionDays: Number(form.sessionDays),
        backupRetentionCount: Number(form.backupRetentionCount),
      });
      toast.success('تنظیمات ذخیره شد.');
      await settingsQuery.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="تنظیمات سامانه"
        description="اطلاعات کارگاه، سیاست‌های امنیتی و پشتیبان‌گیری را مدیریت کنید."
      />

      {settingsQuery.loading && !settingsQuery.data ? <Spinner label="در حال دریافت تنظیمات..." /> : null}

      {settingsQuery.error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {settingsQuery.error}
        </div>
      ) : null}

      {settingsQuery.data ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Store className="size-4" />
                  </span>
                  <div>
                    <CardTitle>اطلاعات کارگاه</CardTitle>
                    <p className="mt-0.5 text-xs text-ink-400">در سربرگ و صفحه ورود نمایش داده می‌شود</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="workshop-name">نام کارگاه</Label>
                  <Input
                    id="workshop-name"
                    value={form.workshopName}
                    onChange={(event) => update('workshopName', event.target.value)}
                    className="mt-1.5"
                    disabled={!canManage}
                    placeholder="مثلاً تعمیرگاه موبایل پارس"
                  />
                </div>
                <div>
                  <Label htmlFor="workshop-phone">شماره تماس</Label>
                  <Input
                    id="workshop-phone"
                    value={form.workshopPhone}
                    onChange={(event) => update('workshopPhone', event.target.value)}
                    className="mt-1.5"
                    dir="ltr"
                    disabled={!canManage}
                    placeholder="021-12345678"
                  />
                </div>
                <div>
                  <Label htmlFor="workshop-address">آدرس</Label>
                  <Textarea
                    id="workshop-address"
                    value={form.workshopAddress}
                    onChange={(event) => update('workshopAddress', event.target.value)}
                    className="mt-1.5"
                    rows={3}
                    disabled={!canManage}
                    placeholder="نشانی کارگاه"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <ShieldCheck className="size-4" />
                  </span>
                  <div>
                    <CardTitle>سیاست‌های امنیتی</CardTitle>
                    <p className="mt-0.5 text-xs text-ink-400">اعمال فوری برای همه کاربران</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="idle-timeout">قفل خودکار پس از بی‌کاری (دقیقه)</Label>
                  <Input
                    id="idle-timeout"
                    type="number"
                    min={2}
                    max={240}
                    value={form.idleTimeoutMinutes}
                    onChange={(event) => update('idleTimeoutMinutes', event.target.value)}
                    className="mt-1.5"
                    dir="ltr"
                    disabled={!canManage}
                  />
                </div>
                <div>
                  <Label htmlFor="max-failed">حداکثر تلاش ناموفق ورود</Label>
                  <Input
                    id="max-failed"
                    type="number"
                    min={3}
                    max={20}
                    value={form.maxFailedLogins}
                    onChange={(event) => update('maxFailedLogins', event.target.value)}
                    className="mt-1.5"
                    dir="ltr"
                    disabled={!canManage}
                  />
                </div>
                <div>
                  <Label htmlFor="lockout">مدت قفل حساب (دقیقه)</Label>
                  <Input
                    id="lockout"
                    type="number"
                    min={1}
                    max={1440}
                    value={form.lockoutMinutes}
                    onChange={(event) => update('lockoutMinutes', event.target.value)}
                    className="mt-1.5"
                    dir="ltr"
                    disabled={!canManage}
                  />
                </div>
                <div>
                  <Label htmlFor="session-days">اعتبار نشست (روز)</Label>
                  <Input
                    id="session-days"
                    type="number"
                    min={1}
                    max={30}
                    value={form.sessionDays}
                    onChange={(event) => update('sessionDays', event.target.value)}
                    className="mt-1.5"
                    dir="ltr"
                    disabled={!canManage}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="retention">تعداد نسخه‌های پشتیبان نگهداری‌شده</Label>
                  <Input
                    id="retention"
                    type="number"
                    min={1}
                    max={365}
                    value={form.backupRetentionCount}
                    onChange={(event) => update('backupRetentionCount', event.target.value)}
                    className="mt-1.5"
                    dir="ltr"
                    disabled={!canManage}
                  />
                  <FieldHint>
                    نسخه‌های قدیمی‌تر از این تعداد، پس از هر پشتیبان‌گیری موفق حذف می‌شوند.
                  </FieldHint>
                </div>
              </CardContent>
            </Card>
          </div>

          {canManage ? (
            <div className="flex justify-end">
              <Button type="submit" loading={saving}>
                <Save className="size-4" />
                ذخیره تنظیمات
              </Button>
            </div>
          ) : (
            <p className="text-xs text-ink-400">شما فقط اجازه مشاهده تنظیمات را دارید.</p>
          )}
        </form>
      ) : null}

      {canBackup ? <BackupsSection /> : null}

      <div className="mt-4">
        <DeviceConfigSection canManage={canManage} />
      </div>
    </div>
  );
}

function BackupsSection() {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const backupsQuery = useApiQuery<{ items: BackupFile[]; status: BackupStatus }>(
    () => api.get<{ items: BackupFile[]; status: BackupStatus }>('/api/backups'),
    [],
  );

  async function createBackup() {
    setCreating(true);
    try {
      await api.post<BackupFile>('/api/backups');
      toast.success('نسخه پشتیبان با موفقیت ایجاد شد.');
      await backupsQuery.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setCreating(false);
    }
  }

  async function handleDownload(file: BackupFile) {
    setDownloading(file.name);
    try {
      await downloadFile(`/api/backups/${encodeURIComponent(file.name)}/download`, file.name);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDownloading(null);
    }
  }

  const status = backupsQuery.data?.status;
  const files = backupsQuery.data?.items ?? [];

  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <DatabaseBackup className="size-4" />
            </span>
            <div>
              <CardTitle>پشتیبان‌گیری پایگاه داده</CardTitle>
              <p className="mt-0.5 text-xs text-ink-400">
                پشتیبان‌گیری روزانه ساعت ۳ بامداد به‌صورت خودکار انجام می‌شود.
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => void createBackup()} loading={creating}>
            <HardDriveDownload className="size-4" />
            پشتیبان‌گیری همین حالا
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {status ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant={status.pgDumpAvailable ? 'success' : 'danger'}>
              {status.pgDumpAvailable ? 'ابزار pg_dump در دسترس است' : 'ابزار pg_dump پیدا نشد'}
            </Badge>
            <Badge variant={status.scheduledEnabled ? 'brand' : 'warning'}>
              {status.scheduledEnabled ? 'پشتیبان‌گیری خودکار فعال' : 'پشتیبان‌گیری خودکار غیرفعال'}
            </Badge>
            <Badge>نگهداری {status.retentionCount} نسخه</Badge>
            <span className="text-ink-400" dir="ltr">
              {status.pgDumpVersion ?? ''}
            </span>
          </div>
        ) : null}

        {!status?.pgDumpAvailable && status ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-800">
            برنامه PostgreSQL روی سرور باید نصب باشد تا پشتیبان‌گیری انجام شود. اگر pg_dump در مسیر
            پیش‌فرض نیست، مسیر آن را در فایل تنظیمات سرور (PG_DUMP_PATH) مشخص کنید.
          </div>
        ) : null}

        {backupsQuery.loading && !backupsQuery.data ? <Spinner label="در حال دریافت نسخه‌های پشتیبان..." /> : null}

        {backupsQuery.error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {backupsQuery.error}
          </div>
        ) : null}

        {backupsQuery.data && files.length === 0 ? (
          <EmptyState
            icon={<DatabaseBackup className="size-6" />}
            title="نسخه پشتیبانی وجود ندارد"
            description="با دکمه «پشتیبان‌گیری همین حالا» اولین نسخه پشتیبان را بسازید."
          />
        ) : null}

        {files.length > 0 ? (
          <Table className="min-w-[520px]">
            <TableHeader>
              <TableRow>
                <TableHead>نام فایل</TableHead>
                <TableHead>تاریخ ایجاد</TableHead>
                <TableHead>حجم</TableHead>
                <TableHead className="text-end">دانلود</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => (
                <TableRow key={file.name}>
                  <TableCell className="text-xs" dir="ltr">
                    {file.name}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-ink-500">
                    {formatJalaliDateTime(file.createdAt)}
                  </TableCell>
                  <TableCell className="text-xs text-ink-500">{formatBytes(file.sizeBytes)}</TableCell>
                  <TableCell className="text-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleDownload(file)}
                      loading={downloading === file.name}
                    >
                      <Download className="size-4" />
                      دانلود
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}

        <p className="text-[11px] leading-6 text-ink-400">
          بازیابی نسخه پشتیبان توسط مدیر سرور و با دستور
          <code className="mx-1 rounded bg-ink-100 px-1 py-0.5" dir="ltr">
            pg_restore
          </code>
          انجام می‌شود. پیش از بازیابی، از نسخه فعلی نیز پشتیبان بگیرید.
        </p>
      </CardContent>
    </Card>
  );
}
