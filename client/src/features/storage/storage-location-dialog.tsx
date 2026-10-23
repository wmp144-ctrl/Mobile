import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { STORAGE_LOCATION_KIND_OPTIONS } from '@/lib/storage';
import type { StorageLocation } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FieldError, FieldHint, Input, Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';

interface StorageLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location?: StorageLocation | null;
  onSaved: () => void;
}

interface FormState {
  name: string;
  kind: string;
  rootPath: string;
  clientRoot: string;
  driveLetter: string;
  volumeLabel: string;
  volumeId: string;
  hostName: string;
  notes: string;
  isDefault: boolean;
  isActive: boolean;
}

const EMPTY: FormState = {
  name: '',
  kind: 'server',
  rootPath: '',
  clientRoot: '',
  driveLetter: '',
  volumeLabel: '',
  volumeId: '',
  hostName: '',
  notes: '',
  isDefault: false,
  isActive: true,
};

export function StorageLocationDialog({
  open,
  onOpenChange,
  location,
  onSaved,
}: StorageLocationDialogProps) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      location
        ? {
            name: location.name,
            kind: location.kind,
            rootPath: location.rootPath,
            clientRoot: location.clientRoot ?? '',
            driveLetter: location.driveLetter ?? '',
            volumeLabel: location.volumeLabel ?? '',
            volumeId: location.volumeId ?? '',
            hostName: location.hostName ?? '',
            notes: location.notes ?? '',
            isDefault: location.isDefault,
            isActive: location.isActive,
          }
        : EMPTY,
    );
  }, [open, location]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function handleSubmit() {
    if (saving) return;
    if (form.name.trim().length < 2) {
      setError('نام محل ذخیره‌سازی حداقل ۲ نویسه است.');
      return;
    }
    if (!form.rootPath.trim()) {
      setError('مسیر ریشه روی سرور یا شبکه را وارد کنید.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        kind: form.kind,
        rootPath: form.rootPath.trim(),
        clientRoot: form.clientRoot.trim(),
        driveLetter: form.driveLetter.trim(),
        volumeLabel: form.volumeLabel.trim(),
        volumeId: form.volumeId.trim(),
        hostName: form.hostName.trim(),
        notes: form.notes.trim(),
        isDefault: form.isDefault,
        isActive: form.isActive,
      };
      if (location) {
        await api.patch<StorageLocation>(`/api/storage/locations/${location.id}`, {
          ...payload,
          version: location.version,
        });
        toast.success('محل ذخیره‌سازی ویرایش شد.');
      } else {
        await api.post<StorageLocation>('/api/storage/locations', payload);
        toast.success('محل ذخیره‌سازی ثبت شد.');
      }
      onSaved();
      onOpenChange(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{location ? 'ویرایش محل ذخیره‌سازی' : 'افزودن محل ذخیره‌سازی'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="location-name">نام محل *</Label>
              <Input
                id="location-name"
                value={form.name}
                onChange={(event) => update('name', event.target.value)}
                className="mt-1.5"
                placeholder="مثلاً هارد بکاپ اصلی"
              />
            </div>
            <div>
              <Label htmlFor="location-kind">نوع محل</Label>
              <Select
                id="location-kind"
                value={form.kind}
                onChange={(event) => update('kind', event.target.value)}
                className="mt-1.5"
              >
                {STORAGE_LOCATION_KIND_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="location-root">مسیر ریشه از دید سرور *</Label>
            <Input
              id="location-root"
              value={form.rootPath}
              onChange={(event) => update('rootPath', event.target.value)}
              className="mt-1.5"
              dir="ltr"
              placeholder="D:\RepairStorage یا \\REPAIR-SERVER\RepairStorage"
            />
            <FieldHint>
              این مسیر مرجع اصلی اطلاعات است و سرور باید به آن دسترسی خواندن و نوشتن داشته باشد.
            </FieldHint>
          </div>

          <div>
            <Label htmlFor="location-client-root">مسیر قابل دسترس در کلاینت‌ها</Label>
            <Input
              id="location-client-root"
              value={form.clientRoot}
              onChange={(event) => update('clientRoot', event.target.value)}
              className="mt-1.5"
              dir="ltr"
              placeholder="Z:\RepairStorage یا \\REPAIR-SERVER\RepairStorage"
            />
            <FieldHint>
              مسیر شبکه‌ای ثبت‌شده مرجع است؛ مسیر درایو محلی هر کلاینت فقط برای بازکردن پوشه استفاده
              می‌شود.
            </FieldHint>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="location-drive">نام درایو</Label>
              <Input
                id="location-drive"
                value={form.driveLetter}
                onChange={(event) => update('driveLetter', event.target.value)}
                className="mt-1.5"
                dir="ltr"
                placeholder="Z:"
              />
            </div>
            <div>
              <Label htmlFor="location-volume-label">برچسب حافظه</Label>
              <Input
                id="location-volume-label"
                value={form.volumeLabel}
                onChange={(event) => update('volumeLabel', event.target.value)}
                className="mt-1.5"
                placeholder="NAS-BACKUP"
              />
            </div>
            <div>
              <Label htmlFor="location-volume-id">شناسه حافظه</Label>
              <Input
                id="location-volume-id"
                value={form.volumeId}
                onChange={(event) => update('volumeId', event.target.value)}
                className="mt-1.5"
                dir="ltr"
                placeholder="VOL-1234"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="location-host">نام سرور / میزبان</Label>
            <Input
              id="location-host"
              value={form.hostName}
              onChange={(event) => update('hostName', event.target.value)}
              className="mt-1.5"
              dir="ltr"
              placeholder="REPAIR-SERVER"
            />
          </div>

          <div>
            <Label htmlFor="location-notes">یادداشت و محل نگهداری</Label>
            <Textarea
              id="location-notes"
              value={form.notes}
              onChange={(event) => update('notes', event.target.value)}
              className="mt-1.5"
              rows={2}
              placeholder="مثلاً قفسه دوم اتاق سرور"
            />
          </div>

          <div className="flex flex-wrap gap-5 rounded-xl bg-ink-50 px-4 py-3">
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(event) => update('isDefault', event.target.checked)}
                className="size-4 rounded border-ink-300"
              />
              محل پیش‌فرض ساخت پوشه دستگاه
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => update('isActive', event.target.checked)}
                className="size-4 rounded border-ink-300"
              />
              فعال
            </label>
          </div>

          <FieldError>{error}</FieldError>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            انصراف
          </Button>
          <Button onClick={() => void handleSubmit()} loading={saving}>
            {location ? 'ذخیره تغییرات' : 'ثبت محل'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
