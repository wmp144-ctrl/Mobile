import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { STORAGE_KIND_OPTIONS } from '@/lib/device-status';
import {
  BACKUP_STATUS_OPTIONS,
  FOLDER_CATEGORY_OPTIONS,
} from '@/lib/storage';
import type {
  DeviceDetail,
  DeviceFileEntry,
  DeviceOperationEntry,
  StorageLocation,
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FieldError, FieldHint, Input, Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';

interface FilePathDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviceId: string;
  file?: DeviceFileEntry | null;
  operations: DeviceOperationEntry[];
  locations: StorageLocation[];
  onSaved: (device: DeviceDetail) => void;
}

interface FileFormState {
  label: string;
  category: string;
  storageLocationId: string;
  relativePath: string;
  path: string;
  clientPath: string;
  storageKind: string;
  backupStatus: string;
  alternativePath: string;
  relatedOperationId: string;
  notes: string;
}

const EMPTY: FileFormState = {
  label: '',
  category: 'backup',
  storageLocationId: '',
  relativePath: '',
  path: '',
  clientPath: '',
  storageKind: 'network',
  backupStatus: 'none',
  alternativePath: '',
  relatedOperationId: '',
  notes: '',
};

export function FilePathDialog({
  open,
  onOpenChange,
  deviceId,
  file,
  operations,
  locations,
  onSaved,
}: FilePathDialogProps) {
  const toast = useToast();
  const [form, setForm] = useState<FileFormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      file
        ? {
            label: file.label,
            category: file.category,
            storageLocationId: file.storageLocation?.id ?? '',
            relativePath: file.relativePath ?? '',
            path: file.path,
            clientPath: file.clientPath ?? '',
            storageKind: file.storageKind,
            backupStatus: file.backupStatus,
            alternativePath: file.alternativePath ?? '',
            relatedOperationId: file.relatedOperationId ?? '',
            notes: file.notes ?? '',
          }
        : EMPTY,
    );
  }, [open, file]);

  function update<K extends keyof FileFormState>(key: K, value: FileFormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === form.storageLocationId) ?? null,
    [locations, form.storageLocationId],
  );

  const computedPath = useMemo(() => {
    if (!selectedLocation || !form.relativePath.trim()) return null;
    const root = selectedLocation.rootPath.replace(/[\\/]+$/, '');
    return `${root}\\${form.relativePath.trim().replace(/\//g, '\\')}`;
  }, [selectedLocation, form.relativePath]);

  const computedClientPath = useMemo(() => {
    if (form.clientPath.trim()) return form.clientPath.trim();
    if (!selectedLocation?.clientRoot || !form.relativePath.trim()) return null;
    const root = selectedLocation.clientRoot.replace(/[\\/]+$/, '');
    return `${root}\\${form.relativePath.trim().replace(/\//g, '\\')}`;
  }, [selectedLocation, form.relativePath, form.clientPath]);

  async function handleSubmit() {
    if (saving) return;
    if (form.label.trim().length < 2) {
      setError('عنوان فایل باید حداقل ۲ نویسه باشد.');
      return;
    }
    if (form.storageLocationId && !form.relativePath.trim()) {
      setError('مسیر نسبی داخل محل ذخیره‌سازی را وارد کنید.');
      return;
    }
    if (!form.storageLocationId && !form.path.trim()) {
      setError('مسیر فایل یا پوشه را وارد کنید.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        label: form.label.trim(),
        category: form.category,
        storageLocationId: form.storageLocationId || undefined,
        relativePath: form.storageLocationId ? form.relativePath.trim() : undefined,
        path: form.storageLocationId ? undefined : form.path.trim(),
        clientPath: form.clientPath.trim() || undefined,
        storageKind: form.storageLocationId ? undefined : form.storageKind,
        backupStatus: form.backupStatus,
        alternativePath: form.alternativePath.trim(),
        relatedOperationId: form.relatedOperationId || undefined,
        notes: form.notes.trim() || undefined,
      };
      const device = file
        ? await api.patch<DeviceDetail>(`/api/devices/${deviceId}/files/${file.id}`, payload)
        : await api.post<DeviceDetail>(`/api/devices/${deviceId}/files`, payload);
      toast.success(file ? 'مسیر فایل ویرایش شد.' : 'مسیر فایل ثبت شد.');
      onSaved(device);
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
          <DialogTitle>{file ? 'ویرایش مسیر فایل' : 'ثبت مسیر فایل جدید'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="file-label">عنوان فایل *</Label>
              <Input
                id="file-label"
                value={form.label}
                onChange={(event) => update('label', event.target.value)}
                className="mt-1.5"
                placeholder="مثلاً بکاپ مخاطبین و پیامک"
              />
            </div>
            <div>
              <Label htmlFor="file-category">دسته‌بندی</Label>
              <Select
                id="file-category"
                value={form.category}
                onChange={(event) => update('category', event.target.value)}
                className="mt-1.5"
              >
                {FOLDER_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="file-location">محل ذخیره‌سازی</Label>
            <Select
              id="file-location"
              value={form.storageLocationId}
              onChange={(event) => update('storageLocationId', event.target.value)}
              className="mt-1.5"
            >
              <option value="">مسیر دستی (بدون اتصال به محل ثبت‌شده)</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name} — {location.kind === 'nas' ? 'شبکه' : location.kind === 'external' ? 'خارجی' : 'سرور'}
                </option>
              ))}
            </Select>
          </div>

          {selectedLocation ? (
            <div>
              <Label htmlFor="file-relative">مسیر نسبی داخل محل *</Label>
              <Input
                id="file-relative"
                value={form.relativePath}
                onChange={(event) => update('relativePath', event.target.value)}
                className="mt-1.5"
                dir="ltr"
                placeholder="1405/MR-1405-0001/Backup"
              />
              <FieldHint>
                مسیر کامل روی سرور: <span dir="ltr">{computedPath ?? '—'}</span>
                <br />
                مسیر قابل دسترس در کلاینت: <span dir="ltr">{computedClientPath ?? 'از مسیر کلاینتی محل استفاده می‌شود'}</span>
              </FieldHint>
            </div>
          ) : (
            <div>
              <Label htmlFor="file-path">مسیر فایل یا پوشه *</Label>
              <Input
                id="file-path"
                value={form.path}
                onChange={(event) => update('path', event.target.value)}
                className="mt-1.5"
                dir="ltr"
                placeholder="\\REPAIR-SERVER\RepairStorage\1405\MR-1405-0001\Backup"
              />
              <FieldHint>
                این مسیر باید روی سرور یا پوشه شبکه‌ای باشد که کلاینت‌ها به آن دسترسی دارند.
              </FieldHint>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="file-client-path">مسیر جایگزین/کلاینتی (اختیاری)</Label>
              <Input
                id="file-client-path"
                value={form.clientPath}
                onChange={(event) => update('clientPath', event.target.value)}
                className="mt-1.5"
                dir="ltr"
                placeholder="Z:\RepairStorage\1405\..."
              />
            </div>
            <div>
              <Label htmlFor="file-backup">وضعیت بکاپ</Label>
              <Select
                id="file-backup"
                value={form.backupStatus}
                onChange={(event) => update('backupStatus', event.target.value)}
                className="mt-1.5"
              >
                {BACKUP_STATUS_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {!selectedLocation ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="file-kind">محل ذخیره</Label>
                <Select
                  id="file-kind"
                  value={form.storageKind}
                  onChange={(event) => update('storageKind', event.target.value)}
                  className="mt-1.5"
                >
                  {STORAGE_KIND_OPTIONS.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          ) : null}

          <div>
            <Label htmlFor="file-alternative">مسیر جایگزین پس از جابه‌جایی اطلاعات</Label>
            <Input
              id="file-alternative"
              value={form.alternativePath}
              onChange={(event) => update('alternativePath', event.target.value)}
              className="mt-1.5"
              dir="ltr"
              placeholder="در صورت انتقال بکاپ به هارد دوم، مسیر جدید را ثبت کنید"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="file-operation">اقدام مرتبط</Label>
              <Select
                id="file-operation"
                value={form.relatedOperationId}
                onChange={(event) => update('relatedOperationId', event.target.value)}
                className="mt-1.5"
              >
                <option value="">بدون ارتباط</option>
                {operations.map((operation) => (
                  <option key={operation.id} value={operation.id}>
                    {operation.title}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <p className="text-[11px] leading-5 text-ink-400">
                حجم و وضعیت دسترسی با دکمه «بررسی دسترسی» در پرونده دستگاه محاسبه و ثبت می‌شود.
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="file-notes">یادداشت</Label>
            <Textarea
              id="file-notes"
              value={form.notes}
              onChange={(event) => update('notes', event.target.value)}
              className="mt-1.5"
              rows={2}
            />
          </div>
          <FieldError>{error}</FieldError>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            انصراف
          </Button>
          <Button onClick={() => void handleSubmit()} loading={saving}>
            {file ? 'ذخیره تغییرات' : 'ثبت مسیر'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
