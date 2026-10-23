import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '@/stores/auth';
import { ToastProvider } from '@/components/ui/toast';
import { SettingsPage } from './settings-page';

function response(payload: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
  });
}

const settings = {
  workshop: { name: 'تعمیرگاه نمونه', address: 'تهران', phone: '021-12345678', logo: '' },
  security: {
    idleTimeoutMinutes: 10,
    maxFailedLogins: 5,
    lockoutMinutes: 15,
    sessionDays: 7,
  },
  appearance: {
    language: 'fa',
    calendar: 'jalali',
    timezone: 'Asia/Tehran',
    timeFormat: '24',
    theme: 'dark',
    accentColor: 'teal',
  },
  backup: {
    retentionCount: 14,
    directory: 'D:\\Backups',
    scheduleEnabled: true,
    scheduleTime: '03:00',
    encrypt: true,
    includeSettings: true,
    includeFiles: false,
  },
  devices: { intakePrefix: 'MR', defaultDueDays: 3 },
  storage: {
    folderLayout: '{year}/{intakeCode}',
    subfolders: ['Original', 'Backup'],
    lowSpaceGb: 5,
  },
};

const backupList = {
  items: [
    {
      name: 'backup-20261023-030000',
      createdAt: '2026-10-23T03:00:00.000Z',
      sizeBytes: 2048,
      encrypted: false,
      includesSettings: true,
      includesFiles: false,
      databaseBytes: 2048,
      filesCount: 0,
      filesBytes: 0,
      legacy: false,
    },
  ],
  status: {
    pgDumpAvailable: true,
    pgDumpVersion: 'pg_dump 18',
    pgRestoreAvailable: true,
    pgRestoreVersion: 'pg_restore 18',
    directory: 'D:\\Backups',
    retentionCount: 14,
    scheduledEnabled: true,
    scheduleTime: '03:00',
    encryptionAvailable: true,
    lastSuccessAt: '2026-10-23T03:00:00.000Z',
    lastSuccessName: 'backup-20261023-030000',
    lastFailureAt: null,
    lastFailureMessage: null,
  },
  runs: [
    {
      id: 'run-1',
      bundleName: 'backup-20261023-030000',
      operation: 'backup',
      trigger: 'scheduled',
      status: 'success',
      encrypted: false,
      includesFiles: false,
      durationMs: 1200,
      error: null,
      createdBy: null,
      createdAt: '2026-10-23T03:00:00.000Z',
    },
  ],
};

function mockFetch() {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/settings')) return response(settings);
    if (url.includes('/api/backups')) return response(backupList);
    if (url.includes('/api/storage/locations')) return response([]);
    if (url.includes('/api/device-config')) {
      return response({ fields: [], options: {}, technicians: [] });
    }
    return response({});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('تنظیمات سامانه (مرحله ۵)', () => {
  beforeEach(() => {
    useAuth.setState({
      status: 'authed',
      user: { permissions: ['*'] } as unknown as ReturnType<typeof useAuth.getState>['user'],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuth.setState({ status: 'anon', user: null });
  });

  it('بخش‌های ظاهر، برنامه پشتیبان و تاریخچه را نمایش می‌دهد', async () => {
    mockFetch();
    render(
      <MemoryRouter>
        <ToastProvider>
          <SettingsPage />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('تنظیمات سامانه')).toBeInTheDocument();
    expect(screen.getByText('زبان، تقویم و ظاهر')).toBeInTheDocument();
    expect(screen.getByText('برنامه پشتیبان‌گیری')).toBeInTheDocument();
    expect(await screen.findByText('پشتیبان‌گیری و بازیابی')).toBeInTheDocument();
    expect(screen.getByText(/آخرین پشتیبان موفق/)).toBeInTheDocument();
    expect(screen.getByText('تاریخچه عملیات پشتیبان‌گیری و بازیابی')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('D:\\Backups')).toBeInTheDocument();
    expect(screen.getByLabelText('پوسته برنامه')).toHaveValue('dark');
    expect(screen.getByLabelText('تقویم')).toHaveValue('jalali');
  });

  it('بازیابی فقط با تایپ دقیق نام بسته فعال می‌شود', async () => {
    mockFetch();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ToastProvider>
          <SettingsPage />
        </ToastProvider>
      </MemoryRouter>,
    );

    const restoreButton = await screen.findByRole('button', { name: /بازیابی/ });
    await user.click(restoreButton);

    expect(await screen.findByText('بازیابی نسخه پشتیبان')).toBeInTheDocument();
    const confirmButton = screen.getByRole('button', { name: /اجرای بازیابی/ });
    expect(confirmButton).toBeDisabled();

    const input = screen.getByLabelText(/برای تأیید، نام نسخه را وارد کنید/);
    await user.type(input, 'backup-20261023-030000');
    expect(confirmButton).toBeEnabled();
  });
});
