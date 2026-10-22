import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LockKeyhole, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/stores/auth';
import { errorMessage } from '@/lib/errors';
import { initials } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/input';

export function LockScreen() {
  const user = useAuth((state) => state.user);
  const unlock = useAuth((state) => state.unlock);
  const logout = useAuth((state) => state.logout);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    setError(null);
    try {
      await unlock(password);
      setPassword('');
    } catch (unlockError) {
      setError(errorMessage(unlockError));
      setPassword('');
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 p-4 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-2xl border border-white/20 bg-white p-6 shadow-2xl shadow-ink-900/30 animate-fade-up">
        <div className="flex flex-col items-center text-center">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-xl font-bold text-white shadow-lg shadow-brand-900/20">
            {initials(user?.fullName ?? '')}
          </span>
          <div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-amber-600">
            <LockKeyhole className="size-3.5" />
            صفحه قفل شده است
          </div>
          <h2 className="mt-2 text-lg font-bold text-ink-900">{user?.fullName}</h2>
          <p className="mt-0.5 text-xs text-ink-500">{user?.role.nameFa}</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <div>
            <Label htmlFor="unlock-password">برای ادامه رمز عبور خود را وارد کنید</Label>
            <PasswordInput
              id="unlock-password"
              ref={inputRef}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="mt-1.5"
              aria-invalid={Boolean(error) || undefined}
            />
          </div>
          {error ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" loading={loading} disabled={!password}>
            باز کردن قفل
          </Button>
        </form>

        <div className="mt-5 flex items-center justify-between border-t border-ink-100 pt-4 text-xs">
          <span className="flex items-center gap-1 text-ink-400">
            <ShieldCheck className="size-3.5" />
            قفل خودکار پس از بی‌کاری
          </span>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex items-center gap-1 font-medium text-rose-600 hover:text-rose-700"
          >
            <LogOut className="size-3.5" />
            خروج از حساب
          </button>
        </div>
      </div>
    </div>
  );
}
