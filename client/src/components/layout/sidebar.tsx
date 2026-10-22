import { NavLink } from 'react-router-dom';
import { ShieldCheck, WifiOff, Wrench, X } from 'lucide-react';
import { useAuth } from '@/stores/auth';
import { usePermissions } from '@/lib/use-permissions';
import { NAV_ITEMS } from './navigation';
import { cn } from '@/lib/utils';

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const workshopName = useAuth((state) => state.workshopName);
  const appVersion = useAuth((state) => state.appVersion);
  const { can } = usePermissions();
  const visibleItems = NAV_ITEMS.filter((item) => !item.permission || can(item.permission));

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-ink-900/40 backdrop-blur-sm lg:hidden"
          aria-label="بستن منو"
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-40 flex w-[272px] flex-col bg-ink-900 text-white transition-transform duration-200 lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-900/40">
            <Wrench className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{workshopName || 'مدیریت تعمیرگاه'}</p>
            <p className="mt-0.5 text-[11px] text-white/50">سامانه تخصصی تعمیرات</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="بستن منو"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="منوی اصلی">
          <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-wider text-white/35">
            بخش‌های سامانه
          </p>
          {visibleItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                  isActive
                    ? 'bg-white/10 font-medium text-white shadow-inner'
                    : 'text-white/65 hover:bg-white/5 hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={cn('size-4.5', isActive ? 'text-brand-300' : 'text-white/50')}
                  />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-3 border-t border-white/10 px-5 py-4">
          <div className="flex items-center gap-2 text-[11px] text-white/50">
            <WifiOff className="size-3.5" />
            <span>کاملاً آفلاین روی شبکه داخلی</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-white/35">
            <span>نسخه {appVersion || '۱.۰.۰'}</span>
            <ShieldCheck className="size-3.5" />
          </div>
        </div>
      </aside>
    </>
  );
}
