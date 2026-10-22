import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ShieldCheck, Wrench, ArrowLeft } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useAuth } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { FieldHint, Input, Label } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { useToast } from '@/components/ui/toast';
import { FullScreenLoader } from '@/components/layout/full-screen-loader';

export function SetupPage() {
  const status = useAuth((state) => state.status);
  const login = useAuth((state) => state.login);
  const workshopName = useAuth((state) => state.workshopName);
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({
    workshopName: '',
    fullName: '',
    username: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [alreadySetUp, setAlreadySetUp] = useState(false);

  useEffect(() => {
    if (status === 'authed') navigate('/', { replace: true });
  }, [status, navigate]);

  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'authed') return null;

  function update(field: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    if (form.password !== form.confirmPassword) {
      setError('تکرار رمز عبور با رمز عبور یکسان نیست.');
      return;
    }
    if (form.password.length < 10) {
      setError('رمز عبور باید حداقل ۱۰ نویسه باشد.');
      return;
    }
    if (!/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      setError('رمز عبور باید حداقل یک حرف انگلیسی و یک رقم داشته باشد.');
      return;
    }

    setLoading(true);
    try {
      await api.post(
        '/api/auth/setup',
        {
          workshopName: form.workshopName.trim(),
          fullName: form.fullName.trim(),
          username: form.username.trim(),
          password: form.password,
        },
        { auth: false },
      );
      toast.success('راه‌اندازی اولیه با موفقیت انجام شد. خوش آمدید.');
      await login(form.username.trim(), form.password);
      navigate('/', { replace: true });
    } catch (setupError) {
      if (setupError instanceof ApiError && setupError.code === 'SETUP_COMPLETED') {
        setAlreadySetUp(true);
      } else {
        setError(errorMessage(setupError));
      }
    } finally {
      setLoading(false);
    }
  }

  if (alreadySetUp) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-ink-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="size-6" />
          </div>
          <h1 className="mt-4 text-lg font-bold text-ink-900">راه‌اندازی قبلاً انجام شده است</h1>
          <p className="mt-2 text-sm leading-7 text-ink-500">
            مدیر سامانه از قبل تعریف شده است. لطفاً با نام کاربری و رمز عبور خود وارد شوید.
          </p>
          <Button className="mt-6 w-full" onClick={() => window.location.assign('/login')}>
            رفتن به صفحه ورود
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-ink-900 via-ink-900 to-brand-900 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-3 text-white">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-white/10 backdrop-blur">
            <Wrench className="size-6" />
          </div>
          <div>
            <p className="font-bold">{workshopName || 'مدیریت تعمیرگاه'}</p>
            <p className="text-xs text-white/50">اولین راه‌اندازی سامانه</p>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-2xl shadow-ink-900/30 sm:p-8 animate-fade-up">
          <div className="flex items-start gap-3 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-600" />
            <div>
              <p className="text-sm font-medium text-brand-900">ایجاد حساب مدیر کل</p>
              <p className="mt-1 text-xs leading-6 text-brand-800/80">
                این صفحه فقط یک بار و در اولین اجرای سامانه نمایش داده می‌شود. با این حساب می‌توانید
                کاربران، نقش‌ها و تنظیمات کارگاه را مدیریت کنید.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="workshopName">نام کارگاه</Label>
                <Input
                  id="workshopName"
                  value={form.workshopName}
                  onChange={(event) => update('workshopName', event.target.value)}
                  className="mt-1.5"
                  placeholder="مثلاً تعمیرگاه موبایل پارس"
                  required
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="fullName">نام و نام خانوادگی مدیر</Label>
                <Input
                  id="fullName"
                  value={form.fullName}
                  onChange={(event) => update('fullName', event.target.value)}
                  className="mt-1.5"
                  placeholder="مثلاً علی رضایی"
                  required
                />
              </div>
              <div>
                <Label htmlFor="setup-username">نام کاربری</Label>
                <Input
                  id="setup-username"
                  value={form.username}
                  onChange={(event) => update('username', event.target.value)}
                  className="mt-1.5"
                  dir="ltr"
                  placeholder="admin"
                  autoComplete="username"
                  required
                />
              </div>
              <div>
                <Label htmlFor="setup-password">رمز عبور</Label>
                <PasswordInput
                  id="setup-password"
                  value={form.password}
                  onChange={(event) => update('password', event.target.value)}
                  className="mt-1.5"
                  autoComplete="new-password"
                  placeholder="••••••••••"
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="setup-confirm">تکرار رمز عبور</Label>
                <PasswordInput
                  id="setup-confirm"
                  value={form.confirmPassword}
                  onChange={(event) => update('confirmPassword', event.target.value)}
                  className="mt-1.5"
                  autoComplete="new-password"
                  placeholder="••••••••••"
                  required
                />
                <FieldHint>
                  رمز عبور باید حداقل ۱۰ نویسه و شامل حرف انگلیسی و رقم باشد. این رمز را در جای امن
                  نگهداری کنید.
                </FieldHint>
              </div>
            </div>

            {error ? (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-6 text-rose-700"
              >
                {error}
              </div>
            ) : null}

            <Button type="submit" className="w-full" loading={loading}>
              تکمیل راه‌اندازی و ورود
              <ArrowLeft className="size-4" />
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-[11px] leading-6 text-white/40">
          اطلاعات این فرم فقط روی سرور داخلی کارگاه ذخیره می‌شود.
        </p>
      </div>
    </div>
  );
}
