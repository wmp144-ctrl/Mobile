import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  ShieldCheck,
  Users,
  WifiOff,
  Wrench,
} from 'lucide-react';
import { useAuth } from '@/stores/auth';
import { errorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { FullScreenLoader } from '@/components/layout/full-screen-loader';

export function LoginPage() {
  const status = useAuth((state) => state.status);
  const login = useAuth((state) => state.login);
  const workshopName = useAuth((state) => state.workshopName);
  const appVersion = useAuth((state) => state.appVersion);
  const bootstrapError = useAuth((state) => state.bootstrapError);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === 'authed') navigate(from, { replace: true });
  }, [status, from, navigate]);

  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'needs-setup') return <Navigate to="/setup" replace />;
  if (status === 'authed') return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await login(username.trim(), password);
      setPassword('');
    } catch (loginError) {
      setError(errorMessage(loginError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-ink-50 lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-navy-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -left-24 -top-24 size-96 rounded-full bg-brand-600/30 blur-3xl" />
        <div className="absolute -bottom-32 right-0 size-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-900/40">
              <Wrench className="size-6" />
            </div>
            <div>
              <p className="text-lg font-bold">{workshopName || 'مدیریت تعمیرگاه'}</p>
              <p className="text-xs text-white/50">سامانه تخصصی موبایل و تجهیزات الکترونیکی</p>
            </div>
          </div>

          <h1 className="mt-16 max-w-md text-3xl font-bold leading-[1.5]">
            مدیریت دقیق تعمیرات،
            <br />
            <span className="text-brand-300">بدون دغدغه و کاملاً آفلاین</span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-7 text-white/60">
            تمام اطلاعات مشتریان، دستگاه‌ها و تعمیرات روی سرور داخلی کارگاه نگهداری می‌شود و
            همه کلاینت‌ها به‌صورت هم‌زمان از یک پایگاه داده امن استفاده می‌کنند.
          </p>
        </div>

        <div className="relative grid gap-3 sm:grid-cols-2">
          {[
            { icon: ShieldCheck, title: 'امنیت چندلایه', text: 'کنترل دسترسی نقش‌محور' },
            { icon: Users, title: 'چندکاربره', text: 'استفاده هم‌زمان روی شبکه' },
            { icon: CalendarDays, title: 'تقویم هجری شمسی', text: 'همه تاریخ‌ها شمسی' },
            { icon: WifiOff, title: 'کاملاً آفلاین', text: 'بدون نیاز به اینترنت' },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm"
            >
              <item.icon className="size-4 text-brand-300" />
              <p className="mt-2 text-sm font-medium">{item.title}</p>
              <p className="mt-0.5 text-[11px] text-white/45">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md animate-fade-up">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
              <Wrench className="size-5" />
            </div>
            <div>
              <p className="font-bold text-ink-900">{workshopName || 'مدیریت تعمیرگاه'}</p>
              <p className="text-[11px] text-ink-400">سامانه تخصصی تعمیرات</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-ink-900">ورود به حساب کاربری</h2>
          <p className="mt-2 text-sm leading-6 text-ink-500">
            نام کاربری و رمز عبوری که مدیر سامانه برای شما تعیین کرده است را وارد کنید.
          </p>

          {bootstrapError ? (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-800">
              {bootstrapError}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
            <div>
              <Label htmlFor="username">نام کاربری</Label>
              <Input
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="mt-1.5"
                autoComplete="username"
                dir="ltr"
                placeholder="username"
                required
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="password">رمز عبور</Label>
              <PasswordInput
                id="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1.5"
                autoComplete="current-password"
                placeholder="••••••••••"
                required
              />
            </div>

            {error ? (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-6 text-rose-700"
              >
                {error}
              </div>
            ) : null}

            <Button type="submit" className="w-full" loading={loading} disabled={!username || !password}>
              ورود به سامانه
              <ArrowLeft className="size-4" />
            </Button>
          </form>

          <p className="mt-8 text-center text-[11px] leading-6 text-ink-400">
            نسخه {appVersion || '۱.۰.۰'} — برای استفاده از سامانه باید به شبکه داخلی کارگاه متصل باشید.
          </p>
        </div>
      </section>
    </div>
  );
}
