import { X } from 'lucide-react';
import type { AnalyticsOptions } from '@/lib/types';
import { JalaliDateInput } from '@/components/ui/jalali-date-input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  activeFilterCount,
  JALALI_MONTH_OPTIONS,
  labelForOption,
  UNKNOWN_FILTER_VALUE,
  type ReportFilterForm,
} from './reporting';

interface FiltersPanelProps {
  form: ReportFilterForm;
  onChange: (field: keyof ReportFilterForm, value: string) => void;
  onClear: () => void;
  options: AnalyticsOptions | null;
  error?: string | null;
  className?: string;
}

function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <Label htmlFor={htmlFor} className="mb-1.5 block text-[11px] text-ink-500">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function FiltersPanel({
  form,
  onChange,
  onClear,
  options,
  error,
  className,
}: FiltersPanelProps) {
  const count = activeFilterCount(form);
  const equipmentTypes = options?.equipmentTypes ?? [];
  const manufacturers = options?.manufacturers ?? [];
  const models = options?.models ?? [];
  const jobs = options?.jobs ?? [];
  const technicians = options?.technicians ?? [];
  const statuses = options?.statuses ?? [];
  const operationTypes = options?.operationTypes ?? [];
  const years = options?.years ?? [];

  return (
    <div className={cn('space-y-3', className)}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Field label="از تاریخ (شمسی)" htmlFor="filter-from">
          <JalaliDateInput
            id="filter-from"
            value={form.fromDate}
            onChange={(value) => onChange('fromDate', value)}
            ariaLabel="از تاریخ شمسی"
            className="h-10 text-xs"
          />
        </Field>
        <Field label="تا تاریخ (شمسی)" htmlFor="filter-to">
          <JalaliDateInput
            id="filter-to"
            value={form.toDate}
            onChange={(value) => onChange('toDate', value)}
            ariaLabel="تا تاریخ شمسی"
            className="h-10 text-xs"
          />
        </Field>
        <Field label="سال شمسی" htmlFor="filter-year">
          <Select
            id="filter-year"
            value={form.year}
            onChange={(event) => onChange('year', event.target.value)}
            className="h-10 text-xs"
          >
            <option value="">همه سال‌ها</option>
            {years.map((year) => (
              <option key={year.value} value={year.value}>
                {year.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ماه شمسی" htmlFor="filter-month">
          <Select
            id="filter-month"
            value={form.month}
            onChange={(event) => onChange('month', event.target.value)}
            className="h-10 text-xs"
          >
            <option value="">همه ماه‌ها</option>
            {JALALI_MONTH_OPTIONS.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="نوع تجهیز" htmlFor="filter-equipment">
          <Select
            id="filter-equipment"
            value={form.equipmentType}
            onChange={(event) => onChange('equipmentType', event.target.value)}
            className="h-10 text-xs"
          >
            <option value="">همه تجهیزات</option>
            {equipmentTypes.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
                {typeof item.count === 'number' ? ` (${item.count})` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="سازنده" htmlFor="filter-manufacturer">
          <Select
            id="filter-manufacturer"
            value={form.manufacturer}
            onChange={(event) => onChange('manufacturer', event.target.value)}
            className="h-10 text-xs"
          >
            <option value="">همه سازندگان</option>
            {manufacturers.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
                {typeof item.count === 'number' ? ` (${item.count})` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="مدل" htmlFor="filter-model">
          <Select
            id="filter-model"
            value={form.model}
            onChange={(event) => onChange('model', event.target.value)}
            className="h-10 text-xs"
          >
            <option value="">همه مدل‌ها</option>
            {models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
            <option value={UNKNOWN_FILTER_VALUE}>نامشخص</option>
          </Select>
        </Field>
        <Field label="نوع شغل آورنده" htmlFor="filter-job">
          <Select
            id="filter-job"
            value={form.job}
            onChange={(event) => onChange('job', event.target.value)}
            className="h-10 text-xs"
          >
            <option value="">همه مشاغل</option>
            {jobs.map((job) => (
              <option key={job} value={job}>
                {job === UNKNOWN_FILTER_VALUE ? 'نامشخص' : job}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="تکنسین" htmlFor="filter-technician">
          <Select
            id="filter-technician"
            value={form.technicianId}
            onChange={(event) => onChange('technicianId', event.target.value)}
            className="h-10 text-xs"
          >
            <option value="">همه تکنسین‌ها</option>
            {technicians.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="وضعیت دستگاه" htmlFor="filter-status">
          <Select
            id="filter-status"
            value={form.status}
            onChange={(event) => onChange('status', event.target.value)}
            className="h-10 text-xs"
          >
            <option value="">همه وضعیت‌ها</option>
            {statuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="نوع عملیات" htmlFor="filter-operation">
          <Select
            id="filter-operation"
            value={form.operationType}
            onChange={(event) => onChange('operationType', event.target.value)}
            className="h-10 text-xs"
          >
            <option value="">همه عملیات‌ها</option>
            {operationTypes.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 w-full text-xs"
            onClick={onClear}
            disabled={count === 0}
          >
            <X className="size-3.5" />
            پاک‌کردن فیلترها
            {count > 0 ? <span className="text-ink-400">({count})</span> : null}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </p>
      ) : null}

      {count > 0 ? (
        <div className="flex flex-wrap gap-1.5 text-[11px] text-ink-500">
          {form.year ? <FilterChip label="سال" value={labelForOption(years.map((year) => ({ value: String(year.value), label: year.label })), form.year)} /> : null}
          {form.month ? (
            <FilterChip
              label="ماه"
              value={
                JALALI_MONTH_OPTIONS.find((month) => String(month.value) === form.month)?.label ??
                form.month
              }
            />
          ) : null}
          {form.equipmentType ? (
            <FilterChip
              label="تجهیز"
              value={labelForOption(equipmentTypes, form.equipmentType)}
            />
          ) : null}
          {form.manufacturer ? (
            <FilterChip label="برند" value={labelForOption(manufacturers, form.manufacturer)} />
          ) : null}
          {form.status ? <FilterChip label="وضعیت" value={labelForOption(statuses, form.status)} /> : null}
          {form.operationType ? (
            <FilterChip label="عملیات" value={labelForOption(operationTypes, form.operationType)} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FilterChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-brand-700">
      <span className="text-brand-400">{label}:</span>
      {value}
    </span>
  );
}
