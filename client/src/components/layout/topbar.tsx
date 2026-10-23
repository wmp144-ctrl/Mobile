import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, LockKeyhole, LogOut, Menu, UserCircle2 } from 'lucide-react';
import { useAuth } from '@/stores/auth';
import { initials } from '@/lib/format';
import { NAV_ITEMS } from './navigation';
import { cn } from '@/lib/utils';

interface TopbarProps {
  onOpenMenu: () => void;
}

export function Topbar({ onOpenMenu }: TopbarProps) {
  const user = useAuth((state) => state.user);
  const lock = useAuth((state) => state.lock);
  const logout = useAuth((state) => state.logout);
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const current =
    NAV_ITEMS.find((item) =>
      item.end ? location.pathname === item.path : location.pathname.startsWith(item.path),
    )?.label ?? 'حساب کاربری';

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleLogout() {
    setMenuOpen(false);
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="sticky top-0 z-20 border-b border-ink-200/70 bg-surface/80 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenMenu}
            className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 lg:hidden"
            aria-label="باز کردن منو"
          >
            <Menu className="size-5" />
          </button>
          <div>
            <p className="text-[11px] text-ink-400">سامانه مدیریت تعمیرگاه</p>
            <p className="text-sm font-semibold text-ink-800">{current}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={lock}
            className="hidden items-center gap-2 rounded-xl px-3 py-2 text-xs text-ink-500 transition hover:bg-ink-100 hover:text-ink-800 sm:flex"
            title="قفل صفحه"
          >
            <LockKeyhole className="size-4" />
            قفل صفحه
          </button>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex items-center gap-2 rounded-xl border border-ink-200 bg-surface py-1.5 pe-2 ps-1.5 text-start transition hover:bg-ink-50"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
                {initials(user?.fullName ?? '')}
              </span>
              <span className="hidden sm:block">
                <span className="block max-w-[140px] truncate text-xs font-medium text-ink-800">
                  {user?.fullName}
                </span>
                <span className="block text-[10px] text-ink-400">{user?.role.nameFa}</span>
              </span>
              <ChevronDown className="size-3.5 text-ink-400" />
            </button>

            {menuOpen ? (
              <div
                role="menu"
                className="absolute end-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-xl border border-ink-200 bg-surface p-1.5 shadow-xl shadow-ink-900/10 animate-fade-up"
              >
                <div className="border-b border-ink-100 px-3 py-2">
                  <p className="text-sm font-medium text-ink-800">{user?.fullName}</p>
                  <p className="mt-0.5 text-xs text-ink-400" dir="ltr">
                    {user?.username}
                  </p>
                </div>
                <Link
                  to="/profile"
                  onClick={() => setMenuOpen(false)}
                  className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-600 hover:bg-ink-50"
                  role="menuitem"
                >
                  <UserCircle2 className="size-4" />
                  حساب کاربری
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    lock();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-600 hover:bg-ink-50"
                  role="menuitem"
                >
                  <LockKeyhole className="size-4" />
                  قفل صفحه
                </button>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50',
                  )}
                  role="menuitem"
                >
                  <LogOut className="size-4" />
                  خروج از حساب
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
