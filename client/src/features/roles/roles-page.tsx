import { useState } from 'react';
import { Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useApiQuery } from '@/lib/use-api';
import { usePermissions } from '@/lib/use-permissions';
import { formatNumber } from '@/lib/format';
import type { PermissionDefinition, Role } from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { RoleFormDialog } from './role-form-dialog';

export function RolesPage() {
  const { can } = usePermissions();
  const canManage = can('roles.manage');
  const toast = useToast();

  const rolesQuery = useApiQuery<Role[]>(() => api.get<Role[]>('/api/roles'), []);
  const permissionsQuery = useApiQuery<PermissionDefinition[]>(
    () => api.get<PermissionDefinition[]>('/api/roles/permissions'),
    [],
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState(false);

  const permissionLabels = new Map(
    (permissionsQuery.data ?? []).map((permission) => [permission.key, permission.label]),
  );

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/roles/${deleteTarget.id}`);
      toast.success('نقش حذف شد.');
      setDeleteTarget(null);
      await rolesQuery.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="نقش‌ها و دسترسی‌ها"
        description="نقش‌های سیستمی ثابت هستند؛ برای نیازهای خاص، نقش سفارشی با مجوزهای مشخص بسازید."
        actions={
          canManage ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" />
              نقش جدید
            </Button>
          ) : null
        }
      />

      {rolesQuery.loading && !rolesQuery.data ? <Spinner label="در حال دریافت نقش‌ها..." /> : null}

      {rolesQuery.error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {rolesQuery.error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(rolesQuery.data ?? []).map((role) => {
          const fullAccess = role.permissions.includes('*');
          const shownPermissions = fullAccess ? [] : role.permissions.slice(0, 6);
          const hiddenCount = fullAccess ? 0 : Math.max(role.permissions.length - shownPermissions.length, 0);
          return (
            <Card key={role.id} className="flex flex-col transition hover:shadow-md">
              <CardHeader className="p-5 pb-0">
                <div className="flex w-full items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>{role.nameFa}</CardTitle>
                      {role.isSystem ? <Badge variant="brand">سیستمی</Badge> : <Badge>سفارشی</Badge>}
                    </div>
                    <p className="mt-1 text-[11px] text-ink-400" dir="ltr">
                      {role.key}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-ink-500">
                    <Users className="size-3.5" />
                    {formatNumber(role.userCount)} کاربر
                  </span>
                </div>
              </CardHeader>

              <CardContent className="flex-1 space-y-3 pt-4">
                <p className="min-h-10 text-xs leading-6 text-ink-500">
                  {role.description || 'بدون توضیح'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {fullAccess ? (
                    <Badge variant="brand">
                      <ShieldCheck className="size-3" />
                      دسترسی کامل به همه بخش‌ها
                    </Badge>
                  ) : (
                    <>
                      {shownPermissions.map((permission) => (
                        <Badge key={permission}>{permissionLabels.get(permission) ?? permission}</Badge>
                      ))}
                      {hiddenCount > 0 ? <Badge>+{formatNumber(hiddenCount)} مجوز دیگر</Badge> : null}
                    </>
                  )}
                </div>
              </CardContent>

              {canManage && !role.isSystem ? (
                <CardFooter className="justify-end border-t border-ink-100 pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(role);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil className="size-3.5" />
                    ویرایش
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    onClick={() => setDeleteTarget(role)}
                  >
                    <Trash2 className="size-3.5" />
                    حذف
                  </Button>
                </CardFooter>
              ) : null}
            </Card>
          );
        })}
      </div>

      <RoleFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        role={editing}
        permissions={permissionsQuery.data ?? []}
        onSaved={rolesQuery.reload}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="حذف نقش"
        description={`نقش «${deleteTarget?.nameFa ?? ''}» حذف می‌شود. اگر کاربری به این نقش اختصاص یافته باشد، حذف انجام نمی‌شود.`}
        confirmLabel="حذف نقش"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
