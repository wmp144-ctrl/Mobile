import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  DatabaseBackup,
  Download,
  HardDrive,
  HardDriveDownload,
  ImageIcon,
  Lock,
  Palette,
  RotateCcw,
  Save,
  ShieldCheck,
  Store,
} from 'lucide-react';
import { api, downloadFile } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useApiQuery } from '@/lib/use-api';
import { usePermissions } from '@/lib/use-permissions';
import { formatJalaliDateTime } from '@/lib/jalali';
import { formatBytes } from '@/lib/format';
import type {
  AppSettings,
  BackupFile,
  BackupList,
  RestoreResult,
  StorageLocation,
} from '@/lib/types';
import { useAppearance } from '@/stores/appearance';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, FieldHint, Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { DeviceConfigSection } from './device-config-section';

interface SettingsFormState {
  workshopName: string;
  workshopAddress: string;
  workshopPhone: string;
  workshopLogo: string;
  idleTimeoutMinutes: string;
  maxFailedLogins: string;
  lockoutMinutes: string;
  sessionDays: string;
  backupRetentionCount: string;
  backupDirectory: string;
  backupScheduleTime: string;
  scheduleEnabled: boolean;
  encrypt: boolean;
  includeSettings: boolean;
  includeFiles: boolean;
  language: 'fa' | 'en';
  calendar: 'jalali' | 'gregorian';
  timezone: string;
  timeFormat: '24' | '12';
  theme: 'light' | 'dark' | 'system';
  accentColor: 'blue' | 'navy' | 'teal' | 'violet' | 'emerald';
}

const EMPTY_FORM: SettingsFormState = {
  workshopName: '',
  workshopAddress: '',
  workshopPhone: '',
  workshopLogo: '',
  idleTimeoutMinutes: '10',
  maxFailedLogins: '5',
  lockoutMinutes: '15',
  sessionDays: '7',
  backupRetentionCount: '14',
  backupDirectory: '',
  backupScheduleTime: '03:00',
  scheduleEnabled: true,
  encrypt: true,
  includeSettings: true,
  includeFiles: false,
  language: 'fa',
  calendar: 'jalali',
  timezone: 'Asia/Tehran',
  timeFormat: '24',
  theme: 'light',
  accentColor: 'blue',
};

const TIMEZONES = [
  { value: 'Asia/Tehran', label: 'تهران (Asia/Tehran)' },
  { value: 'Asia/Dubai', label: 'دبی (Asia/Dubai)' },
  { value: 'Asia/Istanbul', label: 'استانبول (Asia/Istanbul)' },
  { value: 'Europe/Berlin', label: 'برلین (Europe/Berlin)' },
  { value: 'Europe/London', label: 'لندن (Europe/London)' },
  { value: 'America/New_York', label: 'نیویورک (America/New_York)' },
  { value: 'UTC', label: 'UTC' },
];

const ACCENT_OPTIONS: { value: SettingsFormState['accentColor']; label: string; color: string }[] = [
  { value: 'blue', label: 'آبی', color: '#2c46d4' },
  { value: 'navy', label: 'سرمه‌ای', color: '#234779' },
  { value: 'teal', label: 'فیروزه‌ای', color: '#0c8670' },
  { value: 'violet', label: 'بنفش', color: '#6336d6' },
  { value: 'emerald', label: 'سبز', color: '#059256' },
];

const LOGO_MAX_DATA_URL = 70000;

function resizeLogo(file: File): Promise<string> {
  if (!file.type.match(/^image\/(png|jpeg|webp)$/)) {
    return Promise.reject(new Error('لوگو باید تصویر PNG، JPEG یا WebP باشد.'));
  }
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      const size = 256;
      const scale = Math.min(1, size / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('پردازش تصویر لوگو در مرورگر ممکن نشد.'));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let dataUrl = canvas.toDataURL('image/png');
      if (dataUrl.length > LOGO_MAX_DATA_URL) {
        dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      }
      URL.revokeObjectURL(objectUrl);
      if (dataUrl.length > LOGO_MAX_DATA_URL) {
        reject(new Error('حجم لوگو زیاد است؛ تصویری ساده‌تر با ابعاد کوچک‌تر انتخاب کنید.'));
        return;
      }
      resolve(dataUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('تصویر لوگو قابل خواندن نیست.'));
    };
    image.src = objectUrl;
  });
}

