import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Customer, CustomerDeviceEntry } from '@/lib/types';
import { CustomerDevicesDialog } from './customer-devices-dialog';

const customer: Customer = {
  id: 'customer-1',
  fullName: 'رضا مرادی',
  phone: '09121230000',
  phoneSecondary: null,
  jobTitle: 'آزاد',
  nationalId: null,
  address: null,
  notes: null,
  version: 1,
  deviceCount: 2,
  createdByName: 'مدیر',
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-01T08:00:00.000Z',
};

const devices: CustomerDeviceEntry[] = [
  {
    id: 'device-1',
    intakeCode: 'MR-1405-0007',
    status: { key: 'c_abc123', label: 'در انتظار قطعه خاص' },
    equipmentType: 'لپ‌تاپ',
    model: 'IdeaPad 3',
    reportedProblem: 'روشن نمی‌شود',
    receivedAt: '2026-10-20T08:00:00.000Z',
    deliveredAt: null,
  },
  {
    id: 'device-2',
    intakeCode: 'MR-1405-0008',
    status: { key: 'delivered', label: 'تحویل داده شده' },
    equipmentType: 'موبایل',
    model: 'Galaxy A54',
    reportedProblem: 'صفحه شکسته',
    receivedAt: '2026-10-10T08:00:00.000Z',
    deliveredAt: '2026-10-12T08:00:00.000Z',
  },
];

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, text: async () => JSON.stringify(data) };
}

describe('سوابق دستگاه‌های مشتری', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('همه دستگاه‌های مشتری را با وضعیت و لینک پرونده نمایش می‌دهد', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain('/api/customers/customer-1/devices');
      return jsonResponse(devices);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <CustomerDevicesDialog open onOpenChange={() => undefined} customer={customer} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('MR-1405-0007')).toBeInTheDocument();
    expect(screen.getByText('MR-1405-0008')).toBeInTheDocument();
    expect(screen.getByText('در انتظار قطعه خاص')).toBeInTheDocument();
    expect(screen.getByText('IdeaPad 3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /MR-1405-0007/ })).toHaveAttribute(
      'href',
      '/devices/device-1',
    );
  });

  it('در نبود دستگاه پیام راهنما نشان می‌دهد', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([])));

    render(
      <MemoryRouter>
        <CustomerDevicesDialog open onOpenChange={() => undefined} customer={customer} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('دستگاهی ثبت نشده است')).toBeInTheDocument();
  });
});
