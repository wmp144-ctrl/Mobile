import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { DEVICE_STATUS_OPTIONS, OPERATION_RESULT_OPTIONS } from '@/lib/device-status';
import {
  isoToJalaliDateInput,
  isoToTimeInput,
  jalaliDateTimeToIso,
} from '@/lib/jalali';
import type {
  DeviceDetail,
  DeviceOperationEntry,
  OptionItem,
  TechnicianOption,
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FieldError, FieldHint, Input, Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { JalaliDateInput } from '@/components/ui/jalali-date-input';
import { useToast } from '@/components/ui/toast';

interface OperationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviceId: string;
  operation?: DeviceOperationEntry | null;
  operationTypes: OptionItem[];
  technicians: TechnicianOption[];
  statuses?: typeof DEVICE_STATUS_OPTIONS;
  onSaved: (device: DeviceDetail) => void;
}

interface OperationFormState {
  operationType: string;
  title: string;
  performedDate: string;
  performedTime: string;
  technicianId: string;
  description: string;
  dataSizeMb: string;
  storagePath: string;
  result: string;
  deviceStatusAfter: string;
}

const EMPTY: OperationFormState = {
  operationType: '',
  title: '',
  performedDate: '',
  performedTime: '',
  technicianId: '',
  description: '',
  dataSizeMb: '',
  storagePath: '',
  result: 'success',
  deviceStatusAfter: '',
};

