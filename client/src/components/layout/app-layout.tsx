import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/stores/auth';
import { useIdleLock } from '@/hooks/use-idle-lock';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { LockScreen } from './lock-screen';

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const status = useAuth((state) => state.status);
  const idleTimeoutMinutes = useAuth((state) => state.idleTimeoutMinutes);
  const lock = useAuth((state) => state.lock);
  const location = useLocation();

  useIdleLock(idleTimeoutMinutes, status === 'authed', lock);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-ink-50">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="lg:ms-[272px]">
        <Topbar onOpenMenu={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-5 sm:px-6 lg:px-8">
          <Outlet />
        </main>
        <footer className="border-t border-ink-200/60 px-6 py-4 text-center text-[11px] text-ink-400">
          سامانه مدیریت تعمیرگاه تخصصی موبایل و تجهیزات الکترونیکی — نسخه{' '}
          {useAuth.getState().appVersion || '۱.۰.۰'} — آماده استفاده در شبکه داخلی بدون اینترنت
        </footer>
      </div>
      {status === 'locked' ? <LockScreen /> : null}
    </div>
  );
}
