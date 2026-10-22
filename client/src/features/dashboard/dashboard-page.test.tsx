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
  },
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

  it('آمار و رویدادهای دریافتی از سرور را نمایش می‌دهد', async () => {
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
  });
});
