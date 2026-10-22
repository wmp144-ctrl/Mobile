import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import type { PublicUser } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldHint, Label } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { useToast } from '@/components/ui/toast';

interface ResetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: PublicUser | null;
  onDone: () => Promise<void> | void;
}

export function ResetPasswordDialog({ open, onOpenChange, user, onDone }: ResetPasswordDialogProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (open) {
      setPassword('');
      setConfirm('');
      setError(null);
    }
  }, [open]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user || loading) return;
    setError(null);
    if (password.length < 10) {
      setError('رمز عبور جدید باید حداقل ۱۰ نویسه باشد.');
      return;
    }
    if (password !== confirm) {
      setError('تکرار رمز عبور با رمز عبور یکسان نیست.');
      return;
    }
    setLoading(true);
    try {
      await api.post(`/api/users/${user.id}/reset-password`, { newPassword: password });
      toast.success('رمز عبور کاربر بازنشانی شد و نشست‌های او بسته شد.');
      await onDone();
      onOpenChange(false);
    } catch (resetError) {
      setError(errorMessage(resetError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>بازنشانی رمز عبور</DialogTitle>
          <DialogDescription>
            رمز عبور جدید برای «{user?.fullName}» تعیین کنید. کاربر در اولین ورود باید رمز را تغییر
            دهد و همه نشست‌های فعلی او بسته می‌شود.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="reset-password">رمز عبور جدید</Label>
            <PasswordInput
              id="reset-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1.5"
              autoComplete="new-password"
            />
            <FieldHint>حداقل ۱۰ نویسه شامل حرف انگلیسی و رقم.</FieldHint>
          </div>
          <div>
            <Label htmlFor="reset-confirm">تکرار رمز عبور جدید</Label>
            <PasswordInput
              id="reset-confirm"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className="mt-1.5"
              autoComplete="new-password"
            />
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
              بازنشانی رمز
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
