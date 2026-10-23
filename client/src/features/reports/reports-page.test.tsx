import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/ui/toast';
import type {
  AnalyticsOptions,
  ReportRunResult,
  SavedReport,
} from '@/lib/types';
import { useAuth } from '@/stores/auth';
import { ReportsPage } from './reports-page';

vi.mock('@/components/charts/echart', () => ({
  EChart: ({ ariaLabel }: { ariaLabel?: string }) => (
    <div data-testid="echart" aria-label={ariaLabel} />
  ),
}));

const options: AnalyticsOptions = {
  equipmentTypes: [{ value: 'mobile', label: 'موبایل', count: 5 }],
  manufacturers: [{ value: 'samsung', label: 'سامسونگ', count: 3 }],
  models: ['Galaxy A54'],
  jobs: ['دانشجو'],
  technicians: [{ value: '__unknown__', label: 'بدون تکنسین' }],
  operationTypes: [{ value: 'backup', label: 'بکاپ گرفتن', count: 2 }],
  statuses: [{ value: 'in_progress', label: 'در حال انجام', tone: 'brand' }],
  years: [{ value: 1405, label: '۱۴۰۵' }],
  currentYear: 1405,
  currentMonth: 7,
  workshop: { name: 'تعمیرگاه نمونه', phone: '', address: '', logo: '' },
};

const runResult: ReportRunResult = {
  charts: [
    {
      id: 'chart-1',
      title: 'توزیع نوع تجهیزات',
      chartType: 'bar',
      dimension: 'equipmentType',
      metric: 'count',
      categories: ['موبایل', 'لپ‌تاپ'],
      series: [{ name: 'تعداد تجهیزات', data: [5, 2] }],
      total: 7,
    },
  ],
  table: {
    columns: [
      { key: 'intakeCode', label: 'کد پذیرش', type: 'text' },
      { key: 'ownerName', label: 'مالک', type: 'text' },
      { key: 'status', label: 'وضعیت', type: 'status' },
      { key: 'receivedAt', label: 'تاریخ پذیرش', type: 'date' },
    ],
    rows: [
      {
        intakeCode: 'MR-1405-0001',
        ownerName: 'سارا احمدی',
        status: 'در حال انجام',
        receivedAt: '2026-10-22T08:00:00.000Z',
      },
    ],
    total: 1,
  },
  generatedAt: '2026-10-23T10:00:00.000Z',
  filters: {},
  workshop: options.workshop,
};

const savedReport: SavedReport = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'گزارش برندها',
  description: 'گزارش نمونه ذخیره‌شده',
  config: {
    charts: [{ id: 'saved-chart', dimension: 'manufacturer', metric: 'count', chartType: 'bar' }],
    tableColumns: ['intakeCode'],
  },
  isShared: true,
  version: 1,
  ownerName: 'مدیر سامانه',
  createdAt: '2026-10-22T08:00:00.000Z',
  updatedAt: '2026-10-22T08:00:00.000Z',
  canManage: true,
};

function response(payload: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
  });
}

describe('گزارش‌گیری پیشرفته', () => {
  beforeEach(() => {
    useAuth.setState({
      status: 'authed',
      // کاربر مدیر کل برای نمایش دکمه‌های مدیریت قالب گزارش
      user: { permissions: ['*'] } as unknown as ReturnType<typeof useAuth.getState>['user'],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuth.setState({ status: 'anon', user: null });
  });

  function mockFetch() {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/reports/run')) return response(runResult);
      if (url.includes('/api/reports/saved')) return response([savedReport]);
      return response(options);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('فرم فیلترها، نمودارهای چندگانه و ستون‌های جدول را نمایش می‌دهد', async () => {
    mockFetch();
    render(
      <MemoryRouter>
        <ToastProvider>
          <ReportsPage />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('گزارش‌گیری پیشرفته')).toBeInTheDocument();
    expect(screen.getByText('نمودارهای گزارش')).toBeInTheDocument();
    expect(screen.getByText('ستون‌های جدول داده‌ها')).toBeInTheDocument();
    expect(screen.getByLabelText('از تاریخ شمسی')).toBeInTheDocument();
    expect(screen.getByText('افزودن نمودار')).toBeInTheDocument();
    expect(screen.getByText('ذخیره قالب گزارش')).toBeInTheDocument();
    expect(screen.getByText('هنوز گزارشی اجرا نشده است')).toBeInTheDocument();
    expect(screen.getAllByText('گروه‌بندی بر اساس').length).toBeGreaterThanOrEqual(2);
  });

  it('با اجرای گزارش، نمودار و جدول داده‌های انتخابی نمایش داده می‌شود', async () => {
    mockFetch();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ToastProvider>
          <ReportsPage />
        </ToastProvider>
      </MemoryRouter>,
    );

    const runButtons = await screen.findAllByRole('button', { name: /اجرای گزارش/ });
    await user.click(runButtons[0]);

    expect(await screen.findByText('نتیجه گزارش')).toBeInTheDocument();
    expect((await screen.findAllByText('MR-1405-0001')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('جدول داده‌های گزارش').length).toBeGreaterThan(0);
    expect(screen.getAllByText('توزیع نوع تجهیزات').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('echart').length).toBeGreaterThan(0);
  });

  it('قالب‌های ذخیره‌شده را فهرست و برای اجرای مجدد بارگذاری می‌کند', async () => {
    mockFetch();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ToastProvider>
          <ReportsPage />
        </ToastProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: /گزارش‌های ذخیره‌شده/ }));
    expect(await screen.findByText('گزارش برندها')).toBeInTheDocument();
    expect(screen.getByText('گزارش نمونه ذخیره‌شده')).toBeInTheDocument();
    expect(screen.getByText('اجرای مجدد')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'ویرایش' }));
    expect(await screen.findByDisplayValue('گزارش برندها')).toBeInTheDocument();
    expect(screen.queryByText('هنوز گزارشی اجرا نشده است')).toBeInTheDocument();
  });
});
