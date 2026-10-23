import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-50 px-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-surface text-brand-600 shadow-sm">
        <Compass className="size-7" />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-ink-900">صفحه پیدا نشد</h1>
        <p className="mt-2 text-sm text-ink-500">آدرسی که وارد کرده‌اید در سامانه وجود ندارد.</p>
      </div>
      <Link to="/" className={buttonVariants({ variant: 'primary' })}>
        بازگشت به داشبورد
      </Link>
    </div>
  );
}
