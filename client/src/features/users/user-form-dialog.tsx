import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import type { PublicUser } from '@/lib/types';

type RoleOption = { id: string; key: string; nameFa: string };
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldHint, Input, Label } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: RoleOption[];
  user: PublicUser | null;
  onSaved: () => Promise<void> | void;
}

interface FormState {
  username: string;
  fullName: string;
  phone: string;
  roleId: string;
  password: string;
  isActive: boolean;
  mustChangePassword: boolean;
}

const EMPTY_FORM: FormState = {
  username: '',
  fullName: '',
  phone: '',
  roleId: '',
  password: '',
  isActive: true,
  mustChangePassword: true,
};

export function UserFormDialog({ open, onOpenChange, roles, user, onSaved }: UserFormDialogProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (user) {
      setForm({
        username: user.username,
        fullName: user.fullName,
        phone: user.phone ?? '',
        roleId: user.role.id,
        password: '',
        isActive: user.isActive,
        mustChangePassword: user.mustChangePassword,
      });
    } else {
      const defaultRole = roles.find((role) => role.key === 'technician') ?? roles[0];
      setForm({ ...EMPTY_FORM, roleId: defaultRole?.id ?? '' });
    }
  }, [open, user, roles]);

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError(null);

    if (!form.roleId) {
      setError('نقش کاربر را انتخاب کنید.');
      return;
    }
    if (!user && form.password.length < 10) {
      setError('رمز عبور باید حداقل ۱۰ نویسه باشد.');
      return;
    }

    setLoading(true);
    try {
      if (user) {
        await api.patch(`/api/users/${user.id}`, {
          username: form.username.trim(),
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          roleId: form.roleId,
          isActive: form.isActive,
          version: user.version,
        });
        toast.success('اطلاعات کاربر با موفقیت ذخیره شد.');
      } else {
        await api.post('/api/users', {
          username: form.username.trim(),
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          roleId: form.roleId,
          password: form.password,
          isActive: form.isActive,
          mustChangePassword: form.mustChangePassword,
        });
        toast.success('کاربر جدید ایجاد شد.');
      }
      await onSaved();
      onOpenChange(false);
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user ? 'ویرایش کاربر' : 'افزودن کاربر جدید'}</DialogTitle>
          <DialogDescription>
            {user
              ? 'تغییرات پس از ذخیره، بلافاصله برای این کاربر اعمال می‌شود.'
              : 'برای همکاران خود حساب کاربری بسازید و سطح دسترسی آن‌ها را مشخص کنید.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="user-fullName">نام و نام خانوادگی</Label>
              <Input
                id="user-fullName"
                value={form.fullName}
                onChange={(event) => update('fullName', event.target.value)}
                className="mt-1.5"
                placeholder="مثلاً مریم احمدی"
                required
              />
            </div>
            <div>
              <Label htmlFor="user-username">نام کاربری</Label>
              <Input
                id="user-username"
                value={form.username}
                onChange={(event) => update('username', event.target.value)}
                className="mt-1.5"
                dir="ltr"
                placeholder="maryam"
                required
              />
            </div>
            <div>
              <Label htmlFor="user-phone">شماره تماس (اختیاری)</Label>
              <Input
                id="user-phone"
                value={form.phone}
                onChange={(event) => update('phone', event.target.value)}
                className="mt-1.5"
                dir="ltr"
                placeholder="09121234567"
              />
            </div>
            <div>
              <Label htmlFor="user-role">نقش و سطح دسترسی</Label>
              <Select
                id="user-role"
                value={form.roleId}
                onChange={(event) => update('roleId', event.target.value)}
                className="mt-1.5"
              >
                <option value="">انتخاب نقش...</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.nameFa}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {!user ? (
            <div>
              <Label htmlFor="user-password">رمز عبور اولیه</Label>
              <PasswordInput
                id="user-password"
                value={form.password}
                onChange={(event) => update('password', event.target.value)}
                className="mt-1.5"
                autoComplete="new-password"
                placeholder="حداقل ۱۰ نویسه شامل حرف و رقم"
              />
              <FieldHint>
                رمز عبور به‌صورت هش‌شده ذخیره می‌شود و امکان بازیابی آن وجود ندارد؛ در صورت فراموشی
                می‌توانید رمز را بازنشانی کنید.
              </FieldHint>
            </div>
          ) : null}

          <div className="space-y-3 rounded-xl border border-ink-200 bg-ink-50/60 px-4 py-3">
            <Switch
              id="user-active"
              checked={form.isActive}
              onCheckedChange={(value) => update('isActive', value)}
              label="حساب کاربری فعال باشد"
              description="کاربر غیرفعال نمی‌تواند وارد سامانه شود و نشست‌های او بسته می‌شود."
            />
            {!user ? (
              <Switch
                id="user-must-change"
                checked={form.mustChangePassword}
                onCheckedChange={(value) => update('mustChangePassword', value)}
                label="تغییر رمز در اولین ورود"
                description="پیشنهاد می‌شود فعال بماند تا کاربر رمز اختصاصی خود را تعیین کند."
              />
            ) : null}
          </div>

          {error ? (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-6 text-rose-700">
              {error}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              انصراف
            </Button>
            <Button type="submit" loading={loading}>
              {user ? 'ذخیره تغییرات' : 'ایجاد کاربر'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
