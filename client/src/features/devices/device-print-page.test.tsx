import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/stores/auth';
import type { DeviceConfigData, DeviceDetail } from '@/lib/types';
import { DevicePrintPage } from './device-print-page';

const detail: DeviceDetail = {
  id: 'device-1',
  intakeCode: 'MR-1405-0007',
  status: { key: 'delivered', label: 'تحویل داده شده', tone: 'success' },
  equipmentType: { key: 'mobile', label: 'موبایل' },
  manufacturer: { key: 'samsung', label: 'سامسونگ' },
  model: 'Galaxy A54',
  serialNumber: 'SN-2026-0001',
  imei1: '356789012345678',
  imei2: null,
  owner: { id: 'customer-1', fullName: 'سارا احمدی', phone: '09351234567', jobTitle: 'کارمند' },
  broughtBy: { name: 'علی رضایی', phone: '09121112233', job: 'دانشجو' },
  technician: { id: 'user-2', fullName: 'رضا تکنسین' },
  receivedAt: '2026-10-10T08:00:00.000Z',
  dueAt: '2026-10-13T08:00:00.000Z',
  deliveredAt: '2026-10-12T12:30:00.000Z',
  statusChangedAt: '2026-10-12T12:30:00.000Z',
  reportedProblem: 'صفحه نمایش شکسته است.',
  hasPassword: false,
  operationCount: 0,
  version: 3,
  createdAt: '2026-10-10T08:00:00.000Z',
  updatedAt: '2026-10-12T12:30:00.000Z',
  createdByName: 'مدیر سامانه',
  physicalCondition: 'خط و خش روی قاب',
  accessories: ['charger', 'sim'],
  lockStatus: { key: 'pin', label: 'رمز عددی (PIN)' },
  notes: null,
  customFields: {},
  statusHistory: [],
  operations: [],
  files: [],
  storageSummary: null,
  technicianNotes: [],
  images: [],
};

const config: DeviceConfigData = {
  fields: [],
  options: {
    accessory: [
      {
        id: 'opt-1',
        key: 'charger',
        label: 'شارژر',
        sortOrder: 10,
        isActive: true,
        isSystem: true,
        usageCount: 1,
      },
      {
        id: 'opt-2',
        key: 'sim',
        label: 'سیم‌کارت',
        sortOrder: 20,
        isActive: true,
        isSystem: true,
        usageCount: 1,
      },
    ],
  },
  statuses: [],
  technicians: [],
};

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, text: async () => JSON.stringify(data) };
}

function renderPrint(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/devices/:id/print" element={<DevicePrintPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('رسید چاپی دستگاه', () => {
  beforeEach(() => {
    useAuth.setState({ workshopName: 'تعمیرگاه نمونه' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/device-config')) return jsonResponse(config);
        if (url.includes('/api/devices/device-1')) return jsonResponse(detail);
        return jsonResponse({});
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('رسید پذیرش را با مشخصات دستگاه، مالک و لوازم همراه نمایش می‌دهد', async () => {
    renderPrint('/devices/device-1/print');

    expect(await screen.findByText('MR-1405-0007')).toBeInTheDocument();
    expect(screen.getByText('رسید پذیرش دستگاه — نسخه مشتری')).toBeInTheDocument();
    expect(screen.getByText('سارا احمدی')).toBeInTheDocument();
    expect(screen.getByText('شارژر، سیم‌کارت')).toBeInTheDocument();
    expect(screen.getByText('امضای مشتری')).toBeInTheDocument();
    expect(screen.queryByText(/با وضعیت «تحویل داده شده»/)).not.toBeInTheDocument();
  });

  it('رسید تحویل، زمان تحویل و امضای تحویل‌گیرنده را نشان می‌دهد', async () => {
    renderPrint('/devices/device-1/print?type=delivery');

    expect(await screen.findByText('رسید تحویل دستگاه — نسخه مشتری')).toBeInTheDocument();
    expect(screen.getByText('زمان تحویل واقعی')).toBeInTheDocument();
    expect(screen.getByText('امضای تحویل‌گیرنده')).toBeInTheDocument();
    expect(screen.getByText('امضای تحویل‌دهنده')).toBeInTheDocument();
    expect(screen.getByText(/به مشتری تحویل شد/)).toBeInTheDocument();
  });
});
