import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/ui/toast';
import { useAuth } from '@/stores/auth';
import type { Page, StorageFileEntry, StorageLocation } from '@/lib/types';
import { StoragePage } from './storage-page';

const file: StorageFileEntry = {
  id: 'file-1',
  deviceId: 'device-1',
  intakeCode: 'MR-1405-0007',
  ownerName: 'سارا احمدی',
  label: 'بکاپ مخاطبین',
  path: '/srv/repair-storage/1405/MR-1405-0007/Backup/contacts.vcf',
  relativePath: '1405/MR-1405-0007/Backup/contacts.vcf',
  clientPath: 'Z:\\RepairStorage\\1405\\MR-1405-0007\\Backup\\contacts.vcf',
  storageKind: 'network',
  category: 'backup',
  sizeBytes: 2048,
  backupStatus: 'completed',
  alternativePath: null,
  accessStatus: 'ok',
  lastCheckedAt: '2026-10-22T09:00:00.000Z',
  isPrimary: false,
  notes: null,
  version: 1,
  storageLocation: { id: 'loc-1', name: 'هارد اصلی', kind: 'nas', rootPath: 'Z:\\RepairStorage' },
  createdByName: 'مدیر سامانه',
  createdAt: '2026-10-22T08:00:00.000Z',
  updatedAt: '2026-10-22T08:00:00.000Z',
};

const location: StorageLocation = {
  id: 'loc-1',
  name: 'هارد اصلی',
  rootPath: 'Z:\\RepairStorage',
  clientRoot: 'Z:\\RepairStorage',
  kind: 'nas',
  driveLetter: 'Z:',
  volumeLabel: 'NAS-01',
  volumeId: 'VOL-1',
  hostName: 'REPAIR-SERVER',
  notes: null,
  isDefault: true,
  isActive: true,
  fileCount: 3,
  dataBytes: 2048,
  version: 1,
  createdByName: 'مدیر سامانه',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  health: {
    available: true,
    writable: true,
    totalBytes: 1_000_000_000,
    freeBytes: 400_000_000,
    usedBytes: 600_000_000,
    usagePercent: 60,
    lowSpace: false,
    checkedAt: '2026-10-22T09:00:00.000Z',
    lastSuccessAt: '2026-10-22T09:00:00.000Z',
    error: null,
  },
};

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, text: async () => JSON.stringify(data) };
}

function stubApi() {
  const filesPage: Page<StorageFileEntry> = {
    items: [file],
    total: 1,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/storage/files')) return jsonResponse(filesPage);
      if (url.startsWith('/api/storage/locations')) return jsonResponse([location]);
      if (url.startsWith('/api/storage/config')) {
        return jsonResponse({
          folderLayout: '{year}/{intakeCode}',
          subfolders: ['Original', 'Backup'],
          lowSpaceGb: 5,
        });
      }
      return jsonResponse({});
    }),
  );
}

function setPermissions(permissions: string[]) {
  useAuth.setState({
    status: 'authed',
    user: {
      id: 'user-1',
      username: 'admin',
      fullName: 'مدیر سامانه',
      phone: null,
      role: { id: 'role-1', key: 'admin', nameFa: 'مدیر کل' },
      permissions,
      isActive: true,
      mustChangePassword: false,
      lastLoginAt: null,
      passwordChangedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      version: 1,
    },
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <StoragePage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('مدیریت فایل‌ها و محل ذخیره‌سازی', () => {
  beforeEach(() => {
    setPermissions(['*']);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('فایل‌ها و مسیر کلاینتی را نمایش می‌دهد', async () => {
    stubApi();
    renderPage();

    expect(await screen.findByText('MR-1405-0007')).toBeInTheDocument();
    expect(screen.getByText('بکاپ مخاطبین')).toBeInTheDocument();
    expect(screen.getByText('Z:\\RepairStorage\\1405\\MR-1405-0007\\Backup\\contacts.vcf')).toBeInTheDocument();
    expect(screen.getAllByText('بکاپ کامل').length).toBeGreaterThan(0);
  });

  it('سلامت محل ذخیره‌سازی و فضای آزاد را نشان می‌دهد', async () => {
    stubApi();
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /محل‌های ذخیره‌سازی/ }));
    expect(await screen.findByText('هارد اصلی')).toBeInTheDocument();
    expect(screen.getByText('متصل')).toBeInTheDocument();
    expect(screen.getByText(/آزاد:/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /افزودن محل/ })).toBeInTheDocument();
  });

  it('کاربر دارای مجوز مشاهده، دکمه افزودن محل را نمی‌بیند', async () => {
    stubApi();
    setPermissions(['files.view']);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /محل‌های ذخیره‌سازی/ }));
    expect(await screen.findByText('هارد اصلی')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /افزودن محل/ })).not.toBeInTheDocument();
  });
});