export function OperationDialog({
  open,
  onOpenChange,
  deviceId,
  operation,
  operationTypes,
  technicians,
  statuses = DEVICE_STATUS_OPTIONS,
  onSaved,
}: OperationDialogProps) {
  const toast = useToast();
  const [form, setForm] = useState<OperationFormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (operation) {
      setForm({
        operationType: operation.operationType.key,
        title: operation.title,
        performedDate: isoToJalaliDateInput(operation.performedAt),
        performedTime: isoToTimeInput(operation.performedAt),
        technicianId: operation.technicianId ?? '',
        description: operation.description ?? '',
        dataSizeMb:
          operation.dataSizeBytes && operation.dataSizeBytes > 0
            ? String(Math.round((operation.dataSizeBytes / (1024 * 1024)) * 10) / 10)
            : '',
        storagePath: operation.storagePath ?? '',
        result: operation.result.key,
        deviceStatusAfter: '',
      });
    } else {
      const now = new Date();
      setForm({
        ...EMPTY,
        operationType: operationTypes.find((item) => item.isActive)?.key ?? 'other',
        performedDate: isoToJalaliDateInput(now),
        performedTime: isoToTimeInput(now),
      });
    }
  }, [open, operation, operationTypes]);

  function update<K extends keyof OperationFormState>(key: K, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function handleSubmit() {
    if (saving) return;
    if (!form.operationType) {
      setError('نوع اقدام را انتخاب کنید.');
      return;
    }
    if (form.title.trim().length < 2) {
      setError('عنوان اقدام باید حداقل ۲ نویسه باشد.');
      return;
    }
    const performedAt = jalaliDateTimeToIso(form.performedDate, form.performedTime);
    if (!performedAt) {
      setError('تاریخ انجام اقدام معتبر نیست.');
      return;
    }
    const sizeMb = form.dataSizeMb.trim() ? Number(form.dataSizeMb) : null;
    if (sizeMb !== null && (!Number.isFinite(sizeMb) || sizeMb < 0)) {
      setError('حجم اطلاعات باید عدد مثبت باشد.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        operationType: form.operationType,
        title: form.title.trim(),
        performedAt,
        technicianId: form.technicianId,
        description: form.description.trim(),
        dataSizeBytes: sizeMb === null ? undefined : Math.round(sizeMb * 1024 * 1024),
        storagePath: form.storagePath.trim(),
        result: form.result,
        ...(operation ? { version: operation.version } : {}),
        ...(!operation && form.deviceStatusAfter ? { deviceStatusAfter: form.deviceStatusAfter } : {}),
      };
      const device = operation
        ? await api.patch<DeviceDetail>(
            `/api/devices/${deviceId}/operations/${operation.id}`,
            payload,
          )
        : await api.post<DeviceDetail>(`/api/devices/${deviceId}/operations`, payload);
      toast.success(operation ? 'اقدام ویرایش شد.' : 'اقدام برای پرونده ثبت شد.');
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
          <DialogTitle>{operation ? 'ویرایش اقدام انجام‌شده' : 'ثبت اقدام جدید'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="operation-type">نوع اقدام *</Label>
            <Select
              id="operation-type"
              value={form.operationType}
              onChange={(event) => update('operationType', event.target.value)}
              className="mt-1.5"
            >
              <option value="">انتخاب کنید...</option>
              {operationTypes
                .filter((item) => item.isActive || item.key === operation?.operationType.key)
                .map((item) => (
                  <option key={item.id} value={item.key}>
                    {item.label}
                  </option>
                ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="operation-title">عنوان عملیات *</Label>
            <Input
              id="operation-title"
              value={form.title}
              onChange={(event) => update('title', event.target.value)}
              className="mt-1.5"
              placeholder="مثلاً بکاپ کامل اطلاعات"
            />
          </div>
          <div>
            <Label>تاریخ انجام</Label>
            <div className="mt-1.5 flex gap-2">
              <JalaliDateInput
                value={form.performedDate}
                onChange={(value) => update('performedDate', value)}
                ariaLabel="تاریخ انجام اقدام"
              />
              <Input
                type="time"
                dir="ltr"
                value={form.performedTime}
                onChange={(event) => update('performedTime', event.target.value)}
                className="w-28 text-center"
                aria-label="ساعت انجام اقدام"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="operation-technician">تکنسین انجام‌دهنده</Label>
            <Select
              id="operation-technician"
              value={form.technicianId}
              onChange={(event) => update('technicianId', event.target.value)}
              className="mt-1.5"
            >
              <option value="">ثبت نشده</option>
              {technicians.map((technician) => (
                <option key={technician.id} value={technician.id}>
                  {technician.fullName}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="operation-size">حجم اطلاعات بکاپ / ریکاوری (مگابایت)</Label>
            <Input
              id="operation-size"
              type="number"
              min={0}
              step="0.1"
              dir="ltr"
              value={form.dataSizeMb}
              onChange={(event) => update('dataSizeMb', event.target.value)}
              className="mt-1.5"
              placeholder="مثلاً 2048"
            />
            <FieldHint>برای عملیات بدون حجم داده خالی بگذارید.</FieldHint>
          </div>
          <div>
            <Label htmlFor="operation-result">نتیجه عملیات</Label>
            <Select
              id="operation-result"
              value={form.result}
              onChange={(event) => update('result', event.target.value)}
              className="mt-1.5"
            >
              {OPERATION_RESULT_OPTIONS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="operation-storage">محل ذخیره فایل‌ها</Label>
            <Input
              id="operation-storage"
              value={form.storagePath}
              onChange={(event) => update('storagePath', event.target.value)}
              className="mt-1.5"
              dir="ltr"
              placeholder="مسیر پوشه ذخیره‌سازی روی شبکه"
            />
          </div>
          {!operation ? (
            <div className="sm:col-span-2">
              <Label htmlFor="operation-status">وضعیت دستگاه پس از این اقدام (اختیاری)</Label>
              <Select
                id="operation-status"
                value={form.deviceStatusAfter}
                onChange={(event) => update('deviceStatusAfter', event.target.value)}
                className="mt-1.5"
              >
                <option value="">بدون تغییر وضعیت</option>
                {statuses.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </Select>
              <FieldHint>
                در صورت انتخاب، وضعیت دستگاه به‌همراه تاریخ و کاربر در تاریخچه ثبت می‌شود.
              </FieldHint>
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <Label htmlFor="operation-description">توضیحات</Label>
            <Textarea
              id="operation-description"
              value={form.description}
              onChange={(event) => update('description', event.target.value)}
              className="mt-1.5"
              rows={3}
            />
          </div>
          <div className="sm:col-span-2">
            <FieldError>{error}</FieldError>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            انصراف
          </Button>
          <Button onClick={() => void handleSubmit()} loading={saving}>
            {operation ? 'ذخیره تغییرات' : 'ثبت اقدام'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
