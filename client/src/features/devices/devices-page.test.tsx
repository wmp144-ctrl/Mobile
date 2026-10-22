import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/ui/toast';
import { useAuth } from '@/stores/auth';
import type { DeviceSummary, Page } from '@/lib/types';
import { DevicesPage } from './devices-page';

const device: DeviceSummary = {
  id: 'device-1',
  intakeCode: 'MR-1405-0007',
  status: { key: 'in_progress', label: 'در حال انجام', tone: 'brand' },
  equipmentType: { key: 'mobile', label: 'موبایل' },
  manufacturer: { key: 'samsung', label: 'سامسونگ' },
  model: 'Galaxy A54',
  serialNumber: 'SN-2026-0001',
  imei1: '356789012345678',
  imei2: null,
  owner: { id: 'customer-1', fullName: 'سارا احمدی', phone: '09351234567', jobTitle: 'کارمند' },
  broughtBy: { name: 'علی رضایی', phone: '09121112233', job: 'دانشجو' },
  technician: { id: 'user-1', fullName: 'رضا تکنسین' },
  receivedAt: '2026-10-22T08:00:00.000Z',
  dueAt: '2026-10-25T08:00:00.000Z',
  deliveredAt: null,
  statusChangedAt: '2026-10-22T09:00:00.000Z',
  reportedProblem: 'صفحه نمایش شکسته',
  hasPassword: true,
  operationCount: 2,
  version: 3,
  createdAt: '2026-10-22T08:00:00.000Z',
  updatedAt: '2026-10-22T09:00:00.000Z',
  createdByName: 'مدیر سامانه',
};

function jsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(data),
  };
}

function stubApi(page: Page<DeviceSummary>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/device-config')) {
        return jsonResponse({
          fields: [],
          options: { equipment_type: [], manufacturer: [], accessory: [], operation_type: [], lock_status: [] },
          technicians: [],
        });
      }
      if (url.startsWith('/api/devices')) return jsonResponse(page);
      return jsonResponse({});
    }),
  );
}

describe('فهرست تجهیزات', () => {
  beforeEach(() => {
    useAuth.setState({
      status: 'authed',
      user: {
        id: 'user-1',
        username: 'admin',
        fullName: 'مدیر سامانه',
        phone: null,
        role: { id: 'role-1', key: 'admin', nameFa: 'مدیر کل' },
        permissions: ['*'],
        isActive: true,
        mustChangePassword: false,
        lastLoginAt: null,
        passwordChangedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        version: 1,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('پرونده‌های دریافتی از سرور را در جدول نمایش می‌دهد', async () => {
    stubApi({ items: [device], total: 1, page: 1, pageSize: 20, totalPages: 1 });

    render(
      <MemoryRouter>
        <ToastProvider>
          <DevicesPage />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('MR-1405-0007')).toBeInTheDocument();
    expect(screen.getByText('سارا احمدی')).toBeInTheDocument();
    expect(screen.getAllByText('در حال انجام').length).toBeGreaterThan(0);
    expect(screen.getByText('Galaxy A54')).toBeInTheDocument();
    expect(screen.getByText(/نمایش ۱ تا ۱ از ۱ مورد/)).toBeInTheDocument();
  });

  it('در نبود پرونده پیام راهنما نمایش می‌دهد', async () => {
    stubApi({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });

    render(
      <MemoryRouter>
        <ToastProvider>
          <DevicesPage />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('تجهیزی یافت نشد')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /پذیرش جدید/ }).length).toBeGreaterThan(0);
  });

  it('چاپ فهرست را با فیلترهای جاری باز می‌کند', async () => {
    stubApi({ items: [device], total: 1, page: 1, pageSize: 20, totalPages: 1 });
    const open = vi.fn();
    vi.stubGlobal('open', open);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ToastProvider>
          <DevicesPage />
        </ToastProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: /چاپ فهرست/ }));
    expect(open).toHaveBeenCalledWith(
      expect.stringContaining('/devices/print?'),
      '_blank',
      'noopener',
    );
  });
});
