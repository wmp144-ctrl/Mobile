import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { DEVICE_STATUS_OPTIONS } from '@/lib/device-status';
import type { DeviceDetail } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FieldError, Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';

interface StatusChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device: DeviceDetail | null;
  onChanged: (device: DeviceDetail) => void;
}

export function StatusChangeDialog({
  open,
  onOpenChange,
  device,
  onChanged,
}: StatusChangeDialogProps) {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !device) return;
    const next = DEVICE_STATUS_OPTIONS.find((item) => item.key !== device.status.key);
    setStatus(next?.key ?? '');
    setNote('');
    setError(null);
  }, [open, device]);

  async function handleSubmit() {
    if (!device || saving) return;
    if (!status) {
      setError('وضعیت جدید را انتخاب کنید.');
      return;
    }
    if (status === device.status.key) {
      setError('وضعیت جدید با وضعیت فعلی یکسان است.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api.patch<DeviceDetail>(`/api/devices/${device.id}/status`, {
        status,
        note: note.trim(),
        version: device.version,
      });
      toast.success('وضعیت دستگاه تغییر کرد و در تاریخچه ثبت شد.');
      onChanged(updated);
      onOpenChange(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>تغییر وضعیت دستگاه</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl bg-ink-50 px-4 py-3 text-xs text-ink-600">
            وضعیت فعلی: <span className="font-medium text-ink-800">{device?.status.label}</span>
          </div>
          <div>
            <Label htmlFor="new-status">وضعیت جدید</Label>
            <Select
              id="new-status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="mt-1.5"
            >
              {DEVICE_STATUS_OPTIONS.filter((item) => item.key !== device?.status.key).map(
                (item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ),
              )}
            </Select>
          </div>
          <div>
            <Label htmlFor="status-note">توضیح تغییر وضعیت</Label>
            <Textarea
              id="status-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1.5"
              rows={2}
              placeholder="مثلاً قطعه سفارش داده شد و تحویل آن دو روز زمان می‌برد."
            />
          </div>
          <FieldError>{error}</FieldError>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            انصراف
          </Button>
          <Button onClick={() => void handleSubmit()} loading={saving}>
            ثبت تغییر وضعیت
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