export function SettingsPage() {
  const { can } = usePermissions();
  const canManage = can('settings.manage');
  const canBackup = can('backups.manage');
  const canViewFiles = can('files.view');
  const canManageFiles = can('files.manage');
  const toast = useToast();

  const settingsQuery = useApiQuery<AppSettings>(() => api.get<AppSettings>('/api/settings'), []);
  const [form, setForm] = useState<SettingsFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!settingsQuery.data) return;
    const data = settingsQuery.data;
    setForm({
      workshopName: data.workshop.name,
      workshopAddress: data.workshop.address,
      workshopPhone: data.workshop.phone,
      workshopLogo: data.workshop.logo,
      idleTimeoutMinutes: String(data.security.idleTimeoutMinutes),
      maxFailedLogins: String(data.security.maxFailedLogins),
      lockoutMinutes: String(data.security.lockoutMinutes),
      sessionDays: String(data.security.sessionDays),
      backupRetentionCount: String(data.backup.retentionCount),
      backupDirectory: data.backup.directory,
      backupScheduleTime: data.backup.scheduleTime,
      scheduleEnabled: data.backup.scheduleEnabled,
      encrypt: data.backup.encrypt,
      includeSettings: data.backup.includeSettings,
      includeFiles: data.backup.includeFiles,
      language: data.appearance.language,
      calendar: data.appearance.calendar,
      timezone: data.appearance.timezone,
      timeFormat: data.appearance.timeFormat,
      theme: data.appearance.theme,
      accentColor: data.appearance.accentColor,
    });
  }, [settingsQuery.data]);

  function update<K extends keyof SettingsFormState>(field: K, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  function toggleSetting(field: 'scheduleEnabled' | 'encrypt' | 'includeSettings' | 'includeFiles', value: boolean) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function handleLogoChange(file: File | undefined) {
    if (!file) return;
    try {
      const logo = await resizeLogo(file);
      update('workshopLogo', logo);
      toast.success('لوگو انتخاب شد؛ با ذخیره تنظیمات اعمال می‌شود.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
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

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.backupScheduleTime)) {
      toast.error('ساعت پشتیبان‌گیری خودکار باید به قالب HH:MM باشد.');
      return;
    }

    setSaving(true);
    try {
      await api.patch('/api/settings', {
        workshopName: form.workshopName.trim(),
        workshopAddress: form.workshopAddress.trim(),
        workshopPhone: form.workshopPhone.trim(),
        workshopLogo: form.workshopLogo,
        idleTimeoutMinutes: Number(form.idleTimeoutMinutes),
        maxFailedLogins: Number(form.maxFailedLogins),
        lockoutMinutes: Number(form.lockoutMinutes),
        sessionDays: Number(form.sessionDays),
        backupRetentionCount: Number(form.backupRetentionCount),
        backupDirectory: form.backupDirectory.trim(),
        backupScheduleTime: form.backupScheduleTime,
        backupScheduleEnabled: form.scheduleEnabled,
        backupEncrypt: form.encrypt,
        backupIncludeSettings: form.includeSettings,
        backupIncludeFiles: form.includeFiles,
        language: form.language,
        calendar: form.calendar,
        timezone: form.timezone,
        timeFormat: form.timeFormat,
        theme: form.theme,
        accentColor: form.accentColor,
      });
      toast.success('تنظیمات ذخیره شد.');
      await settingsQuery.reload();
      await useAppearance.getState().load();
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
                <div>
                  <Label>لوگوی تعمیرگاه</Label>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3">
                    {form.workshopLogo ? (
                      <img
                        src={form.workshopLogo}
                        alt="لوگوی تعمیرگاه"
                        className="size-14 rounded-xl border border-ink-200 bg-surface object-contain p-1"
                      />
                    ) : (
                      <span className="flex size-14 items-center justify-center rounded-xl border border-dashed border-ink-200 bg-ink-50 text-ink-400">
                        <ImageIcon className="size-5" />
                      </span>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        ref={logoInput}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        disabled={!canManage}
                        onChange={(event) => {
                          void handleLogoChange(event.target.files?.[0]);
                          event.target.value = '';
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!canManage}
                        onClick={() => logoInput.current?.click()}
                      >
                        انتخاب تصویر
                      </Button>
                      {form.workshopLogo ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={!canManage}
                          onClick={() => update('workshopLogo', '')}
                        >
                          حذف لوگو
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <FieldHint>
                    PNG، JPEG یا WebP؛ تصویر به‌صورت خودکار کوچک می‌شود و در سربرگ گزارش PDF و چاپ
                    استفاده خواهد شد.
                  </FieldHint>
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

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                  <Palette className="size-4" />
                </span>
                <div>
                  <CardTitle>زبان، تقویم و ظاهر</CardTitle>
                  <p className="mt-0.5 text-xs text-ink-400">
                    نمایش تاریخ‌ها و رنگ‌بندی برنامه برای همه کاربران تغییر می‌کند.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label htmlFor="language">زبان</Label>
                <Select
                  id="language"
                  value={form.language}
                  onChange={(event) => update('language', event.target.value as 'fa' | 'en')}
                  className="mt-1.5"
                  disabled={!canManage}
                >
                  <option value="fa">فارسی</option>
                  <option value="en">English (ارقام و تاریخ لاتین)</option>
                </Select>
                <FieldHint>متن برچسب‌ها فارسی است؛ این تنظیم زبان ارقام و تاریخ را تعیین می‌کند.</FieldHint>
              </div>
              <div>
                <Label htmlFor="calendar">تقویم</Label>
                <Select
                  id="calendar"
                  value={form.calendar}
                  onChange={(event) => update('calendar', event.target.value as 'jalali' | 'gregorian')}
                  className="mt-1.5"
                  disabled={!canManage}
                >
                  <option value="jalali">هجری شمسی</option>
                  <option value="gregorian">میلادی</option>
                </Select>
                <FieldHint>ثبت تاریخ در فرم‌ها همیشه شمسی است؛ این تنظیم فقط نمایش را تغییر می‌دهد.</FieldHint>
              </div>
              <div>
                <Label htmlFor="timezone">منطقه زمانی</Label>
                <Select
                  id="timezone"
                  value={form.timezone}
                  onChange={(event) => update('timezone', event.target.value)}
                  className="mt-1.5"
                  disabled={!canManage}
                >
                  {TIMEZONES.map((zone) => (
                    <option key={zone.value} value={zone.value}>
                      {zone.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="time-format">قالب ساعت</Label>
                <Select
                  id="time-format"
                  value={form.timeFormat}
                  onChange={(event) => update('timeFormat', event.target.value as '24' | '12')}
                  className="mt-1.5"
                  disabled={!canManage}
                >
                  <option value="24">۲۴ ساعته</option>
                  <option value="12">۱۲ ساعته</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="theme">پوسته برنامه</Label>
                <Select
                  id="theme"
                  value={form.theme}
                  onChange={(event) =>
                    update('theme', event.target.value as 'light' | 'dark' | 'system')
                  }
                  className="mt-1.5"
                  disabled={!canManage}
                >
                  <option value="light">روشن</option>
                  <option value="dark">تیره</option>
                  <option value="system">هماهنگ با سیستم</option>
                </Select>
              </div>
              <div>
                <Label>رنگ‌بندی</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ACCENT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      disabled={!canManage}
                      onClick={() => update('accentColor', option.value)}
                      aria-label={`رنگ ${option.label}`}
                      aria-pressed={form.accentColor === option.value}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs transition disabled:opacity-50 ${
                        form.accentColor === option.value
                          ? 'border-brand-400 bg-brand-50 text-brand-700'
                          : 'border-ink-200 bg-surface text-ink-600 hover:border-ink-300'
                      }`}
                    >
                      <span
                        className="size-3 rounded-full"
                        style={{ backgroundColor: option.color }}
                      />
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                  <CalendarDays className="size-4" />
                </span>
                <div>
                  <CardTitle>برنامه پشتیبان‌گیری</CardTitle>
                  <p className="mt-0.5 text-xs text-ink-400">
                    زمان‌بندی، محل نگهداری و محتوای نسخه‌های پشتیبان را تعیین کنید.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <Label htmlFor="backup-directory">محل نگهداری نسخه‌ها</Label>
                  <Input
                    id="backup-directory"
                    value={form.backupDirectory}
                    onChange={(event) => update('backupDirectory', event.target.value)}
                    className="mt-1.5"
                    dir="ltr"
                    disabled={!canManage}
                    placeholder="خالی = مسیر تنظیمات سرور (BACKUP_DIR)"
                  />
                  <FieldHint>
                    مسیر مطلق روی سرور، هارد شبکه یا حافظه خارجی متصل به سرور؛ پوشه باید قابل نوشتن باشد.
                  </FieldHint>
                </div>
                <div>
                  <Label htmlFor="backup-time">ساعت اجرای خودکار</Label>
                  <Input
                    id="backup-time"
                    type="time"
                    value={form.backupScheduleTime}
                    onChange={(event) => update('backupScheduleTime', event.target.value)}
                    className="mt-1.5"
                    dir="ltr"
                    disabled={!canManage || !form.scheduleEnabled}
                  />
                  <FieldHint>اگر سرور در آن ساعت خاموش باشد، حداکثر تا ۹۰ دقیقه بعد اجرا می‌شود.</FieldHint>
                </div>
                <div>
                  <Label htmlFor="backup-retention">تعداد نسخه‌های نگهداری‌شده</Label>
                  <Input
                    id="backup-retention"
                    type="number"
                    min={1}
                    max={365}
                    value={form.backupRetentionCount}
                    onChange={(event) => update('backupRetentionCount', event.target.value)}
                    className="mt-1.5"
                    dir="ltr"
                    disabled={!canManage}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Switch
                  id="backup-schedule"
                  checked={form.scheduleEnabled}
                  onCheckedChange={(value) => toggleSetting('scheduleEnabled', value)}
                  disabled={!canManage}
                  label="پشتیبان‌گیری خودکار روزانه"
                  description="در ساعت تعیین‌شده یک نسخه کامل تهیه می‌شود."
                />
                <Switch
                  id="backup-encrypt"
                  checked={form.encrypt}
                  onCheckedChange={(value) => toggleSetting('encrypt', value)}
                  disabled={!canManage}
                  label="رمزنگاری نسخه‌های پشتیبان (AES-256)"
                  description="عبارت عبور روی سرور در BACKUP_PASSPHRASE تنظیم می‌شود."
                />
                <Switch
                  id="backup-settings"
                  checked={form.includeSettings}
                  onCheckedChange={(value) => toggleSetting('includeSettings', value)}
                  disabled={!canManage}
                  label="پشتیبان‌گیری از تنظیمات و فرم‌ها"
                  description="تنظیمات سامانه، فیلدهای سفارشی و فهرست گزینه‌ها."
                />
                <Switch
                  id="backup-files"
                  checked={form.includeFiles}
                  onCheckedChange={(value) => toggleSetting('includeFiles', value)}
                  disabled={!canManage}
                  label="پشتیبان‌گیری از فایل‌های دستگاه‌ها"
                  description="تصاویر و پیوست‌های ذخیره‌شده روی سرور (حجم نسخه را زیاد می‌کند)."
                />
              </div>
            </CardContent>
          </Card>

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

      {canViewFiles ? (
        <div className="mt-4">
          <StorageDefaultSection canManage={canManageFiles} />
        </div>
      ) : null}

      {canBackup ? <BackupsSection /> : null}

      <div className="mt-4">
        <DeviceConfigSection canManage={canManage} />
      </div>
    </div>
  );
}

function StorageDefaultSection({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const locationsQuery = useApiQuery<StorageLocation[]>(
    () => api.get<StorageLocation[]>('/api/storage/locations'),
    [],
  );
  const [selectedId, setSelectedId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!locationsQuery.data || locationsQuery.data.length === 0) return;
    const current =
      locationsQuery.data.find((location) => location.isDefault) ?? locationsQuery.data[0];
    setSelectedId((previous) =>
      locationsQuery.data!.some((location) => location.id === previous) ? previous : current.id,
    );
  }, [locationsQuery.data]);

  const locations = locationsQuery.data ?? [];
  const currentDefault = locations.find((location) => location.isDefault) ?? null;
  const selected = locations.find((location) => location.id === selectedId) ?? null;

  async function saveDefault() {
    if (!selected || !canManage || saving) return;
    setSaving(true);
    try {
      await api.patch(`/api/storage/locations/${selected.id}`, {
        isDefault: true,
        version: selected.version,
      });
      toast.success('محل ذخیره‌سازی پیش‌فرض ذخیره شد.');
      await locationsQuery.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-wrap">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
            <HardDrive className="size-4" />
          </span>
          <div>
            <CardTitle>محل اصلی ذخیره‌سازی</CardTitle>
            <p className="mt-0.5 text-xs text-ink-400">
              پوشه دستگاه‌های جدید زیر همین حافظه ساخته می‌شود.
            </p>
          </div>
        </div>
        <Link to="/storage" className="text-xs font-medium text-brand-700 hover:underline">
          مدیریت فایل‌ها و حافظه‌ها
        </Link>
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
        {locationsQuery.data && locations.length === 0 ? (
          <p className="text-xs text-ink-500">
            هنوز محل ذخیره‌سازی تعریف نشده است. از صفحه مدیریت فایل‌ها یک حافظه اضافه کنید.
          </p>
        ) : null}
        {locations.length > 0 ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <Label htmlFor="default-storage">حافظه پیش‌فرض</Label>
              <Select
                id="default-storage"
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                className="mt-1.5"
                disabled={!canManage}
              >
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                    {location.isDefault ? ' (پیش‌فرض فعلی)' : ''}
                  </option>
                ))}
              </Select>
              {selected ? (
                <FieldHint>
                  <span dir="ltr" className="break-all">
                    {selected.rootPath}
                  </span>
                  {' — '}
                  {selected.health.available ? 'متصل' : 'قطع'}
                  {selected.health.freeBytes !== null
                    ? ` — فضای آزاد: ${formatBytes(selected.health.freeBytes)}`
                    : ''}
                </FieldHint>
              ) : null}
            </div>
            {canManage ? (
              <Button
                type="button"
                onClick={() => void saveDefault()}
                loading={saving}
                disabled={!selected || selected.id === currentDefault?.id}
              >
                <Save className="size-4" />
                ذخیره محل پیش‌فرض
              </Button>
            ) : null}
          </div>
        ) : null}
        {currentDefault ? (
          <p className="text-[11px] leading-6 text-ink-400">
            مسیر کلاینتی محل پیش‌فرض:{' '}
            <span dir="ltr">
              {currentDefault.clientRoot ?? 'تعریف نشده (مسیر شبکه‌ای در محل ثبت نشده است)'}
            </span>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function BackupsSection() {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<BackupFile | null>(null);
  const [confirmName, setConfirmName] = useState('');
  const [restoreDb, setRestoreDb] = useState(true);
  const [restoreSettings, setRestoreSettings] = useState(true);
  const [restoreFiles, setRestoreFiles] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const backupsQuery = useApiQuery<BackupList>(() => api.get<BackupList>('/api/backups'), []);

  async function createBackup() {
    setCreating(true);
    try {
      await api.post<BackupFile>('/api/backups', {});
      toast.success('نسخه پشتیبان با موفقیت ایجاد شد.');
      await backupsQuery.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setCreating(false);
    }
  }

  async function handleDownload(file: BackupFile, kind: 'database' | 'settings' | 'manifest') {
    const key = `${file.name}:${kind}`;
    setDownloading(key);
    try {
      const extension = kind === 'database' ? 'dump' : 'json';
      await downloadFile(
        `/api/backups/${encodeURIComponent(file.name)}/download?file=${kind}`,
        `${file.name}-${kind}.${extension}`,
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDownloading(null);
    }
  }

  function openRestore(bundle: BackupFile) {
    setRestoreTarget(bundle);
    setConfirmName('');
    setRestoreDb(true);
    setRestoreSettings(bundle.includesSettings);
    setRestoreFiles(false);
  }

  async function restore() {
    if (!restoreTarget || restoring) return;
    if (confirmName.trim() !== restoreTarget.name) {
      toast.error('برای تأیید، نام نسخه پشتیبان را دقیقاً وارد کنید.');
      return;
    }
    setRestoring(true);
    try {
      const result = await api.post<RestoreResult>(
        `/api/backups/${encodeURIComponent(restoreTarget.name)}/restore`,
        {
          confirmName: confirmName.trim(),
          restoreDatabase: restoreDb,
          restoreSettings,
          restoreFiles,
        },
      );
      toast.success(
        `بازیابی انجام شد. نسخه ایمن پیش از بازیابی: ${result.safetyBackup ?? '—'}`,
      );
      setRestoreTarget(null);
      await backupsQuery.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRestoring(false);
    }
  }

  const status = backupsQuery.data?.status;
  const files = backupsQuery.data?.items ?? [];
  const runs = backupsQuery.data?.runs ?? [];
  const failureIsNewer =
    status?.lastFailureAt &&
    (!status.lastSuccessAt ||
      new Date(status.lastFailureAt).getTime() > new Date(status.lastSuccessAt).getTime());

  return (
    <>
      <Card className="mt-4">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                <DatabaseBackup className="size-4" />
              </span>
              <div>
                <CardTitle>پشتیبان‌گیری و بازیابی</CardTitle>
                <p className="mt-0.5 text-xs text-ink-400">
                  پایگاه داده، تنظیمات و فایل‌های دستگاه در یک بسته کامل ذخیره می‌شوند.
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
                {status.pgDumpAvailable ? 'pg_dump در دسترس' : 'pg_dump پیدا نشد'}
              </Badge>
              <Badge variant={status.pgRestoreAvailable ? 'success' : 'danger'}>
                {status.pgRestoreAvailable ? 'pg_restore در دسترس' : 'pg_restore پیدا نشد'}
              </Badge>
              <Badge variant={status.scheduledEnabled ? 'brand' : 'warning'}>
                {status.scheduledEnabled
                  ? `پشتیبان‌گیری خودکار ساعت ${status.scheduleTime}`
                  : 'پشتیبان‌گیری خودکار غیرفعال'}
              </Badge>
              <Badge variant={status.encryptionAvailable ? 'success' : 'warning'}>
                {status.encryptionAvailable ? 'رمزنگاری فعال' : 'عبارت عبور رمزنگاری تنظیم نشده'}
              </Badge>
              <span className="text-ink-400" dir="ltr">
                {status.directory}
              </span>
            </div>
          ) : null}

          {status?.lastSuccessAt ? (
            <p className="text-xs text-ink-500">
              آخرین پشتیبان موفق: {formatJalaliDateTime(status.lastSuccessAt)}
              {status.lastSuccessName ? (
                <span dir="ltr" className="ms-1 font-mono text-[11px]">
                  ({status.lastSuccessName})
                </span>
              ) : null}
            </p>
          ) : null}

          {failureIsNewer && status ? (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-6 text-rose-700">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">
                  آخرین عملیات پشتیبان‌گیری/بازیابی ناموفق بوده است
                  {status.lastFailureAt ? ` (${formatJalaliDateTime(status.lastFailureAt)})` : ''}.
                </p>
                <p dir="auto">{status.lastFailureMessage}</p>
              </div>
            </div>
          ) : null}

          {!status?.pgDumpAvailable && status ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-800">
              برنامه PostgreSQL روی سرور باید نصب باشد تا پشتیبان‌گیری انجام شود. اگر pg_dump در مسیر
              پیش‌فرض نیست، مسیر آن را در فایل تنظیمات سرور (PG_DUMP_PATH) مشخص کنید. برای بازیابی نیز
              مسیر PG_RESTORE_PATH استفاده می‌شود.
            </div>
          ) : null}

          {backupsQuery.loading && !backupsQuery.data ? (
            <Spinner label="در حال دریافت نسخه‌های پشتیبان..." />
          ) : null}

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
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead>نام بسته</TableHead>
                  <TableHead>تاریخ ایجاد</TableHead>
                  <TableHead>محتوا</TableHead>
                  <TableHead>حجم</TableHead>
                  <TableHead className="text-end">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => (
                  <TableRow key={file.name}>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs" dir="ltr">
                        {file.encrypted ? <Lock className="size-3 text-brand-600" /> : null}
                        <span className="font-mono">{file.name}</span>
                      </div>
                      {file.legacy ? (
                        <span className="text-[10px] text-ink-400">نسخه قدیمی (فقط دیتابیس)</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-ink-500">
                      {formatJalaliDateTime(file.createdAt)}
                    </TableCell>
                    <TableCell className="text-[11px] text-ink-500">
                      دیتابیس
                      {file.includesSettings ? ' + تنظیمات' : ''}
                      {file.includesFiles ? ` + ${file.filesCount} فایل` : ''}
                    </TableCell>
                    <TableCell className="text-xs text-ink-500">{formatBytes(file.sizeBytes)}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {file.legacy || !file.encrypted ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={downloading === `${file.name}:database`}
                            onClick={() => void handleDownload(file, 'database')}
                          >
                            <Download className="size-4" />
                            دیتابیس
                          </Button>
                        ) : (
                          <span className="px-2 text-[10px] text-ink-400">دانلود رمزنگاری‌شده ندارد</span>
                        )}
                        {file.includesSettings && !file.encrypted ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={downloading === `${file.name}:settings`}
                            onClick={() => void handleDownload(file, 'settings')}
                          >
                            <Download className="size-4" />
                            تنظیمات
                          </Button>
                        ) : null}
                        {!file.legacy ? (
                          <Button variant="outline" size="sm" onClick={() => openRestore(file)}>
                            <RotateCcw className="size-4" />
                            بازیابی
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}

          <p className="text-[11px] leading-6 text-ink-400">
            بازیابی ابتدا یک نسخه پشتیبان ایمن از وضعیت فعلی می‌سازد، سپس پایگاه داده و تنظیمات را
            بازمی‌گرداند. توصیه می‌شود پیش از بازیابی، همه کاربران از سامانه خارج شوند. نسخه‌های
            رمزنگاری‌شده با عبارت عبور BACKUP_PASSPHRASE سرور باز می‌شوند.
          </p>
        </CardContent>
      </Card>

      {runs.length > 0 ? (
        <Card className="mt-4">
          <CardHeader>
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-xl bg-ink-100 text-ink-600">
                <CheckCircle2 className="size-4" />
              </span>
              <div>
                <CardTitle>تاریخچه عملیات پشتیبان‌گیری و بازیابی</CardTitle>
                <p className="mt-0.5 text-xs text-ink-400">۱۵ عملیات آخر با نتیجه و مدت اجرا</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-4">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>نوع</TableHead>
                  <TableHead>نسخه</TableHead>
                  <TableHead>زمان</TableHead>
                  <TableHead>اجراکننده</TableHead>
                  <TableHead>نتیجه</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="text-xs">
                      {run.operation === 'backup' ? 'پشتیبان‌گیری' : 'بازیابی'}
                      <span className="ms-1 text-[10px] text-ink-400">
                        {run.trigger === 'scheduled'
                          ? '(خودکار)'
                          : run.trigger === 'pre_restore'
                            ? '(ایمن، پیش از بازیابی)'
                            : '(دستی)'}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-[11px]" dir="ltr">
                      {run.bundleName}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-ink-500">
                      {formatJalaliDateTime(run.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs text-ink-500">
                      {run.createdBy ?? 'سیستم'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={run.status === 'success' ? 'success' : 'danger'}>
                        {run.status === 'success' ? 'موفق' : 'ناموفق'}
                      </Badge>
                      {run.error ? (
                        <p className="mt-1 max-w-[280px] text-[10px] leading-5 text-rose-600">
                          {run.error}
                        </p>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Dialog
        open={Boolean(restoreTarget)}
        onOpenChange={(open) => {
          if (!open && !restoring) setRestoreTarget(null);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>بازیابی نسخه پشتیبان</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-6 text-rose-700">
              بازیابی، اطلاعات فعلی پایگاه داده را با محتوای این نسخه جایگزین می‌کند. پیش از اجرا یک
              نسخه پشتیبان ایمن از وضعیت فعلی ساخته می‌شود.
            </div>
            <div>
              <Label htmlFor="restore-confirm">
                برای تأیید، نام نسخه را وارد کنید: <span dir="ltr">{restoreTarget?.name}</span>
              </Label>
              <Input
                id="restore-confirm"
                value={confirmName}
                onChange={(event) => setConfirmName(event.target.value)}
                className="mt-1.5"
                dir="ltr"
                disabled={restoring}
              />
            </div>
            <div className="space-y-3">
              <Switch
                id="restore-database"
                checked={restoreDb}
                onCheckedChange={setRestoreDb}
                disabled={restoring}
                label="بازیابی پایگاه داده"
                description="همه تجهیزات، مشتریان، کاربران و سوابق به این نسخه برمی‌گردد."
              />
              <Switch
                id="restore-settings"
                checked={restoreSettings}
                onCheckedChange={setRestoreSettings}
                disabled={restoring || !restoreTarget?.includesSettings}
                label="بازیابی تنظیمات، فیلدها و گزینه‌ها"
                description={
                  restoreTarget?.includesSettings
                    ? 'تنظیمات و ساختار فرم‌ها از نسخه پشتیبان اعمال می‌شود.'
                    : 'این نسخه پشتیبان شامل تنظیمات نیست.'
                }
              />
              <Switch
                id="restore-files"
                checked={restoreFiles}
                onCheckedChange={setRestoreFiles}
                disabled={restoring || !restoreTarget?.includesFiles}
                label="بازیابی فایل‌های دستگاه‌ها"
                description={
                  restoreTarget?.includesFiles
                    ? 'فایل‌های موجود بازنویسی نمی‌شوند و فقط فایل‌های غایب اضافه می‌شوند.'
                    : 'این نسخه پشتیبان شامل فایل‌ها نیست.'
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreTarget(null)} disabled={restoring}>
              انصراف
            </Button>
            <Button
              variant="danger"
              onClick={() => void restore()}
              loading={restoring}
              disabled={confirmName.trim() !== restoreTarget?.name}
            >
              <RotateCcw className="size-4" />
              اجرای بازیابی
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
