import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import type { PermissionDefinition, Role } from '@/lib/types';
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
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface RoleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role | null;
  permissions: PermissionDefinition[];
  onSaved: () => Promise<void> | void;
}

export function RoleFormDialog({ open, onOpenChange, role, permissions, onSaved }: RoleFormDialogProps) {
  const [nameFa, setNameFa] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setError(null);
    setNameFa(role?.nameFa ?? '');
    setDescription(role?.description ?? '');
    setSelected(role?.permissions ?? []);
  }, [open, role]);

  const groups = useMemo(() => {
    const map = new Map<string, PermissionDefinition[]>();
    for (const permission of permissions) {
      const list = map.get(permission.group) ?? [];
      list.push(permission);
      map.set(permission.group, list);
    }
    return [...map.entries()];
  }, [permissions]);

  function toggle(key: string) {
    setSelected((previous) =>
      previous.includes(key) ? previous.filter((item) => item !== key) : [...previous, key],
    );
  }

  function toggleGroup(items: PermissionDefinition[]) {
    const keys = items.map((item) => item.key);
    const allSelected = keys.every((key) => selected.includes(key));
    setSelected((previous) =>
      allSelected ? previous.filter((key) => !keys.includes(key)) : [...new Set([...previous, ...keys])],
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    if (nameFa.trim().length < 3) {
      setError('نام نقش باید حداقل ۳ نویسه باشد.');
      return;
    }
    if (selected.length === 0) {
      setError('حداقل یک مجوز را انتخاب کنید.');
      return;
    }

    setLoading(true);
    try {
      if (role) {
        await api.patch(`/api/roles/${role.id}`, {
          nameFa: nameFa.trim(),
          description: description.trim(),
          permissions: selected,
          version: role.version,
        });
        toast.success('نقش و مجوزهای آن ذخیره شد.');
      } else {
        await api.post('/api/roles', {
          nameFa: nameFa.trim(),
          description: description.trim(),
          permissions: selected,
        });
        toast.success('نقش جدید ایجاد شد.');
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{role ? 'ویرایش نقش' : 'ایجاد نقش سفارشی'}</DialogTitle>
          <DialogDescription>
            مجوزهای این نقش را انتخاب کنید. کاربران دارای این نقش فقط به بخش‌های انتخاب‌شده دسترسی
            خواهند داشت.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="role-name">نام نقش</Label>
              <Input
                id="role-name"
                value={nameFa}
                onChange={(event) => setNameFa(event.target.value)}
                className="mt-1.5"
                placeholder="مثلاً مسئول پیگیری تعمیرات"
                required
              />
            </div>
            <div>
              <Label htmlFor="role-description">توضیح (اختیاری)</Label>
              <Textarea
                id="role-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="mt-1.5 min-h-11"
                rows={1}
                placeholder="شرح کوتاه وظایف این نقش"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink-700">مجوزها</p>
              <Badge variant="brand">{selected.length} مجوز انتخاب‌شده</Badge>
            </div>
            <div className="max-h-[42vh] space-y-3 overflow-y-auto pe-1 scrollbar-thin">
              {groups.map(([group, items]) => {
                const allSelected = items.every((item) => selected.includes(item.key));
                return (
                  <div key={group} className="rounded-xl border border-ink-200 bg-ink-50/40 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold text-ink-700">{group}</p>
                      <button
                        type="button"
                        onClick={() => toggleGroup(items)}
                        className="text-[11px] font-medium text-brand-600 hover:text-brand-700"
                      >
                        {allSelected ? 'حذف همه' : 'انتخاب همه'}
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {items.map((item) => (
                        <label
                          key={item.key}
                          className={cn(
                            'flex cursor-pointer items-start gap-2 rounded-lg border border-transparent bg-surface px-2.5 py-2 text-xs transition hover:border-ink-200',
                            selected.includes(item.key) && 'border-brand-200 bg-brand-50/60',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 size-3.5 accent-brand-600"
                            checked={selected.includes(item.key)}
                            onChange={() => toggle(item.key)}
                          />
                          <span className="flex-1 leading-5 text-ink-600">
                            {item.label}
                            {item.future ? (
                              <span className="ms-1 text-[10px] text-ink-400">(مرحله بعد)</span>
                            ) : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <FieldHint>
              مجوزهای «مرحله بعد» مربوط به بخش‌هایی هستند که در مراحل آینده پیاده‌سازی می‌شوند.
            </FieldHint>
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
              {role ? 'ذخیره تغییرات' : 'ایجاد نقش'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
