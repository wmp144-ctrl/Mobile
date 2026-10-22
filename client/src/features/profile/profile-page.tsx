import { useState } from 'react';
import { Monitor, ShieldCheck, UserCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useApiQuery } from '@/lib/use-api';
import { useAuth } from '@/stores/auth';
import { formatJalaliDateTime } from '@/lib/jalali';
import { describeUserAgent } from '@/lib/format';
import type { SessionInfo } from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { ChangePasswordForm } from './change-password-form';

export function ProfilePage() {
  const user = useAuth((state) => state.user);
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const sessionsQuery = useApiQuery<SessionInfo[]>(() => api.get<SessionInfo[]>('/api/auth/sessions'), []);

  async function revokeSession(session: SessionInfo) {
    setBusy(session.id);
    try {
      await api.delete(`/api/auth/sessions/${session.id}`);
      toast.success('نشست انتخاب‌شده بسته شد.');
      await sessionsQuery.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function revokeOthers() {
    setBusy('others');
    try {
      const result = await api.post<{ revoked: number }>('/api/auth/sessions/revoke-others');
      toast.success(
        result.revoked > 0
          ? `${result.revoked} نشست دیگر بسته شد.`
          : 'نشست دیگری برای بستن وجود ندارد.',
      );
      await sessionsQuery.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader title="حساب کاربری" description="اطلاعات حساب، امنیت و دستگاه‌های متصل شما." />

      {user ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <UserCircle2 className="size-4" />
                </span>
                <CardTitle>اطلاعات حساب</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-500">نام و نام خانوادگی</span>
                <span className="font-medium text-ink-800">{user.fullName}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-500">نام کاربری</span>
                <span className="font-medium text-ink-800" dir="ltr">
                  {user.username}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-500">نقش</span>
                <Badge variant="brand">{user.role.nameFa}</Badge>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-500">شماره تماس</span>
                <span className="text-ink-800" dir="ltr">
                  {user.phone || '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-500">آخرین ورود</span>
                <span className="text-xs text-ink-600">
                  {user.lastLoginAt ? formatJalaliDateTime(user.lastLoginAt) : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-500">تغییر رمز</span>
                <span className="text-xs text-ink-600">
                  {user.passwordChangedAt ? formatJalaliDateTime(user.passwordChangedAt) : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-500">وضعیت</span>
                {user.isActive ? <Badge variant="success">فعال</Badge> : <Badge variant="danger">غیرفعال</Badge>}
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <ShieldCheck className="size-4" />
                </span>
                <div>
                  <CardTitle>تغییر رمز عبور</CardTitle>
                  <p className="mt-0.5 text-xs text-ink-400">سایر نشست‌های شما پس از تغییر رمز بسته می‌شود.</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm />
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card className="mt-4">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                <Monitor className="size-4" />
              </span>
              <div>
                <CardTitle>دستگاه‌های متصل</CardTitle>
                <p className="mt-0.5 text-xs text-ink-400">
                  نشست‌های فعال حساب شما؛ در صورت مشاهده دستگاه ناشناس آن را ببندید.
                </p>
              </div>
            </div>
            {(sessionsQuery.data?.length ?? 0) > 1 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void revokeOthers()}
                loading={busy === 'others'}
              >
                بستن سایر نشست‌ها
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {sessionsQuery.loading && !sessionsQuery.data ? <Spinner label="در حال دریافت نشست‌ها..." /> : null}
          {sessionsQuery.error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {sessionsQuery.error}
            </div>
          ) : null}
          {sessionsQuery.data && sessionsQuery.data.length === 0 ? (
            <EmptyState title="نشست فعالی وجود ندارد" />
          ) : null}
          <div className="space-y-2">
            {(sessionsQuery.data ?? []).map((session) => (
              <div
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm text-ink-800">
                    {describeUserAgent(session.userAgent)}
                    {session.current ? <Badge variant="success">نشست فعلی</Badge> : null}
                  </p>
                  <p className="mt-1 text-[11px] text-ink-400" dir="ltr">
                    {session.ip || 'IP نامشخص'} — آخرین فعالیت: {formatJalaliDateTime(session.lastUsedAt)}
                  </p>
                </div>
                {!session.current ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void revokeSession(session)}
                    loading={busy === session.id}
                  >
                    بستن نشست
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
