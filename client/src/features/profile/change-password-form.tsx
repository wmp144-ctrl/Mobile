import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { useAuth } from '@/stores/auth';
import { errorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { FieldHint, Label } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';

interface ChangePasswordFormProps {
  onSuccess?: () => void;
  submitLabel?: string;
}

export function ChangePasswordForm({ onSuccess, submitLabel = 'تغییر رمز عبور' }: ChangePasswordFormProps) {
  const changePassword = useAuth((state) => state.changePassword);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setSuccess(null);

    if (newPassword.length < 10) {
      setError('رمز عبور جدید باید حداقل ۱۰ نویسه باشد.');
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('رمز عبور جدید باید حداقل یک حرف انگلیسی و یک رقم داشته باشد.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('تکرار رمز عبور جدید با آن یکسان نیست.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('رمز عبور جدید نباید با رمز فعلی یکسان باشد.');
      return;
    }

    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('رمز عبور با موفقیت تغییر کرد و سایر نشست‌های شما بسته شد.');
      onSuccess?.();
    } catch (changeError) {
      setError(errorMessage(changeError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="current-password">رمز عبور فعلی</Label>
        <PasswordInput
          id="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          className="mt-1.5"
          autoComplete="current-password"
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="new-password">رمز عبور جدید</Label>
          <PasswordInput
            id="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="mt-1.5"
            autoComplete="new-password"
            required
          />
        </div>
        <div>
          <Label htmlFor="confirm-new-password">تکرار رمز عبور جدید</Label>
          <PasswordInput
            id="confirm-new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="mt-1.5"
            autoComplete="new-password"
            required
          />
        </div>
      </div>
      <FieldHint>حداقل ۱۰ نویسه، شامل حرف انگلیسی و رقم. رمز جدید را در جای امن نگهداری کنید.</FieldHint>

      {error ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-6 text-rose-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-6 text-emerald-700">
          {success}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" loading={loading} disabled={!currentPassword || !newPassword || !confirmPassword}>
          <KeyRound className="size-4" />
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
