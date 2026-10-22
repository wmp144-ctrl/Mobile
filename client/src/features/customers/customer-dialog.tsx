import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import type { Customer } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, FieldError, Label } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';

interface CustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer | null;
  onSaved?: (customer: Customer) => void | Promise<void>;
}

interface CustomerFormState {
  fullName: string;
  phone: string;
  phoneSecondary: string;
  jobTitle: string;
  nationalId: string;
  address: string;
  notes: string;
}

const EMPTY: CustomerFormState = {
  fullName: '',
  phone: '',
  phoneSecondary: '',
  jobTitle: '',
  nationalId: '',
  address: '',
  notes: '',
};

export function CustomerDialog({ open, onOpenChange, customer, onSaved }: CustomerDialogProps) {
  const toast = useToast();
  const [form, setForm] = useState<CustomerFormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      customer
        ? {
            fullName: customer.fullName,
            phone: customer.phone ?? '',
            phoneSecondary: customer.phoneSecondary ?? '',
            jobTitle: customer.jobTitle ?? '',
            nationalId: customer.nationalId ?? '',
            address: customer.address ?? '',
            notes: customer.notes ?? '',
          }
        : EMPTY,
    );
  }, [open, customer]);

  function update(field: keyof CustomerFormState, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (form.fullName.trim().length < 2) {
      setError('نام مشتری باید حداقل ۲ نویسه باشد.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        phoneSecondary: form.phoneSecondary.trim(),
        jobTitle: form.jobTitle.trim(),
        nationalId: form.nationalId.trim(),
        address: form.address.trim(),
        notes: form.notes.trim(),
      };
      const saved = customer
        ? await api.patch<Customer>(`/api/customers/${customer.id}`, {
            ...payload,
            version: customer.version,
          })
        : await api.post<Customer>('/api/customers', payload);
      toast.success(customer ? 'اطلاعات مشتری ویرایش شد.' : 'مشتری جدید ثبت شد.');
      await onSaved?.(saved);
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
          <DialogTitle>{customer ? 'ویرایش مشتری' : 'ثبت مشتری جدید'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="customer-name">نام و نام خانوادگی *</Label>
              <Input
                id="customer-name"
                value={form.fullName}
                onChange={(event) => update('fullName', event.target.value)}
                className="mt-1.5"
                placeholder="مثلاً سارا احمدی"
                required
              />
            </div>
            <div>
              <Label htmlFor="customer-job">نوع شغل</Label>
              <Input
                id="customer-job"
                value={form.jobTitle}
                onChange={(event) => update('jobTitle', event.target.value)}
                className="mt-1.5"
                placeholder="مثلاً کارمند"
              />
            </div>
            <div>
              <Label htmlFor="customer-phone">شماره تماس</Label>
              <Input
                id="customer-phone"
                value={form.phone}
                onChange={(event) => update('phone', event.target.value)}
                className="mt-1.5"
                dir="ltr"
                placeholder="09121234567"
              />
            </div>
            <div>
              <Label htmlFor="customer-phone2">شماره تماس دوم</Label>
              <Input
                id="customer-phone2"
                value={form.phoneSecondary}
                onChange={(event) => update('phoneSecondary', event.target.value)}
                className="mt-1.5"
                dir="ltr"
              />
            </div>
            <div>
              <Label htmlFor="customer-national">کد ملی</Label>
              <Input
                id="customer-national"
                value={form.nationalId}
                onChange={(event) => update('nationalId', event.target.value)}
                className="mt-1.5"
                dir="ltr"
              />
            </div>
            <div>
              <Label htmlFor="customer-address">آدرس</Label>
              <Input
                id="customer-address"
                value={form.address}
                onChange={(event) => update('address', event.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="customer-notes">یادداشت</Label>
            <Textarea
              id="customer-notes"
              value={form.notes}
              onChange={(event) => update('notes', event.target.value)}
              className="mt-1.5"
              rows={2}
            />
          </div>
          <FieldError>{error}</FieldError>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              انصراف
            </Button>
            <Button type="submit" loading={saving}>
              {customer ? 'ذخیره تغییرات' : 'ثبت مشتری'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
