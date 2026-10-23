export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',
  USERS_VIEW: 'users.view',
  USERS_MANAGE: 'users.manage',
  ROLES_VIEW: 'roles.view',
  ROLES_MANAGE: 'roles.manage',
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_MANAGE: 'settings.manage',
  AUDIT_VIEW: 'audit.view',
  BACKUPS_MANAGE: 'backups.manage',
  CUSTOMERS_VIEW: 'customers.view',
  CUSTOMERS_MANAGE: 'customers.manage',
  REPAIRS_VIEW: 'repairs.view',
  REPAIRS_MANAGE: 'repairs.manage',
  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_MANAGE: 'inventory.manage',
  INVOICES_VIEW: 'invoices.view',
  INVOICES_MANAGE: 'invoices.manage',
  REPORTS_VIEW: 'reports.view',
  FILES_VIEW: 'files.view',
  FILES_MANAGE: 'files.manage',
} as const;

export const ALL_PERMISSIONS: string[] = Object.values(PERMISSIONS);

export interface PermissionDefinition {
  key: string;
  label: string;
  group: string;
  /** مجوز مربوط به مراحل بعدی که هنوز رابط کاربری ندارد */
  future?: boolean;
}

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  { key: PERMISSIONS.DASHBOARD_VIEW, label: 'مشاهده داشبورد', group: 'عمومی' },
  { key: PERMISSIONS.USERS_VIEW, label: 'مشاهده کاربران', group: 'مدیریت کاربران' },
  { key: PERMISSIONS.USERS_MANAGE, label: 'مدیریت کاربران', group: 'مدیریت کاربران' },
  { key: PERMISSIONS.ROLES_VIEW, label: 'مشاهده نقش‌ها', group: 'مدیریت کاربران' },
  { key: PERMISSIONS.ROLES_MANAGE, label: 'مدیریت نقش‌ها و مجوزها', group: 'مدیریت کاربران' },
  { key: PERMISSIONS.SETTINGS_VIEW, label: 'مشاهده تنظیمات', group: 'تنظیمات' },
  { key: PERMISSIONS.SETTINGS_MANAGE, label: 'ویرایش تنظیمات', group: 'تنظیمات' },
  { key: PERMISSIONS.AUDIT_VIEW, label: 'مشاهده تاریخچه تغییرات', group: 'امنیت' },
  { key: PERMISSIONS.BACKUPS_MANAGE, label: 'پشتیبان‌گیری و دانلود نسخه پشتیبان', group: 'امنیت' },
  { key: PERMISSIONS.CUSTOMERS_VIEW, label: 'مشاهده مشتریان', group: 'مشتریان' },
  { key: PERMISSIONS.CUSTOMERS_MANAGE, label: 'مدیریت مشتریان', group: 'مشتریان' },
  { key: PERMISSIONS.REPAIRS_VIEW, label: 'مشاهده پرونده‌های تعمیر', group: 'تعمیرات' },
  { key: PERMISSIONS.REPAIRS_MANAGE, label: 'ثبت و ویرایش تعمیرات', group: 'تعمیرات' },
  { key: PERMISSIONS.INVENTORY_VIEW, label: 'مشاهده انبار', group: 'انبار', future: true },
  { key: PERMISSIONS.INVENTORY_MANAGE, label: 'مدیریت انبار', group: 'انبار', future: true },
  { key: PERMISSIONS.INVOICES_VIEW, label: 'مشاهده فاکتورها', group: 'مالی', future: true },
  { key: PERMISSIONS.INVOICES_MANAGE, label: 'صدور و ویرایش فاکتور', group: 'مالی', future: true },
  { key: PERMISSIONS.REPORTS_VIEW, label: 'مشاهده گزارش‌ها', group: 'گزارش‌ها', future: true },
  { key: PERMISSIONS.FILES_VIEW, label: 'مشاهده محل‌های ذخیره‌سازی و فایل‌ها', group: 'فایل‌ها' },
  { key: PERMISSIONS.FILES_MANAGE, label: 'مدیریت فایل‌ها، مسیرها و محل‌های ذخیره‌سازی', group: 'فایل‌ها' },
];

export function hasPermission(granted: string[] | undefined, required: string): boolean {
  if (!granted || granted.length === 0) return false;
  if (granted.includes('*')) return true;
  return granted.includes(required);
}

export function normalizePermissions(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const unique = new Set<string>();
  for (const item of input) {
    if (typeof item !== 'string') continue;
    if (item === '*') {
      return ['*'];
    }
    if (ALL_PERMISSIONS.includes(item)) unique.add(item);
  }
  return [...unique];
}
