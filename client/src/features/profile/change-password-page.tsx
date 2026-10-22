import { ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/stores/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChangePasswordForm } from './change-password-form';

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const user = useAuth((state) => state.user);

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="flex size-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <ShieldAlert className="size-5" />
            </span>
            <div>
              <CardTitle>تغییر اجباری رمز عبور</CardTitle>
              <p className="mt-0.5 text-xs text-ink-400">
                {user?.fullName} — مدیر سامانه برای شما رمز موقت تعیین کرده است.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-800">
            تا زمانی که رمز عبور خود را تغییر ندهید، امکان استفاده از سایر بخش‌های سامانه وجود ندارد.
            رمز جدید را فقط خودتان بدانید.
          </p>
          <ChangePasswordForm onSuccess={() => navigate('/', { replace: true })} />
        </CardContent>
      </Card>
    </div>
  );
}
