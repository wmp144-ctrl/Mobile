import { useEffect, useState } from 'react';
import { KeyRound, Pencil, Power, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useApiQuery } from '@/lib/use-api';
import { usePermissions } from '@/lib/use-permissions';
import { useAuth } from '@/stores/auth';
import { formatJalaliDateTime } from '@/lib/jalali';
import type { Page, PublicUser, Role } from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UserFormDialog } from './user-form-dialog';
import { ResetPasswordDialog } from './reset-password-dialog';

type RoleOption = Pick<Role, 'id' | 'key' | 'nameFa'>;

interface PendingAction {
  kind: 'delete' | 'toggle';
  user: PublicUser;
}

export function UsersPage() {
  const currentUser = useAuth((state) => state.user);
  const { can } = usePermissions();
  const canManage = can('users.manage');
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleId, setRoleId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<PublicUser | null>(null);
  const [resetUser, setResetUser] = useState<PublicUser | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, roleId, status]);

  const params = new URLSearchParams({ page: String(page), pageSize: '10' });
  if (searchTerm) params.set('search', searchTerm);
  if (roleId) params.set('roleId', roleId);
  if (status) params.set('isActive', status);

  const usersQuery = useApiQuery<Page<PublicUser>>(
    () => api.get<Page<PublicUser>>(`/api/users?${params.toString()}`),
    [page, searchTerm, roleId, status],
  );
  const rolesQuery = useApiQuery<RoleOption[]>(() => api.get<RoleOption[]>('/api/users/role-options'), []);

  const users = usersQuery.data?.items ?? [];

  async function handleAction() {
    if (!pendingAction) return;
    setActionLoading(true);
    try {
      if (pendingAction.kind === 'delete') {
        await api.delete(`/api/users/${pendingAction.user.id}`);
        toast.success('کاربر حذف شد. تاریخچه فعالیت‌های او حفظ شده است.');
      } else {
        await api.patch(`/api/users/${pendingAction.user.id}`, {
          isActive: !pendingAction.user.isActive,
          version: pendingAction.user.version,
        });
        toast.success(
          pendingAction.user.isActive ? 'حساب کاربری غیرفعال شد.' : 'حساب کاربری فعال شد.',
        );
      }
      setPendingAction(null);
      await usersQuery.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="مدیریت کاربران"
        description="کاربران سامانه، نقش و وضعیت دسترسی آن‌ها را مدیریت کنید."
        actions={
          canManage ? (
            <Button
              onClick={() => {
                setEditingUser(null);
                setFormOpen(true);
              }}
            >
              <UserPlus className="size-4" />
              کاربر جدید
            </Button>
          ) : null
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="جستجوی نام، نام کاربری یا شماره تماس..."
              className="ps-9"
              aria-label="جستجوی کاربران"
            />
          </div>
          <Select
            value={roleId}
            onChange={(event) => setRoleId(event.target.value)}
            className="w-44"
            aria-label="فیلتر نقش"
          >
            <option value="">همه نقش‌ها</option>
            {(rolesQuery.data ?? []).map((role) => (
              <option key={role.id} value={role.id}>
                {role.nameFa}
              </option>
            ))}
          </Select>
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="w-40"
            aria-label="فیلتر وضعیت"
          >
            <option value="">همه وضعیت‌ها</option>
            <option value="true">فعال</option>
            <option value="false">غیرفعال</option>
          </Select>
        </div>

        {usersQuery.loading && !usersQuery.data ? <Spinner label="در حال دریافت کاربران..." /> : null}

        {usersQuery.error ? (
          <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {usersQuery.error}
          </div>
        ) : null}

        {usersQuery.data && users.length === 0 ? (
          <EmptyState
            icon={<Users className="size-6" />}
            title="کاربری یافت نشد"
            description={
              searchTerm || roleId || status
                ? 'با فیلترهای انتخاب‌شده کاربری پیدا نشد. فیلترها را تغییر دهید.'
                : 'هنوز کاربری ثبت نشده است.'
            }
          />
        ) : null}

        {users.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>کاربر</TableHead>
                <TableHead>نقش</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead>آخرین ورود</TableHead>
                <TableHead>تلفن</TableHead>
                {canManage ? <TableHead className="text-end">عملیات</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const isSelf = user.id === currentUser?.id;
                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-xs font-bold text-brand-700">
                          {user.fullName.slice(0, 2)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink-800">
                            {user.fullName}
                            {isSelf ? (
                              <span className="ms-2 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-500">
                                شما
                              </span>
                            ) : null}
                          </p>
                          <p className="truncate text-xs text-ink-400" dir="ltr">
                            {user.username}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.role.key === 'admin' ? 'brand' : 'default'}>
                        {user.role.nameFa}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.isActive ? (
                        <Badge variant="success">فعال</Badge>
                      ) : (
                        <Badge variant="danger">غیرفعال</Badge>
                      )}
                      {user.mustChangePassword ? (
                        <Badge variant="warning" className="ms-1">
                          نیازمند تغییر رمز
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-ink-500">
                      {user.lastLoginAt ? formatJalaliDateTime(user.lastLoginAt) : 'بدون ورود'}
                    </TableCell>
                    <TableCell className="text-xs text-ink-500" dir="ltr">
                      {user.phone || '—'}
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="ویرایش کاربر"
                            aria-label={`ویرایش ${user.fullName}`}
                            onClick={() => {
                              setEditingUser(user);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="بازنشانی رمز عبور"
                            aria-label={`بازنشانی رمز ${user.fullName}`}
                            onClick={() => setResetUser(user)}
                            disabled={isSelf}
                          >
                            <KeyRound className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={user.isActive ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
                            aria-label={user.isActive ? 'غیرفعال‌سازی کاربر' : 'فعال‌سازی کاربر'}
                            onClick={() => setPendingAction({ kind: 'toggle', user })}
                            disabled={isSelf}
                          >
                            <Power className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="حذف کاربر"
                            aria-label={`حذف ${user.fullName}`}
                            className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            onClick={() => setPendingAction({ kind: 'delete', user })}
                            disabled={isSelf}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : null}

        {usersQuery.data ? (
          <Pagination
            page={usersQuery.data.page}
            pageSize={usersQuery.data.pageSize}
            total={usersQuery.data.total}
            totalPages={usersQuery.data.totalPages}
            onPageChange={setPage}
          />
        ) : null}
      </Card>

      <UserFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        roles={rolesQuery.data ?? []}
        user={editingUser}
        onSaved={usersQuery.reload}
      />

      <ResetPasswordDialog
        open={Boolean(resetUser)}
        onOpenChange={(open) => {
          if (!open) setResetUser(null);
        }}
        user={resetUser}
        onDone={usersQuery.reload}
      />

      <ConfirmDialog
        open={Boolean(pendingAction)}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
        title={pendingAction?.kind === 'delete' ? 'حذف کاربر' : 'تغییر وضعیت کاربر'}
        description={
          pendingAction?.kind === 'delete'
            ? `کاربر «${pendingAction?.user.fullName}» از فهرست کاربران حذف می‌شود. اطلاعات تاریخی او در تاریخچه سامانه باقی می‌ماند و این عملیات قابل بازگشت نیست.`
            : pendingAction
              ? `آیا از ${pendingAction.user.isActive ? 'غیرفعال‌سازی' : 'فعال‌سازی'} حساب «${pendingAction.user.fullName}» مطمئن هستید؟ نشست‌های فعال او بسته می‌شود.`
              : ''
        }
        confirmLabel={pendingAction?.kind === 'delete' ? 'حذف کاربر' : 'تأیید تغییر'}
        onConfirm={handleAction}
        loading={actionLoading}
      />
    </div>
  );
}
