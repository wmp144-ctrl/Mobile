import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Save, Search, UserPlus, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useApiQuery } from '@/lib/use-api';
import { usePermissions } from '@/lib/use-permissions';
import {
  formatJalaliDateTime,
  isoToJalaliDateInput,
  isoToTimeInput,
  jalaliDateTimeToIso,
  normalizeDigits,
} from '@/lib/jalali';
import type {
  Customer,
  DeviceConfigData,
  DeviceDetail,
  DuplicateDevice,
  FieldDefinition,
} from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, FieldError, FieldHint, Label } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { JalaliDateInput } from '@/components/ui/jalali-date-input';
import { PasswordInput } from '@/components/ui/password-input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { CustomerDialog } from '@/features/customers/customer-dialog';

interface SelectedCustomer {
  id: string;
  fullName: string;
  phone: string | null;
  jobTitle: string | null;
}

type CustomValue = string | boolean | string[];

interface FormState {
  customerId: string;
  broughtByName: string;
  broughtByJob: string;
  broughtByPhone: string;
  equipmentType: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  imei1: string;
  imei2: string;
  receivedDate: string;
  receivedTime: string;
  dueDate: string;
  physicalCondition: string;
  accessories: string[];
  lockStatus: string;
  devicePassword: string;
  clearDevicePassword: boolean;
  reportedProblem: string;
  notes: string;
  technicianId: string;
  customFields: Record<string, CustomValue>;
}

const EMPTY_FORM: FormState = {
  customerId: '',
  broughtByName: '',
  broughtByJob: '',
  broughtByPhone: '',
  equipmentType: '',
  manufacturer: '',
  model: '',
  serialNumber: '',
  imei1: '',
  imei2: '',
  receivedDate: '',
  receivedTime: '',
  dueDate: '',
  physicalCondition: '',
  accessories: [],
  lockStatus: 'unknown',
  devicePassword: '',
  clearDevicePassword: false,
  reportedProblem: '',
  notes: '',
  technicianId: '',
  customFields: {},
};

const REQUIRED_BY_DEFAULT = [
  'equipment_type',
  'brought_by_name',
  'brought_by_phone',
  'reported_problem',
  'received_at',
];

function digitsOnly(value: string): string {
  return normalizeDigits(value).replace(/\D/g, '');
}

function FieldBlock({
  label,
  required,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label>
        {label}
        {required ? <span className="ms-1 text-rose-600">*</span> : null}
      </Label>
      <div className="mt-1.5">{children}</div>
      {hint ? <FieldHint>{hint}</FieldHint> : null}
      <FieldError>{error}</FieldError>
    </div>
  );
}

