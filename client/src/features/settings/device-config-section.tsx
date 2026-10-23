import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ListPlus,
  Pencil,
  Plus,
  Save,
  Settings2,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useApiQuery } from '@/lib/use-api';
import {
  FIELD_TYPE_OPTIONS,
  OPTION_CATEGORY_LABELS,
  OPTION_CATEGORY_ORDER,
} from '@/lib/device-status';
import type { AppSettings, DeviceConfigData, FieldDefinition, OptionItem } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, FieldError, FieldHint, Label } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const CUSTOM_GROUPS = ['مشخصات دستگاه', 'مشخصات آورنده', 'وضعیت دستگاه', 'اطلاعات تکمیلی'];

interface FieldFormState {
  labelFa: string;
  fieldType: string;
  groupName: string;
  placeholder: string;
  isRequired: boolean;
  isSearchable: boolean;
  isReportable: boolean;
  optionsText: string;
}

const EMPTY_FIELD: FieldFormState = {
  labelFa: '',
  fieldType: 'text',
  groupName: 'اطلاعات تکمیلی',
  placeholder: '',
  isRequired: false,
  isSearchable: true,
  isReportable: true,
  optionsText: '',
};

export function DeviceConfigSection({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<FieldDefinition | null>(null);
  const [fieldForm, setFieldForm] = useState<FieldFormState>(EMPTY_FIELD);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [savingField, setSavingField] = useState(false);
  const [optionDialogOpen, setOptionDialogOpen] = useState(false);
  const [optionCategory, setOptionCategory] = useState(OPTION_CATEGORY_ORDER[0]);
  const [editingOption, setEditingOption] = useState<OptionItem | null>(null);
  const [optionLabel, setOptionLabel] = useState('');
  const [optionError, setOptionError] = useState<string | null>(null);
  const [savingOption, setSavingOption] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<
    { kind: 'field' | 'option'; id: string; title: string } | null
  >(null);
  const [deleting, setDeleting] = useState(false);
  const [prefix, setPrefix] = useState('MR');
  const [dueDays, setDueDays] = useState('3');
  const [savingSettings, setSavingSettings] = useState(false);

  const configQuery = useApiQuery<DeviceConfigData>(
    () => api.get<DeviceConfigData>('/api/device-config'),
    [],
  );
  const settingsQuery = useApiQuery<AppSettings>(() => api.get<AppSettings>('/api/settings'), []);

  useEffect(() => {
    if (!settingsQuery.data) return;
    setPrefix(settingsQuery.data.devices.intakePrefix);
    setDueDays(String(settingsQuery.data.devices.defaultDueDays));
  }, [settingsQuery.data]);

  const fields = useMemo(
    () => [...(configQuery.data?.fields ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [configQuery.data],
  );
  const options = configQuery.data?.options ?? {};

  function openCreateField() {
    setEditingField(null);
    setFieldForm(EMPTY_FIELD);
    setFieldError(null);
    setFieldDialogOpen(true);
  }

  function openEditField(field: FieldDefinition) {
    setEditingField(field);
    setFieldForm({
      labelFa: field.label,
      fieldType: field.type,
      groupName: field.group,
      placeholder: field.placeholder ?? '',
      isRequired: field.isRequired,
      isSearchable: field.isSearchable,
      isReportable: field.isReportable,
      optionsText: field.options.map((option) => option.label).join('\n'),
    });
    setFieldError(null);
    setFieldDialogOpen(true);
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!canManage || savingSettings) return;
    const days = Number(dueDays);
    if (!Number.isInteger(days) || days < 0 || days > 180) {
      toast.error('مهلت پیش‌فرض تحویل باید عددی بین ۰ تا ۱۸۰ باشد.');
      return;
    }
    if (!/^[A-Za-z0-9]{1,8}$/.test(prefix.trim())) {
      toast.error('پیشوند کد پذیرش فقط شامل حروف انگلیسی و رقم (حداکثر ۸ نویسه) است.');
      return;
    }
    setSavingSettings(true);
    try {
      await api.patch('/api/settings', { intakePrefix: prefix.trim(), defaultDueDays: days });
      toast.success('تنظیمات شماره‌گذاری پذیرش ذخیره شد.');
      await Promise.all([settingsQuery.reload(), configQuery.reload()]);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveField() {
    if (savingField) return;
    if (fieldForm.labelFa.trim().length < 2) {
      setFieldError('عنوان فیلد باید حداقل ۲ نویسه باشد.');
      return;
    }
    const needsOptions = ['select', 'multi_select'].includes(fieldForm.fieldType);
    const optionLabels = fieldForm.optionsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (!editingField?.isSystem && needsOptions && optionLabels.length === 0) {
      setFieldError('برای فیلد انتخابی حداقل یک گزینه وارد کنید.');
      return;
    }

    const payload: Record<string, unknown> = {
      labelFa: fieldForm.labelFa.trim(),
      groupName: fieldForm.groupName,
      placeholder: fieldForm.placeholder.trim(),
      isRequired: fieldForm.isRequired,
      isSearchable: fieldForm.isSearchable,
      isReportable: fieldForm.isReportable,
    };
    if (!editingField) {
      payload.fieldType = fieldForm.fieldType;
    }
    if (!editingField?.isSystem && needsOptions) {
      payload.options = optionLabels.map((label) => ({ value: label, label }));
    }

    setSavingField(true);
    setFieldError(null);
    try {
      if (editingField) {
        await api.patch(`/api/device-config/fields/${editingField.id}`, payload);
      } else {
        await api.post('/api/device-config/fields', payload);
      }
      toast.success(editingField ? 'فیلد ویرایش شد.' : 'فیلد جدید اضافه شد.');
      setFieldDialogOpen(false);
      await configQuery.reload();
    } catch (error) {
      setFieldError(errorMessage(error));
    } finally {
      setSavingField(false);
    }
  }

  async function toggleField(
    field: FieldDefinition,
    key: 'isEnabled' | 'isRequired' | 'isSearchable' | 'isReportable',
  ) {
    try {
      await api.patch(`/api/device-config/fields/${field.id}`, { [key]: !field[key] });
      await configQuery.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function moveField(index: number, direction: -1 | 1) {
    const target = fields[index + direction];
    const current = fields[index];
    if (!target || !current) return;
    try {
      const currentOrder = current.sortOrder;
      const targetOrder = target.sortOrder === currentOrder ? currentOrder + direction * 10 : target.sortOrder;
      await api.patch(`/api/device-config/fields/${current.id}`, { sortOrder: targetOrder });
      await api.patch(`/api/device-config/fields/${target.id}`, { sortOrder: currentOrder });
      await configQuery.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  function openCreateOption(category: string) {
    setOptionCategory(category);
    setEditingOption(null);
    setOptionLabel('');
    setOptionError(null);
    setOptionDialogOpen(true);
  }

  function openEditOption(category: string, option: OptionItem) {
    setOptionCategory(category);
    setEditingOption(option);
    setOptionLabel(option.label);
    setOptionError(null);
    setOptionDialogOpen(true);
  }

  async function saveOption() {
    if (savingOption) return;
    if (optionLabel.trim().length === 0) {
      setOptionError('عنوان گزینه را وارد کنید.');
      return;
    }
    setSavingOption(true);
    setOptionError(null);
    try {
      if (editingOption) {
        await api.patch(`/api/device-config/options/${editingOption.id}`, {
          labelFa: optionLabel.trim(),
        });
      } else {
        await api.post('/api/device-config/options', {
          category: optionCategory,
          labelFa: optionLabel.trim(),
        });
      }
      toast.success(editingOption ? 'گزینه ویرایش شد.' : 'گزینه جدید اضافه شد.');
      setOptionDialogOpen(false);
      await configQuery.reload();
    } catch (error) {
      setOptionError(errorMessage(error));
    } finally {
      setSavingOption(false);
    }
  }

  async function toggleOption(option: OptionItem) {
    try {
      await api.patch(`/api/device-config/options/${option.id}`, { isActive: !option.isActive });
      await configQuery.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.delete(
        pendingDelete.kind === 'field'
          ? `/api/device-config/fields/${pendingDelete.id}`
          : `/api/device-config/options/${pendingDelete.id}`,
      );
      toast.success('حذف شد.');
      setPendingDelete(null);
      await configQuery.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  if (configQuery.loading && !configQuery.data) return <Spinner label="در حال دریافت تنظیمات فرم پذیرش..." />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Settings2 className="size-4" />
            </span>
            <div>
              <CardTitle>تنظیمات شماره‌گذاری پذیرش</CardTitle>
              <p className="mt-0.5 text-xs text-ink-400">کد پذیرش هر سال شمسی از یک شروع می‌شود.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveSettings} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label htmlFor="intake-prefix">پیشوند کد پذیرش</Label>
              <Input
                id="intake-prefix"
                value={prefix}
                onChange={(event) => setPrefix(event.target.value.toUpperCase())}
                className="mt-1.5"
                dir="ltr"
                disabled={!canManage}
                maxLength={8}
              />
              <FieldHint>نمونه کد: {prefix || 'MR'}-۱۴۰۵-۰۰۰۱</FieldHint>
            </div>
            <div>
              <Label htmlFor="due-days">مهلت پیش‌فرض تحویل (روز)</Label>
              <Input
                id="due-days"
                type="number"
                min={0}
                max={180}
                value={dueDays}
                onChange={(event) => setDueDays(event.target.value)}
                className="mt-1.5"
                dir="ltr"
                disabled={!canManage}
              />
              <FieldHint>صفر یعنی تاریخ تحویل به‌صورت پیش‌فرض تعیین نشود.</FieldHint>
            </div>
            {canManage ? (
              <div className="flex items-end">
                <Button type="submit" loading={savingSettings}>
                  <Save className="size-4" />
                  ذخیره تنظیمات پذیرش
                </Button>
              </div>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <SlidersHorizontal className="size-4" />
            </span>
            <div>
              <CardTitle>فیلدهای فرم پذیرش</CardTitle>
              <p className="mt-0.5 text-xs text-ink-400">
                فیلد جدید اضافه کنید یا فیلدهای غیرضروری را غیرفعال کنید.
              </p>
            </div>
          </div>
          {canManage ? (
            <Button variant="outline" onClick={openCreateField}>
              <Plus className="size-4" />
              فیلد جدید
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="p-0 pt-4">
          <Table className="min-w-[820px]">
            <TableHeader>
              <TableRow>
                <TableHead>عنوان فیلد</TableHead>
                <TableHead>نوع</TableHead>
                <TableHead>گروه</TableHead>
                <TableHead>الزامی</TableHead>
                <TableHead>فعال</TableHead>
                <TableHead>جست‌وجو</TableHead>
                <TableHead>گزارش</TableHead>
                <TableHead className="text-end">ترتیب / عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field, index) => (
                <TableRow key={field.id}>
                  <TableCell>
                    <div className="flex items-center gap-2 text-xs font-medium text-ink-800">
                      {field.label}
                      {field.isSystem ? <Badge>سیستمی</Badge> : <Badge variant="brand">سفارشی</Badge>}
                    </div>
                    <p className="mt-0.5 text-[10px] text-ink-400" dir="ltr">
                      {field.key}
                    </p>
                  </TableCell>
                  <TableCell className="text-xs text-ink-600">
                    {FIELD_TYPE_OPTIONS.find((item) => item.key === field.type)?.label ?? field.type}
                  </TableCell>
                  <TableCell className="text-xs text-ink-600">{field.group}</TableCell>
                  <TableCell>
                    {field.isLocked ? (
                      <Badge variant="warning">ثابت</Badge>
                    ) : (
                      <Switch
                        checked={field.isRequired}
                        onCheckedChange={() => void toggleField(field, 'isRequired')}
                        disabled={!canManage}
                        label=""
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {field.isLocked ? (
                      <Badge variant="success">همیشه فعال</Badge>
                    ) : (
                      <Switch
                        checked={field.isEnabled}
                        onCheckedChange={() => void toggleField(field, 'isEnabled')}
                        disabled={!canManage}
                        label=""
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={field.isSearchable}
                      onCheckedChange={() => void toggleField(field, 'isSearchable')}
                      disabled={!canManage}
                      label=""
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={field.isReportable}
                      onCheckedChange={() => void toggleField(field, 'isReportable')}
                      disabled={!canManage}
                      label=""
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="انتقال به بالا"
                        disabled={!canManage || index === 0}
                        onClick={() => void moveField(index, -1)}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="انتقال به پایین"
                        disabled={!canManage || index === fields.length - 1}
                        onClick={() => void moveField(index, 1)}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="ویرایش فیلد"
                        disabled={!canManage}
                        onClick={() => openEditField(field)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      {!field.isSystem ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="حذف فیلد"
                          disabled={!canManage}
                          onClick={() => setPendingDelete({ kind: 'field', id: field.id, title: field.label })}
                        >
                          <Trash2 className="size-4 text-rose-600" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <ListPlus className="size-4" />
            </span>
            <div>
              <CardTitle>فهرست‌های قابل مدیریت</CardTitle>
              <p className="mt-0.5 text-xs text-ink-400">
                نوع تجهیز، سازنده، لوازم همراه، نوع اقدام و وضعیت قفل.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {OPTION_CATEGORY_ORDER.map((category) => {
            const items = options[category] ?? [];
            return (
              <div key={category}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-ink-800">{OPTION_CATEGORY_LABELS[category]}</h4>
                  {canManage ? (
                    <Button variant="ghost" size="sm" onClick={() => openCreateOption(category)}>
                      <Plus className="size-4" />
                      افزودن
                    </Button>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 rounded-xl border border-ink-200 bg-surface px-3 py-1.5 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => canManage && void toggleOption(item)}
                        className={item.isActive ? 'text-ink-700' : 'text-ink-400 line-through'}
                        title={item.isActive ? 'غیرفعال کردن' : 'فعال کردن'}
                      >
                        {item.label}
                      </button>
                      {item.usageCount > 0 ? (
                        <span className="text-[10px] text-ink-400">
                          {item.usageCount.toLocaleString('fa-IR')} استفاده
                        </span>
                      ) : null}
                      {canManage ? (
                        <>
                          <button
                            type="button"
                            aria-label={`ویرایش ${item.label}`}
                            onClick={() => openEditOption(category, item)}
                            className="text-ink-400 hover:text-ink-700"
                          >
                            <Pencil className="size-3" />
                          </button>
                          {!item.isSystem ? (
                            <button
                              type="button"
                              aria-label={`حذف ${item.label}`}
                              onClick={() =>
                                setPendingDelete({ kind: 'option', id: item.id, title: item.label })
                              }
                              className="text-rose-400 hover:text-rose-600"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  ))}
                  {items.length === 0 ? <p className="text-xs text-ink-400">گزینه‌ای وجود ندارد.</p> : null}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={fieldDialogOpen} onOpenChange={setFieldDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingField ? `ویرایش فیلد «${editingField.label}»` : 'افزودن فیلد جدید'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="field-label">عنوان فیلد *</Label>
              <Input
                id="field-label"
                value={fieldForm.labelFa}
                onChange={(event) => setFieldForm((prev) => ({ ...prev, labelFa: event.target.value }))}
                className="mt-1.5"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="field-type">نوع فیلد</Label>
                <Select
                  id="field-type"
                  value={fieldForm.fieldType}
                  onChange={(event) => setFieldForm((prev) => ({ ...prev, fieldType: event.target.value }))}
                  className="mt-1.5"
                  disabled={Boolean(editingField)}
                >
                  {FIELD_TYPE_OPTIONS.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="field-group">گروه نمایش</Label>
                <Select
                  id="field-group"
                  value={CUSTOM_GROUPS.includes(fieldForm.groupName) ? fieldForm.groupName : 'اطلاعات تکمیلی'}
                  onChange={(event) => setFieldForm((prev) => ({ ...prev, groupName: event.target.value }))}
                  className="mt-1.5"
                >
                  {CUSTOM_GROUPS.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="field-placeholder">راهنمای داخل فیلد</Label>
              <Input
                id="field-placeholder"
                value={fieldForm.placeholder}
                onChange={(event) => setFieldForm((prev) => ({ ...prev, placeholder: event.target.value }))}
                className="mt-1.5"
              />
            </div>
            {!editingField?.isSystem && ['select', 'multi_select'].includes(fieldForm.fieldType) ? (
              <div>
                <Label htmlFor="field-options">گزینه‌ها (هر خط یک گزینه)</Label>
                <Textarea
                  id="field-options"
                  value={fieldForm.optionsText}
                  onChange={(event) => setFieldForm((prev) => ({ ...prev, optionsText: event.target.value }))}
                  className="mt-1.5"
                  rows={4}
                />
              </div>
            ) : null}
            <Switch
              checked={fieldForm.isRequired}
              onCheckedChange={(checked) => setFieldForm((prev) => ({ ...prev, isRequired: checked }))}
              id="field-required"
              label="تکمیل این فیلد الزامی باشد"
              description="فیلدهای الزامی هنگام ثبت پذیرش اعتبارسنجی می‌شوند."
            />
            <Switch
              checked={fieldForm.isSearchable}
              onCheckedChange={(checked) =>
                setFieldForm((prev) => ({ ...prev, isSearchable: checked }))
              }
              id="field-searchable"
              label="در جست‌وجوی تجهیزات استفاده شود"
              description="مقدار این فیلد در جست‌وجوی سراسری صفحه تجهیزات بررسی می‌شود."
            />
            <Switch
              checked={fieldForm.isReportable}
              onCheckedChange={(checked) =>
                setFieldForm((prev) => ({ ...prev, isReportable: checked }))
              }
              id="field-reportable"
              label="در گزارش‌گیری قابل انتخاب باشد"
              description="این فیلد به ستون‌های قابل انتخاب گزارش‌های تحلیلی اضافه می‌شود."
            />
            <FieldError>{fieldError}</FieldError>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFieldDialogOpen(false)} disabled={savingField}>
              انصراف
            </Button>
            <Button onClick={() => void saveField()} loading={savingField}>
              {editingField ? 'ذخیره تغییرات' : 'افزودن فیلد'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={optionDialogOpen} onOpenChange={setOptionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingOption ? 'ویرایش گزینه' : `افزودن گزینه به ${OPTION_CATEGORY_LABELS[optionCategory]}`}
            </DialogTitle>
          </DialogHeader>
          <div>
            <Label htmlFor="option-label">عنوان گزینه *</Label>
            <Input
              id="option-label"
              value={optionLabel}
              onChange={(event) => setOptionLabel(event.target.value)}
              className="mt-1.5"
            />
            <FieldError>{optionError}</FieldError>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOptionDialogOpen(false)} disabled={savingOption}>
              انصراف
            </Button>
            <Button onClick={() => void saveOption()} loading={savingOption}>
              {editingOption ? 'ذخیره' : 'افزودن'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={pendingDelete?.kind === 'field' ? 'حذف فیلد' : 'حذف گزینه'}
        description={
          pendingDelete
            ? `«${pendingDelete.title}» حذف می‌شود. اگر در پرونده‌ای استفاده شده باشد، حذف انجام نمی‌شود و می‌توانید آن را غیرفعال کنید.`
            : ''
        }
        confirmLabel="حذف"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
