import {
  History,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  UserCircle2,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  permission?: string;
  end?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'داشبورد', icon: LayoutDashboard, permission: 'dashboard.view', end: true },
  { path: '/users', label: 'کاربران', icon: Users, permission: 'users.view' },
  { path: '/roles', label: 'نقش‌ها و دسترسی‌ها', icon: ShieldCheck, permission: 'roles.view' },
  { path: '/audit', label: 'تاریخچه تغییرات', icon: History, permission: 'audit.view' },
  { path: '/settings', label: 'تنظیمات', icon: Settings, permission: 'settings.view' },
  { path: '/profile', label: 'حساب کاربری', icon: UserCircle2 },
];
