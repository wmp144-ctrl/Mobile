import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AnalyticsDashboard, AnalyticsOptions, ReportChartResult } from '@/lib/types';
import { DashboardPage } from './dashboard-page';

vi.mock('@/components/charts/echart', () => ({
  EChart: ({ ariaLabel }: { ariaLabel?: string }) => (
    <div data-testid="echart" aria-label={ariaLabel} />
  ),
}));

function chart(
  id: string,
  title: string,
  chartType: ReportChartResult['chartType'],
  categories: string[],
  data: number[],
  total = data.reduce((sum, value) => sum + value, 0),
): ReportChartResult {
  return {
    id,
    title,
    chartType,
    dimension: 'equipmentType',
    metric: 'count',
    categories,
    series: [{ name: 'تعداد تجهیزات', data }],
    total,
  };
}

const options: AnalyticsOptions = {
  equipmentTypes: [
    { value: 'mobile', label: 'موبایل', count: 5 },
    { value: 'laptop', label: 'لپ‌تاپ', count: 2 },
  ],
  manufacturers: [
    { value: 'samsung', label: 'سامسونگ', count: 3 },
    { value: 'hp', label: 'اچ‌پی', count: 1 },
  ],
  models: ['Galaxy A54'],
  jobs: ['دانشجو'],
  technicians: [{ value: '__unknown__', label: 'بدون تکنسین' }],
  operationTypes: [{ value: 'backup', label: 'بکاپ گرفتن', count: 1 }],
  statuses: [
    { value: 'in_progress', label: 'در حال انجام', tone: 'brand' },
    { value: 'delivered', label: 'تحویل داده شده', tone: 'success' },
  ],
  years: [{ value: 1405, label: '۱۴۰۵' }],
  currentYear: 1405,
  currentMonth: 7,
  workshop: { name: 'تعمیرگاه نمونه', phone: '021-12345678', address: 'تهران', logo: '' },
};

const dashboard: AnalyticsDashboard = {
  stats: {
    totalEquipment: 9,
    receivedToday: 2,
    inProgress: 3,
    done: 1,
    failed: 1,
    ready: 1,
    delivered: 2,
    customers: 4,
  },
  charts: {
    equipmentTypes: chart('equipmentTypes', 'توزیع نوع تجهیزات', 'doughnut', ['موبایل', 'لپ‌تاپ'], [5, 2]),
    manufacturers: chart('manufacturers', 'توزیع سازندگان', 'bar', ['سامسونگ', 'اچ‌پی'], [3, 1]),
    monthlyTrend: {
      ...chart('monthlyTrend', 'روند ماهانه پذیرش و تحویل', 'line', ['مهر ۱۴۰۵'], [4]),
      series: [
        { name: 'پذیرش‌شده', data: [4] },
        { name: 'تحویل‌داده‌شده', data: [1] },
      ],
    },
    yearly: chart('yearly', 'مقایسه سالانه تجهیزات', 'bar', ['۱۴۰۴', '۱۴۰۵'], [1, 8]),
    jobs: chart('jobs', 'نوع شغل آورنده', 'bar', ['دانشجو', 'کارمند'], [4, 3]),
    statuses: chart('statuses', 'وضعیت تجهیزات', 'doughnut', ['در حال انجام', 'تحویل داده شده'], [3, 2]),
  },
  recentDevices: {
    columns: [
      { key: 'intakeCode', label: 'کد پذیرش', type: 'text' },
      { key: 'ownerName', label: 'مالک', type: 'text' },
      { key: 'equipmentType', label: 'نوع تجهیز', type: 'text' },
      { key: 'status', label: 'وضعیت', type: 'status' },
      { key: 'receivedAt', label: 'تاریخ پذیرش', type: 'date' },
    ],
    rows: [
      {
        intakeCode: 'MR-1405-0001',
        ownerName: 'سارا احمدی',
        equipmentType: 'موبایل',
        status: 'در حال انجام',
        receivedAt: '2026-10-22T08:00:00.000Z',
      },
    ],
    total: 1,
  },
  generatedAt: '2026-10-23T10:00:00.000Z',
  workshop: options.workshop,
  currentUser: { fullName: 'مدیر سامانه', roleNameFa: 'مدیر کل' },
};

describe('داشبورد تحلیلی', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('کارت‌های آماری، نمودارها و فیلترها را از API نمایش می‌دهد', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        const payload = url.includes('/api/analytics/options') ? options : dashboard;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(payload),
        });
      }),
    );

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('داشبورد مدیریت')).toBeInTheDocument();
    expect(await screen.findByText('کل تجهیزات دریافتی')).toBeInTheDocument();
    expect(screen.getByText('دریافتی امروز')).toBeInTheDocument();
    expect(screen.getAllByText('نوع شغل آورنده').length).toBeGreaterThan(0);
    expect(screen.getByText('توزیع نوع تجهیزات')).toBeInTheDocument();
    expect(screen.getByText('روند ماهانه')).toBeInTheDocument();
    expect(screen.getByText('فیلترهای داشبورد')).toBeInTheDocument();
    expect(screen.getByText('تعمیرگاه نمونه')).toBeInTheDocument();
    expect(screen.getByText('MR-1405-0001')).toBeInTheDocument();
    expect(screen.getAllByTestId('echart')).toHaveLength(6);
  });
});
