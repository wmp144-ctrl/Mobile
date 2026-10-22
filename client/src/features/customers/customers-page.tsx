import { useEffect, useState } from 'react';
import { Pencil, Search, Trash2, UserPlus, UsersRound } from 'lucide-react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useApiQuery } from '@/lib/use-api';
import { usePermissions } from '@/lib/use-permissions';
import { formatJalaliDate } from '@/lib/jalali';
import type { Customer, Page } from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CustomerDialog } from './customer-dialog';

export function CustomersPage() {
  const { can } = usePermissions();
  const canManage = can('customers.manage');
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (searchTerm) params.set('search', searchTerm);
  const customersQuery = useApiQuery<Page<Customer>>(
    () => api.get<Page<Customer>>(`/api/customers?${params.toString()}`),
    [page, searchTerm],
  );

  const customers = customersQuery.data?.items ?? [];

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/api/customers/${pendingDelete.id}`);
      toast.success('مشتری حذف شد.');
      setPendingDelete(null);
      await customersQuery.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="مدیریت مشتریان"
        description="مشتریان کارگاه و تعداد دستگاه‌های ثبت‌شده برای هرکدام را مدیریت کنید."
        actions={
          canManage ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <UserPlus className="size-4" />
              مشتری جدید
            </Button>
          ) : null
        }
      />

      <Card>
        <div className="border-b border-ink-100 p-4">
          <div className="relative max-w-md">
            <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="جستجوی نام، تلفن، شغل یا کد ملی..."
              className="ps-9"
              aria-label="جستجوی مشتریان"
            />
          </div>
        </div>

        {customersQuery.loading && !customersQuery.data ? <Spinner label="در حال دریافت مشتریان..." /> : null}

        {customersQuery.error ? (
          <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {customersQuery.error}
          </div>
        ) : null}

        {customersQuery.data && customers.length === 0 ? (
          <EmptyState
            icon={<UsersRound className="size-6" />}
            title="مشتری‌ای یافت نشد"
            description={
              searchTerm
                ? 'با این عبارت مشتری‌ای پیدا نشد.'
                : 'هنوز مشتری‌ای ثبت نشده است. با پذیرش دستگاه، مشتری هم ثبت می‌شود.'
            }
          />
        ) : null}

        {customers.length > 0 ? (
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead>نام مشتری</TableHead>
                <TableHead>تلفن</TableHead>
                <TableHead>شغل</TableHead>
                <TableHead>تعداد دستگاه</TableHead>
                <TableHead>تاریخ ثبت</TableHead>
                {canManage ? <TableHead className="text-end">عملیات</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell>
                    <p className="font-medium text-ink-800">{customer.fullName}</p>
                    {customer.nationalId ? (
                      <p className="text-[11px] text-ink-400" dir="ltr">
                        {customer.nationalId}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs text-ink-600" dir="ltr">
                    {customer.phone || '—'}
                    {customer.phoneSecondary ? (
                      <span className="block text-[11px] text-ink-400">{customer.phoneSecondary}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs text-ink-600">{customer.jobTitle || '—'}</TableCell>
                  <TableCell className="text-xs text-ink-600">
                    {customer.deviceCount.toLocaleString('fa-IR')} دستگاه
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-ink-500">
                    {formatJalaliDate(customer.createdAt)}
                  </TableCell>
                  {canManage ? (
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="ویرایش مشتری"
                          aria-label={`ویرایش ${customer.fullName}`}
                          onClick={() => {
                            setEditing(customer);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="حذف مشتری"
                          aria-label={`حذف ${customer.fullName}`}
                          className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          onClick={() => setPendingDelete(customer)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}

        {customersQuery.data ? (
          <Pagination
            page={customersQuery.data.page}
            pageSize={customersQuery.data.pageSize}
            total={customersQuery.data.total}
            totalPages={customersQuery.data.totalPages}
            onPageChange={setPage}
          />
        ) : null}
      </Card>

      <CustomerDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        customer={editing}
        onSaved={customersQuery.reload}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="حذف مشتری"
        description={
          pendingDelete
            ? `مشتری «${pendingDelete.fullName}» حذف می‌شود. اگر برای این مشتری پرونده دستگاهی ثبت شده باشد، حذف انجام نمی‌شود.`
            : ''
        }
        confirmLabel="حذف مشتری"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