export function DeviceFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const canManage = can('repairs.manage');

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerListOpen, setCustomerListOpen] = useState(false);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateDevice[]>([]);
  const [duplicatePrompt, setDuplicatePrompt] = useState<{
    payload: Record<string, unknown>;
    duplicates: DuplicateDevice[];
  } | null>(null);
  const initializedFor = useRef<string | null>(null);

  const configQuery = useApiQuery<DeviceConfigData>(
    () => api.get<DeviceConfigData>('/api/device-config'),
    [],
  );
  const detailQuery = useApiQuery<DeviceDetail | null>(
    () => (id ? api.get<DeviceDetail>(`/api/devices/${id}`) : Promise.resolve(null)),
    [id],
  );
  const customersQuery = useApiQuery<Customer[]>(
    () =>
      api.get<Customer[]>(
        `/api/customers/options?search=${encodeURIComponent(customerSearch.trim())}`,
      ),
    [customerSearch],
  );

  const fields = configQuery.data?.fields ?? [];
  const options = configQuery.data?.options;
  const detail = detailQuery.data ?? null;
  const fieldDefs = useMemo(() => new Map(fields.map((field) => [field.key, field])), [fields]);
  const customDefs = useMemo(() => fields.filter((field) => !field.isSystem), [fields]);

  const enabled = (key: string): boolean => fieldDefs.get(key)?.isEnabled ?? true;
  const required = (key: string): boolean =>
    fieldDefs.get(key)?.isRequired ?? REQUIRED_BY_DEFAULT.includes(key);

  useEffect(() => {
    if (!configQuery.data) return;
    if (isEdit && !detail) return;
    const target = id ?? 'new';
    if (initializedFor.current === target) return;

    if (detail) {
      const customValues: Record<string, CustomValue> = {};
      for (const field of customDefs) {
        const raw = detail.customFields?.[field.key];
        if (field.type === 'date' && typeof raw === 'string') {
          customValues[field.key] = isoToJalaliDateInput(raw);
        } else if (field.type === 'multi_select') {
          customValues[field.key] = Array.isArray(raw) ? raw.map(String) : [];
        } else if (field.type === 'checkbox') {
          customValues[field.key] = raw === true;
        } else {
          customValues[field.key] = raw === undefined || raw === null ? '' : String(raw);
        }
      }
      setForm({
        customerId: detail.owner.id,
        broughtByName: detail.broughtBy.name,
        broughtByJob: detail.broughtBy.job ?? '',
        broughtByPhone: detail.broughtBy.phone ?? '',
        equipmentType: detail.equipmentType.key,
        manufacturer: detail.manufacturer?.key ?? '',
        model: detail.model ?? '',
        serialNumber: detail.serialNumber ?? '',
        imei1: detail.imei1 ?? '',
        imei2: detail.imei2 ?? '',
        receivedDate: isoToJalaliDateInput(detail.receivedAt),
        receivedTime: isoToTimeInput(detail.receivedAt),
        dueDate: isoToJalaliDateInput(detail.dueAt),
        physicalCondition: detail.physicalCondition ?? '',
        accessories: detail.accessories,
        lockStatus: detail.lockStatus.key,
        devicePassword: '',
        clearDevicePassword: false,
        reportedProblem: detail.reportedProblem,
        notes: detail.notes ?? '',
        technicianId: detail.technician?.id ?? '',
        customFields: customValues,
      });
      setSelectedCustomer({
        id: detail.owner.id,
        fullName: detail.owner.fullName,
        phone: detail.owner.phone,
        jobTitle: detail.owner.jobTitle,
      });
    } else {
      const defaults: Record<string, CustomValue> = {};
      for (const field of customDefs) {
        defaults[field.key] = field.type === 'multi_select' ? [] : field.type === 'checkbox' ? false : '';
      }
      const activeEquipment = (options?.equipment_type ?? []).find((item) => item.isActive);
      const now = new Date();
      setForm({
        ...EMPTY_FORM,
        equipmentType: activeEquipment?.key ?? 'mobile',
        manufacturer: '',
        lockStatus: 'unknown',
        receivedDate: isoToJalaliDateInput(now),
        receivedTime: isoToTimeInput(now),
        customFields: defaults,
      });
    }
    initializedFor.current = target;
  }, [configQuery.data, detail, isEdit, id, customDefs, options]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const imei1 = digitsOnly(form.imei1);
      const imei2 = digitsOnly(form.imei2);
      const serial = form.serialNumber.trim();
      if (!imei1 && !imei2 && serial.length < 3) {
        setDuplicates([]);
        return;
      }
      const params = new URLSearchParams();
      if (imei1) params.set('imei1', imei1);
      if (imei2) params.set('imei2', imei2);
      if (serial) params.set('serialNumber', serial);
      if (id) params.set('excludeId', id);
      try {
        setDuplicates(await api.get<DuplicateDevice[]>(`/api/devices/duplicates?${params.toString()}`));
      } catch {
        setDuplicates([]);
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [form.imei1, form.imei2, form.serialNumber, id]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function updateCustom(key: string, value: CustomValue) {
    setForm((previous) => ({
      ...previous,
      customFields: { ...previous.customFields, [key]: value },
    }));
  }

  function toggleAccessory(keyValue: string) {
    setForm((previous) => ({
      ...previous,
      accessories: previous.accessories.includes(keyValue)
        ? previous.accessories.filter((item) => item !== keyValue)
        : [...previous.accessories, keyValue],
    }));
  }

  function validate(): { payload: Record<string, unknown> } | null {
    const next: Record<string, string> = {};
    if (!selectedCustomer) next.customer = 'مالک دستگاه (مشتری) را انتخاب کنید.';
    if (enabled('brought_by_name') && !form.broughtByName.trim()) {
      next.broughtByName = 'نام آورنده را وارد کنید.';
    }
    if (enabled('brought_by_phone') && required('brought_by_phone') && !form.broughtByPhone.trim()) {
      next.broughtByPhone = 'شماره تماس آورنده را وارد کنید.';
    }
    if (!form.equipmentType) next.equipmentType = 'نوع تجهیز را انتخاب کنید.';
    if (enabled('manufacturer') && required('manufacturer') && !form.manufacturer) {
      next.manufacturer = 'سازنده را انتخاب کنید.';
    }
    if (enabled('model') && required('model') && !form.model.trim()) {
      next.model = 'مدل دقیق دستگاه را وارد کنید.';
    }
    const imei1 = digitsOnly(form.imei1);
    const imei2 = digitsOnly(form.imei2);
    if (imei1 && imei1.length !== 15) next.imei1 = 'IMEI 1 باید دقیقاً ۱۵ رقم باشد.';
    if (imei2 && imei2.length !== 15) next.imei2 = 'IMEI 2 باید دقیقاً ۱۵ رقم باشد.';
    if (!form.reportedProblem.trim()) next.reportedProblem = 'مشکل اعلام‌شده را وارد کنید.';

    const receivedIso = jalaliDateTimeToIso(form.receivedDate, form.receivedTime);
    if (!receivedIso) next.receivedAt = 'زمان دریافت دستگاه معتبر نیست.';
    let dueIso: string | null = null;
    if (form.dueDate.trim()) {
      dueIso = jalaliDateTimeToIso(form.dueDate, '23:59');
      if (!dueIso) next.dueAt = 'تاریخ تحویل پیش‌بینی‌شده معتبر نیست.';
    }

    const customPayload: Record<string, unknown> = {};
    for (const field of customDefs) {
      if (!field.isEnabled) continue;
      const value = form.customFields[field.key];
      const isEmpty =
        value === undefined ||
        value === '' ||
        (Array.isArray(value) && value.length === 0);
      if (isEmpty) {
        if (field.isRequired) next[`custom_${field.key}`] = `مقدار «${field.label}» الزامی است.`;
        continue;
      }
      if (field.type === 'date' && typeof value === 'string') {
        const iso = jalaliDateTimeToIso(value);
        if (!iso) {
          next[`custom_${field.key}`] = `تاریخ «${field.label}» معتبر نیست.`;
          continue;
        }
        customPayload[field.key] = iso;
      } else if (field.type === 'number') {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
          next[`custom_${field.key}`] = `مقدار «${field.label}» باید عدد باشد.`;
          continue;
        }
        customPayload[field.key] = numeric;
      } else {
        customPayload[field.key] = value;
      }
    }

    setErrors(next);
    if (Object.keys(next).length > 0) {
      toast.error('لطفاً خطاهای فرم را برطرف کنید.');
      return null;
    }

    const payload: Record<string, unknown> = {
      customerId: selectedCustomer?.id,
      broughtByName: form.broughtByName.trim(),
      broughtByJob: form.broughtByJob.trim(),
      broughtByPhone: form.broughtByPhone.trim(),
      equipmentType: form.equipmentType,
      manufacturer: form.manufacturer,
      model: form.model.trim(),
      serialNumber: form.serialNumber.trim(),
      imei1: imei1 || '',
      imei2: imei2 || '',
      receivedAt: receivedIso,
      dueAt: dueIso ?? '',
      physicalCondition: form.physicalCondition.trim(),
      accessories: form.accessories,
      lockStatus: form.lockStatus,
      reportedProblem: form.reportedProblem.trim(),
      notes: form.notes.trim(),
      technicianId: form.technicianId,
      customFields: customPayload,
    };
    if (form.devicePassword.trim()) payload.devicePassword = form.devicePassword.trim();
    if (isEdit && detail) {
      payload.version = detail.version;
      payload.clearDevicePassword = form.clearDevicePassword;
    }
    return { payload };
  }

  async function submit(payload: Record<string, unknown>) {
    setSaving(true);
    try {
      const saved = isEdit && id
        ? await api.patch<DeviceDetail>(`/api/devices/${id}`, payload)
        : await api.post<DeviceDetail>('/api/devices', payload);
      toast.success(isEdit ? 'پرونده دستگاه ویرایش شد.' : `دستگاه با کد ${saved.intakeCode} پذیرش شد.`);
      setDuplicatePrompt(null);
      navigate(`/devices/${saved.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'DEVICE_DUPLICATE') {
        const details = error.details as { duplicates?: DuplicateDevice[] } | undefined;
        setDuplicatePrompt({ payload, duplicates: details?.duplicates ?? [] });
        return;
      }
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving || !canManage) return;
    const result = validate();
    if (result) void submit(result.payload);
  }

  function renderCustomField(field: FieldDefinition) {
    if (!field.isEnabled) return null;
    const error = errors[`custom_${field.key}`];
    const value = form.customFields[field.key];
    const common = { placeholder: field.placeholder ?? undefined };
    switch (field.type) {
      case 'textarea':
        return (
          <FieldBlock key={field.id} label={field.label} required={field.isRequired} error={error}>
            <Textarea
              value={String(value ?? '')}
              onChange={(event) => updateCustom(field.key, event.target.value)}
              rows={2}
              {...common}
            />
          </FieldBlock>
        );
      case 'number':
        return (
          <FieldBlock key={field.id} label={field.label} required={field.isRequired} error={error}>
            <Input
              type="number"
              dir="ltr"
              value={String(value ?? '')}
              onChange={(event) => updateCustom(field.key, event.target.value)}
              {...common}
            />
          </FieldBlock>
        );
      case 'date':
        return (
          <FieldBlock key={field.id} label={field.label} required={field.isRequired} error={error}>
            <JalaliDateInput
              value={String(value ?? '')}
              onChange={(next) => updateCustom(field.key, next)}
              ariaLabel={field.label}
            />
          </FieldBlock>
        );
      case 'select':
        return (
          <FieldBlock key={field.id} label={field.label} required={field.isRequired} error={error}>
            <Select
              value={String(value ?? '')}
              onChange={(event) => updateCustom(field.key, event.target.value)}
              aria-label={field.label}
            >
              <option value="">انتخاب کنید...</option>
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FieldBlock>
        );
      case 'multi_select':
        return (
          <FieldBlock key={field.id} label={field.label} required={field.isRequired} error={error}>
            <div className="flex flex-wrap gap-2">
              {field.options.map((option) => {
                const list = Array.isArray(value) ? value : [];
                const isSelected = list.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      updateCustom(
                        field.key,
                        isSelected
                          ? list.filter((item) => item !== option.value)
                          : [...list, option.value],
                      )
                    }
                    className={cn(
                      'rounded-xl border px-3 py-1.5 text-xs transition',
                      isSelected
                        ? 'border-brand-300 bg-brand-50 text-brand-700'
                        : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300',
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </FieldBlock>
        );
      case 'checkbox':
        return (
          <div key={field.id} className="flex items-center pt-6">
            <Switch
              checked={value === true}
              onCheckedChange={(checked) => updateCustom(field.key, checked)}
              id={`custom-${field.key}`}
              label={field.label}
            />
          </div>
        );
      default:
        return (
          <FieldBlock key={field.id} label={field.label} required={field.isRequired} error={error}>
            <Input
              value={String(value ?? '')}
              onChange={(event) => updateCustom(field.key, event.target.value)}
              {...common}
            />
          </FieldBlock>
        );
    }
  }

  const customInGroup = (group: string) =>
    customDefs.filter((field) => field.isEnabled && field.group === group).map(renderCustomField);
  const customGroups = [...new Set(customDefs.filter((field) => field.isEnabled).map((field) => field.group))];
  const otherGroups = customGroups.filter(
    (group) =>
      !['مشخصات دستگاه', 'مشخصات آورنده', 'وضعیت دستگاه', 'اطلاعات تکمیلی'].includes(group),
  );

  const loading = configQuery.loading || (isEdit && detailQuery.loading) || initializedFor.current !== (id ?? 'new');
  const activeLockOptions = (options?.lock_status ?? []).filter((option) => option.isActive);

  if (!canManage) {
    return (
      <div>
        <PageHeader title="فرم پذیرش دستگاه" />
        <Card>
          <CardContent>
            <p className="text-sm text-ink-600">شما اجازه ثبت یا ویرایش پرونده دستگاه را ندارید.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={isEdit ? `ویرایش پرونده ${detail?.intakeCode ?? ''}` : 'پذیرش دستگاه جدید'}
        description={
          isEdit
            ? 'اطلاعات پرونده را ویرایش کنید. تاریخچه تغییرات وضعیت و اقدامات حفظ می‌شود.'
            : 'فیلدهای ضروری را تکمیل کنید؛ کد پذیرش به‌صورت خودکار و یکتا تولید می‌شود.'
        }
        actions={
          <Link to={isEdit && id ? `/devices/${id}` : '/devices'}>
            <Button variant="outline" type="button">
              <ArrowRight className="size-4" />
              بازگشت
            </Button>
          </Link>
        }
      />

      {loading ? <Spinner label="در حال آماده‌سازی فرم..." /> : null}

      {configQuery.error || detailQuery.error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {configQuery.error ?? detailQuery.error}
        </div>
      ) : null}

      {!loading ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>مشخصات دستگاه</CardTitle>
              {isEdit && detail ? (
                <Badge variant="brand" dir="ltr">
                  {detail.intakeCode}
                </Badge>
              ) : (
                <span className="text-xs text-ink-400">کد پذیرش خودکار</span>
              )}
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {enabled('equipment_type') ? (
                <FieldBlock
                  label="نوع تجهیز"
                  required={required('equipment_type')}
                  error={errors.equipmentType}
                >
                  <Select
                    value={form.equipmentType}
                    onChange={(event) => update('equipmentType', event.target.value)}
                    aria-label="نوع تجهیز"
                  >
                    <option value="">انتخاب کنید...</option>
                    {(options?.equipment_type ?? [])
                      .filter((option) => option.isActive)
                      .map((option) => (
                        <option key={option.id} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                  </Select>
                </FieldBlock>
              ) : null}

              {enabled('manufacturer') ? (
                <FieldBlock
                  label="سازنده"
                  required={required('manufacturer')}
                  error={errors.manufacturer}
                >
                  <Select
                    value={form.manufacturer}
                    onChange={(event) => update('manufacturer', event.target.value)}
                    aria-label="سازنده"
                  >
                    <option value="">انتخاب نشده</option>
                    {(options?.manufacturer ?? [])
                      .filter((option) => option.isActive)
                      .map((option) => (
                        <option key={option.id} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                  </Select>
                </FieldBlock>
              ) : null}

              {enabled('model') ? (
                <FieldBlock label="مدل دقیق دستگاه" required={required('model')} error={errors.model}>
                  <Input
                    value={form.model}
                    onChange={(event) => update('model', event.target.value)}
                    placeholder="مثلاً Galaxy A54"
                  />
                </FieldBlock>
              ) : null}

              {enabled('serial_number') ? (
                <FieldBlock label="شماره سریال" error={errors.serialNumber}>
                  <Input
                    dir="ltr"
                    value={form.serialNumber}
                    onChange={(event) => update('serialNumber', event.target.value)}
                    placeholder="S/N"
                  />
                </FieldBlock>
              ) : null}

              {enabled('imei1') ? (
                <FieldBlock label="IMEI 1" error={errors.imei1}>
                  <Input
                    dir="ltr"
                    inputMode="numeric"
                    value={form.imei1}
                    onChange={(event) => update('imei1', event.target.value)}
                    placeholder="۱۵ رقم"
                  />
                </FieldBlock>
              ) : null}

              {enabled('imei2') ? (
                <FieldBlock label="IMEI 2" error={errors.imei2}>
                  <Input
                    dir="ltr"
                    inputMode="numeric"
                    value={form.imei2}
                    onChange={(event) => update('imei2', event.target.value)}
                    placeholder="۱۵ رقم"
                  />
                </FieldBlock>
              ) : null}

              {customInGroup('مشخصات دستگاه')}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>مالک دستگاه و آورنده</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-1">
                <Label>
                  مالک دستگاه (مشتری)<span className="ms-1 text-rose-600">*</span>
                </Label>
                {selectedCustomer ? (
                  <div className="mt-1.5 flex items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50/60 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-800">
                        {selectedCustomer.fullName}
                      </p>
                      <p className="truncate text-xs text-ink-500" dir="ltr">
                        {selectedCustomer.phone || 'بدون شماره'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="تغییر مشتری"
                      onClick={() => {
                        setSelectedCustomer(null);
                        update('customerId', '');
                      }}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="relative mt-1.5">
                    <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
                    <Input
                      value={customerSearch}
                      onChange={(event) => {
                        setCustomerSearch(event.target.value);
                        setCustomerListOpen(true);
                      }}
                      onFocus={() => setCustomerListOpen(true)}
                      placeholder="جستجوی نام یا تلفن مشتری"
                      className="ps-9"
                      aria-label="جستجوی مشتری"
                    />
                    {customerListOpen ? (
                      <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-ink-200 bg-white p-1 shadow-xl">
                        {(customersQuery.data ?? []).map((customer) => (
                          <button
                            key={customer.id}
                            type="button"
                            className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-start text-sm hover:bg-ink-50"
                            onClick={() => {
                              setSelectedCustomer({
                                id: customer.id,
                                fullName: customer.fullName,
                                phone: customer.phone,
                                jobTitle: customer.jobTitle,
                              });
                              update('customerId', customer.id);
                              if (!form.broughtByPhone && customer.phone) {
                                update('broughtByPhone', customer.phone);
                              }
                              if (!form.broughtByJob && customer.jobTitle) {
                                update('broughtByJob', customer.jobTitle);
                              }
                              setCustomerListOpen(false);
                            }}
                          >
                            <span className="font-medium text-ink-800">{customer.fullName}</span>
                            <span className="text-xs text-ink-500" dir="ltr">
                              {customer.phone || '—'}
                            </span>
                          </button>
                        ))}
                        {(customersQuery.data ?? []).length === 0 ? (
                          <p className="px-3 py-2 text-xs text-ink-500">مشتری پیدا نشد.</p>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setCustomerListOpen(false);
                            setNewCustomerOpen(true);
                          }}
                          className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-ink-100 px-3 py-2 text-sm text-brand-700 hover:bg-brand-50"
                        >
                          <UserPlus className="size-4" />
                          ثبت مشتری جدید
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
                <FieldError>{errors.customer}</FieldError>
              </div>

              {enabled('brought_by_name') ? (
                <FieldBlock
                  label="نام آورنده"
                  required={required('brought_by_name')}
                  error={errors.broughtByName}
                >
                  <Input
                    value={form.broughtByName}
                    onChange={(event) => update('broughtByName', event.target.value)}
                  />
                </FieldBlock>
              ) : null}

              {enabled('brought_by_job') ? (
                <FieldBlock label="نوع شغل آورنده">
                  <Input
                    value={form.broughtByJob}
                    onChange={(event) => update('broughtByJob', event.target.value)}
                    placeholder="مثلاً دانشجو"
                  />
                </FieldBlock>
              ) : null}

              {enabled('brought_by_phone') ? (
                <FieldBlock
                  label="شماره تماس آورنده"
                  required={required('brought_by_phone')}
                  error={errors.broughtByPhone}
                >
                  <Input
                    dir="ltr"
                    value={form.broughtByPhone}
                    onChange={(event) => update('broughtByPhone', event.target.value)}
                    placeholder="09121234567"
                  />
                </FieldBlock>
              ) : null}

              {customInGroup('مشخصات آورنده')}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>وضعیت و زمان</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {enabled('received_at') ? (
                <FieldBlock label="زمان دریافت دستگاه" required={required('received_at')} error={errors.receivedAt}>
                  <div className="flex gap-2">
                    <JalaliDateInput
                      value={form.receivedDate}
                      onChange={(value) => update('receivedDate', value)}
                      ariaLabel="تاریخ دریافت"
                    />
                    <Input
                      dir="ltr"
                      type="time"
                      value={form.receivedTime}
                      onChange={(event) => update('receivedTime', event.target.value)}
                      className="w-28 text-center"
                      aria-label="ساعت دریافت"
                    />
                  </div>
                </FieldBlock>
              ) : null}

              {enabled('due_at') ? (
                <FieldBlock
                  label="تاریخ تحویل پیش‌بینی‌شده"
                  error={errors.dueAt}
                  hint="در صورت خالی گذاشتن، مهلت پیش‌فرض سامانه اعمال می‌شود."
                >
                  <JalaliDateInput
                    value={form.dueDate}
                    onChange={(value) => update('dueDate', value)}
                    ariaLabel="تاریخ تحویل پیش‌بینی‌شده"
                  />
                </FieldBlock>
              ) : null}

              {enabled('technician_id') ? (
                <FieldBlock label="تکنسین مسئول">
                  <Select
                    value={form.technicianId}
                    onChange={(event) => update('technicianId', event.target.value)}
                    aria-label="تکنسین مسئول"
                  >
                    <option value="">تعیین نشده</option>
                    {(configQuery.data?.technicians ?? []).map((technician) => (
                      <option key={technician.id} value={technician.id}>
                        {technician.fullName} — {technician.roleName}
                      </option>
                    ))}
                  </Select>
                </FieldBlock>
              ) : null}

              {enabled('lock_status') ? (
                <FieldBlock label="وضعیت قفل دستگاه">
                  <Select
                    value={form.lockStatus}
                    onChange={(event) => update('lockStatus', event.target.value)}
                    aria-label="وضعیت قفل دستگاه"
                  >
                    {activeLockOptions.map((option) => (
                      <option key={option.id} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </FieldBlock>
              ) : null}

              {enabled('device_password') ? (
                <FieldBlock
                  label="رمز یا الگوی دستگاه"
                  hint={
                    isEdit
                      ? 'برای نگه‌داشتن رمز فعلی خالی بگذارید. رمز به‌صورت رمزنگاری‌شده ذخیره می‌شود.'
                      : 'اختیاری — به‌صورت رمزنگاری‌شده ذخیره می‌شود.'
                  }
                >
                  <PasswordInput
                    value={form.devicePassword}
                    onChange={(event) => update('devicePassword', event.target.value)}
                    placeholder={isEdit && detail?.hasPassword ? 'بدون تغییر' : 'رمز یا الگو'}
                    autoComplete="off"
                  />
                  {isEdit && detail?.hasPassword ? (
                    <label className="mt-2 flex items-center gap-2 text-xs text-ink-600">
                      <input
                        type="checkbox"
                        checked={form.clearDevicePassword}
                        onChange={(event) => update('clearDevicePassword', event.target.checked)}
                      />
                      حذف رمز ذخیره‌شده این دستگاه
                    </label>
                  ) : null}
                </FieldBlock>
              ) : null}

              {enabled('accessories') ? (
                <FieldBlock label="لوازم همراه" className="sm:col-span-2 lg:col-span-3">
                  <div className="flex flex-wrap gap-2">
                    {(options?.accessory ?? [])
                      .filter((option) => option.isActive)
                      .map((option) => {
                        const selected = form.accessories.includes(option.key);
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => toggleAccessory(option.key)}
                            className={cn(
                              'rounded-xl border px-3 py-1.5 text-xs transition',
                              selected
                                ? 'border-brand-300 bg-brand-50 text-brand-700'
                                : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300',
                            )}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                  </div>
                  {form.accessories.some(
                    (key) => !(options?.accessory ?? []).some((option) => option.key === key),
                  ) ? (
                    <p className="mt-2 text-xs text-amber-600">
                      برخی لوازم ثبت‌شده قبلی در فهرست فعلی غیرفعال شده‌اند و با ذخیره حفظ می‌شوند.
                    </p>
                  ) : null}
                </FieldBlock>
              ) : null}

              {enabled('physical_condition') ? (
                <FieldBlock label="وضعیت ظاهری دستگاه" className="sm:col-span-2 lg:col-span-3">
                  <Textarea
                    value={form.physicalCondition}
                    onChange={(event) => update('physicalCondition', event.target.value)}
                    rows={2}
                    placeholder="خط و خش، شکستگی، آسیب‌های بدنه و صفحه..."
                  />
                </FieldBlock>
              ) : null}

              {customInGroup('وضعیت دستگاه')}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>اطلاعات تکمیلی</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {enabled('reported_problem') ? (
                <FieldBlock
                  label="مشکل اعلام‌شده توسط مشتری"
                  required={required('reported_problem')}
                  error={errors.reportedProblem}
                  className="sm:col-span-2"
                >
                  <Textarea
                    value={form.reportedProblem}
                    onChange={(event) => update('reportedProblem', event.target.value)}
                    rows={3}
                    placeholder="شرح مشکل به گفته مشتری"
                  />
                </FieldBlock>
              ) : null}

              {enabled('notes') ? (
                <FieldBlock label="توضیحات تکمیلی" className="sm:col-span-2">
                  <Textarea
                    value={form.notes}
                    onChange={(event) => update('notes', event.target.value)}
                    rows={2}
                  />
                </FieldBlock>
              ) : null}

              {customInGroup('اطلاعات تکمیلی')}
            </CardContent>
          </Card>

          {otherGroups.map((group) => (
            <Card key={group}>
              <CardHeader>
                <CardTitle>{group}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {customInGroup(group)}
              </CardContent>
            </Card>
          ))}

          {duplicates.length > 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-800">
                    شناسه دستگاه قبلاً ثبت شده است
                  </p>
                  <p className="mt-1 text-xs leading-6 text-amber-700">
                    برای همین IMEI یا شماره سریال سوابق زیر وجود دارد. با ذخیره، پرونده جدیدی برای
                    همین دستگاه ساخته می‌شود و سوابق قبلی حفظ می‌شوند.
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-amber-800">
                    {duplicates.map((item) => (
                      <li key={item.id}>
                        <Link to={`/devices/${item.id}`} className="underline">
                          {item.intakeCode}
                        </Link>{' '}
                        — {item.ownerName} — {item.model || 'بدون مدل'} —{' '}
                        {formatJalaliDateTime(item.receivedAt)} — {item.status.label}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Link to={isEdit && id ? `/devices/${id}` : '/devices'}>
              <Button type="button" variant="outline">
                انصراف
              </Button>
            </Link>
            <Button type="submit" loading={saving}>
              <Save className="size-4" />
              {isEdit ? 'ذخیره تغییرات' : 'ثبت پذیرش دستگاه'}
            </Button>
          </div>
        </form>
      ) : null}

      <CustomerDialog
        open={newCustomerOpen}
        onOpenChange={setNewCustomerOpen}
        onSaved={(customer) => {
          setSelectedCustomer({
            id: customer.id,
            fullName: customer.fullName,
            phone: customer.phone,
            jobTitle: customer.jobTitle,
          });
          update('customerId', customer.id);
          if (customer.phone && !form.broughtByPhone) update('broughtByPhone', customer.phone);
          if (customer.jobTitle && !form.broughtByJob) update('broughtByJob', customer.jobTitle);
          void customersQuery.reload();
        }}
      />

      <Dialog open={Boolean(duplicatePrompt)} onOpenChange={(open) => !open && setDuplicatePrompt(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>ادامه با شناسه تکراری</DialogTitle>
            <DialogDescription>
              دستگاهی با همین IMEI یا شماره سریال قبلاً ثبت شده است. آیا پرونده جدید برای همین
              دستگاه ثبت شود؟ سوابق قبلی و تاریخچه آن‌ها حفظ می‌شود.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl bg-ink-50 p-3 text-xs text-ink-700">
            {(duplicatePrompt?.duplicates ?? []).map((item) => (
              <li key={item.id}>
                {item.intakeCode} — {item.ownerName} — {item.model || 'بدون مدل'} —{' '}
                {formatJalaliDateTime(item.receivedAt)}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicatePrompt(null)} disabled={saving}>
              بازگشت و اصلاح
            </Button>
            <Button
              loading={saving}
              onClick={() =>
                duplicatePrompt &&
                void submit({ ...duplicatePrompt.payload, allowDuplicate: true })
              }
            >
              بله، ادامه بده
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
