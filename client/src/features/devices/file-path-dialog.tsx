import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { STORAGE_KIND_OPTIONS } from '@/lib/device-status';
import type { DeviceDetail, DeviceFileEntry, DeviceOperationEntry } from '@/lib/types';
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
  onSaved: (device: DeviceDetail) => void;
}

interface FileFormState {
  label: string;
  path: string;
  storageKind: string;
  relatedOperationId: string;
  notes: string;
}

const EMPTY: FileFormState = {
  label: '',
  path: '',
  storageKind: 'network',
  relatedOperationId: '',
  notes: '',
};

export function FilePathDialog({
  open,
  onOpenChange,
  deviceId,
  file,
  operations,
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
            path: file.path,
            storageKind: file.storageKind,
            relatedOperationId: file.relatedOperationId ?? '',
            notes: file.notes ?? '',
          }
        : EMPTY,
    );
  }, [open, file]);

  function update<K extends keyof FileFormState>(key: K, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function handleSubmit() {
    if (saving) return;
    if (form.label.trim().length < 2) {
      setError('عنوان فایل باید حداقل ۲ نویسه باشد.');
      return;
    }
    if (!form.path.trim()) {
      setError('مسیر فایل یا پوشه را وارد کنید.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        label: form.label.trim(),
        path: form.path.trim(),
        storageKind: form.storageKind,
        relatedOperationId: form.relatedOperationId,
        notes: form.notes.trim(),
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
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{file ? 'ویرایش مسیر فایل' : 'ثبت مسیر فایل جدید'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
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
            <Label htmlFor="file-path">مسیر فایل *</Label>
            <Input
              id="file-path"
              value={form.path}
              onChange={(event) => update('path', event.target.value)}
              className="mt-1.5"
              dir="ltr"
              placeholder="مسیر کامل پوشه یا فایل"
            />
            <FieldHint>
              این مسیر باید روی سرور یا پوشه شبکه‌ای باشد که کلاینت‌ها به آن دسترسی دارند.
            </FieldHint>
          </div>
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
