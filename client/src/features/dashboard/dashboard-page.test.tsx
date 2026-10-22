import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { DashboardOverview } from '@/lib/types';
import { DashboardPage } from './dashboard-page';

const overview: DashboardOverview = {
  stats: {
    usersTotal: 5,
    usersActive: 4,
    sessionsActive: 2,
    rolesTotal: 5,
    auditToday: 12,
    databaseSize: 8_124_000,
    devicesTotal: 7,
    devicesActive: 5,
    devicesReady: 2,
    devicesDeliveredToday: 1,
    devicesOverdue: 1,
    devicesCreatedToday: 3,
    customersTotal: 4,
  },
  statusBreakdown: [
    { key: 'received', label: 'دریافت شده', tone: 'neutral', count: 2 },
    { key: 'in_progress', label: 'در حال انجام', tone: 'brand', count: 3 },
    { key: 'ready_delivery', label: 'آماده تحویل', tone: 'success', count: 2 },
  ],
  roleDistribution: [{ roleName: 'مدیر کل', roleKey: 'admin', userCount: 1 }],
  recentActivity: [
    {
      id: '1',
      userId: null,
      username: 'admin',
      action: 'auth.login',
      actionLabel: 'ورود موفق',
      entityType: 'user',
      entityId: null,
      description: 'کاربر مدیر وارد سامانه شد.',
      metadata: null,
      ip: '127.0.0.1',
      userAgent: null,
      createdAt: '2026-10-22T10:00:00.000Z',
    },
  ],
  recentDevices: [
    {
      id: 'device-1',
      intakeCode: 'MR-1405-0001',
      status: { key: 'in_progress', label: 'در حال انجام', tone: 'brand' },
      equipmentType: { key: 'mobile', label: 'موبایل' },
      manufacturer: { key: 'samsung', label: 'سامسونگ' },
      model: 'Galaxy A54',
      serialNumber: 'SN-1',
      imei1: '356789012345678',
      imei2: null,
      owner: { id: 'customer-1', fullName: 'سارا احمدی', phone: '09351234567', jobTitle: 'کارمند' },
      broughtBy: { name: 'علی رضایی', phone: '09121112233', job: 'دانشجو' },
      technician: null,
      receivedAt: '2026-10-22T08:00:00.000Z',
      dueAt: null,
      deliveredAt: null,
      statusChangedAt: '2026-10-22T09:00:00.000Z',
      reportedProblem: 'صفحه نمایش شکسته',
      hasPassword: false,
      operationCount: 1,
      version: 2,
      createdAt: '2026-10-22T08:00:00.000Z',
      updatedAt: '2026-10-22T09:00:00.000Z',
      createdByName: 'مدیر سامانه',
    },
  ],
  server: {
    version: '1.0.0',
    time: '2026-10-22T10:00:00.000Z',
    uptimeSeconds: 3600,
    workshopName: 'تعمیرگاه نمونه',
  },
  currentUser: { fullName: 'مدیر سامانه', roleNameFa: 'مدیر کل' },
};

describe('داشبورد', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('آمار تعمیرات، وضعیت‌ها و آخرین پذیرش‌ها را نمایش می‌دهد', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(overview),
      }),
    );

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('داشبورد مدیریت')).toBeInTheDocument();
    expect(await screen.findByText('ورود موفق')).toBeInTheDocument();
    expect(screen.getByText('مدیر سامانه عزیز، خوش آمدید')).toBeInTheDocument();
    expect(screen.getByText('کاربران فعال')).toBeInTheDocument();
    expect(screen.getByText('تعمیرات در جریان')).toBeInTheDocument();
    expect(screen.getByText('MR-1405-0001')).toBeInTheDocument();
    expect(screen.getByText('وضعیت پرونده‌های تعمیر')).toBeInTheDocument();
    expect(screen.getByText('سارا احمدی')).toBeInTheDocument();
  });
});
