import type { INestApplication } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import request from 'supertest';
import { jalaliYear } from '../src/common/utils/jalali';
import { bearer, createTestApp, httpServer, login, resetDatabase, setupAdmin } from './helpers';

interface DeviceFileResponse {
  id: string;
  label: string;
  path: string;
  clientPath: string | null;
  relativePath: string | null;
  isPrimary: boolean;
  accessStatus: string;
  category: string;
  backupStatus: string;
  sizeBytes: number | null;
  alternativePath: string | null;
  storageLocation: { id: string; name: string } | null;
}

interface DeviceResponse {
  id: string;
  intakeCode: string;
  files: DeviceFileResponse[];
  storageSummary: {
    filesTotal: number;
    unavailableCount: number;
    primaryFolder: { path: string; accessStatus: string } | null;
  } | null;
}

interface LocationResponse {
  id: string;
  name: string;
  rootPath: string;
  clientRoot: string | null;
  isDefault: boolean;
  version: number;
  fileCount: number;
  dataBytes: number;
  health: {
    available: boolean;
    writable: boolean;
    totalBytes: number | null;
    freeBytes: number | null;
    usagePercent: number | null;
    lastSuccessAt: string | null;
    error: string | null;
  };
}

describe('مدیریت فایل‌ها و محل ذخیره‌سازی (مرحله ۳)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof httpServer>;
  let adminToken = '';
  let customerId = '';
  let deviceId = '';
  let deviceCode = '';
  let serverLocationId = '';
  const storageRoot = process.env.STORAGE_ROOT as string;

  function devicePayload(index: number, overrides: Record<string, unknown> = {}) {
    return {
      customerId,
      broughtByName: 'مریم کاظمی',
      broughtByPhone: '09121234567',
      equipmentType: 'laptop',
      manufacturer: 'lenovo',
      model: `IdeaPad ${index}`,
      serialNumber: `STG-SN-${index}`,
      imei1: `35678901234${String(index).padStart(4, '0')}`.slice(0, 15),
      reportedProblem: 'هارد دستگاه صدای غیرعادی دارد و ویندوز بالا نمی‌آید.',
      accessories: ['charger'],
      lockStatus: 'password',
      ...overrides,
    };
  }

  async function createDevice(index: number, overrides: Record<string, unknown> = {}) {
    const response = await request(http)
      .post('/api/devices')
      .set(bearer(adminToken))
      .send(devicePayload(index, overrides))
      .expect(201);
    return response.body as DeviceResponse;
  }

  beforeAll(async () => {
    await resetDatabase();
    app = await createTestApp();
    await app.listen(0);
    http = httpServer(app);
    await setupAdmin(app);
    adminToken = (await login(app, 'admin', 'Admin12345')).accessToken;

    const customer = await request(http)
      .post('/api/customers')
      .set(bearer(adminToken))
      .send({ fullName: 'شرکت داده‌پردازان نمونه', phone: '02188776655' })
      .expect(201);
    customerId = customer.body.id;

    const device = await createDevice(1);
    deviceId = device.id;
    deviceCode = device.intakeCode;
  });

  afterAll(async () => {
    await app.close();
  });

  it('محل ذخیره‌سازی پیش‌فرض از STORAGE_ROOT ساخته می‌شود و سلامت آن گزارش می‌گردد', async () => {
    const response = await request(http)
      .get('/api/storage/locations')
      .set(bearer(adminToken))
      .expect(200);
    const locations = response.body as LocationResponse[];
    expect(locations.length).toBeGreaterThan(0);
    const primary = locations.find((location) => location.isDefault);
    expect(primary).toBeDefined();
    serverLocationId = primary!.id;
    expect(primary!.rootPath).toBe(path.resolve(storageRoot));
    expect(primary!.health.available).toBe(true);
    expect(primary!.health.writable).toBe(true);
    expect(primary!.health.totalBytes).toBeGreaterThan(0);
    expect(primary!.health.freeBytes).toBeGreaterThanOrEqual(0);
    expect(primary!.health.lastSuccessAt).toBeTruthy();
    expect(primary!.dataBytes).toBeGreaterThanOrEqual(0);
  });

  it('با پذیرش دستگاه، پوشه سال/کد پذیرش و زیرپوشه‌ها خودکار ساخته می‌شود', async () => {
    const year = jalaliYear(new Date());
    const folder = path.join(storageRoot, String(year), deviceCode);
    expect(fs.existsSync(folder)).toBe(true);
    for (const sub of ['Original', 'Backup', 'Recovered', 'Reports', 'Images', 'Documents']) {
      expect(fs.existsSync(path.join(folder, sub))).toBe(true);
    }

    const detail = await request(http)
      .get(`/api/devices/${deviceId}`)
      .set(bearer(adminToken))
      .expect(200);
    const device = detail.body as DeviceResponse;
    const primary = device.files.find((file) => file.isPrimary);
    expect(primary).toBeDefined();
    expect(primary!.relativePath).toBe(`${year}/${deviceCode}`);
    expect(primary!.path).toBe(folder);
    expect(primary!.accessStatus).toBe('ok');
    expect(primary!.category).toBe('root');
    expect(device.storageSummary?.primaryFolder?.path).toBe(folder);
  });

  it('ساختار پوشه و زیرپوشه‌ها از تنظیمات قابل تغییر است', async () => {
    await request(http)
      .patch('/api/storage/config')
      .set(bearer(adminToken))
      .send({
        folderLayout: '{year}/{intakeCode}',
        subfolders: ['Original', 'Backup', 'ReportFiles'],
        lowSpaceGb: 2,
      })
      .expect(200);

    const device = await createDevice(2);
    const year = jalaliYear(new Date());
    const folder = path.join(storageRoot, String(year), device.intakeCode);
    expect(fs.existsSync(path.join(folder, 'ReportFiles'))).toBe(true);
    expect(fs.existsSync(path.join(folder, 'Recovered'))).toBe(false);

    const invalid = await request(http)
      .patch('/api/storage/config')
      .set(bearer(adminToken))
      .send({ folderLayout: '../{intakeCode}' })
      .expect(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
  });

  it('محل ذخیره‌سازی دوم با مسیر کلاینتی ثبت می‌شود و پوشه دستگاه در آن ساخته می‌گردد', async () => {
    const nasRoot = path.join(storageRoot, 'nas-share');
    fs.mkdirSync(nasRoot, { recursive: true });
    const created = await request(http)
      .post('/api/storage/locations')
      .set(bearer(adminToken))
      .send({
        name: 'هارد شبکه NAS',
        rootPath: nasRoot,
        clientRoot: 'Z:\\RepairStorage',
        kind: 'nas',
        driveLetter: 'Z:',
        volumeLabel: 'NAS-01',
        volumeId: 'VOL-9988',
        hostName: 'REPAIR-SERVER',
        isDefault: true,
        notes: 'پوشه مشترک شبکه داخلی',
      })
      .expect(201);
    const nas = created.body as LocationResponse;
    expect(nas.isDefault).toBe(true);
    expect(nas.clientRoot).toBe('Z:\\RepairStorage');

    const device = await createDevice(3);
    const year = jalaliYear(new Date());
    const primary = device.files.find((file) => file.isPrimary);
    expect(primary?.storageLocation?.id).toBe(nas.id);
    expect(primary?.clientPath).toBe(`Z:\\RepairStorage\\${year}\\${device.intakeCode}`);
    expect(fs.existsSync(path.join(nasRoot, String(year), device.intakeCode))).toBe(true);

    const duplicate = await request(http)
      .post('/api/storage/locations')
      .set(bearer(adminToken))
      .send({ name: 'تکراری', rootPath: nasRoot })
      .expect(409);
    expect(duplicate.body.code).toBe('DUPLICATE');

    // بازگرداندن محل پیش‌فرض سرور برای ادامه آزمون‌ها
    await request(http)
      .patch(`/api/storage/locations/${nas.id}`)
      .set(bearer(adminToken))
      .send({ isDefault: false, version: nas.version })
      .expect(400);
    await request(http)
      .patch(`/api/storage/locations/${serverLocationId}`)
      .set(bearer(adminToken))
      .send({ isDefault: true, version: (await getLocation(serverLocationId)).version })
      .expect(200);
  });

  it('چند مسیر فایل با محل ذخیره‌سازی، مسیر جایگزین و وضعیت بکاپ ثبت می‌شود', async () => {
    const created = await request(http)
      .post(`/api/devices/${deviceId}/files`)
      .set(bearer(adminToken))
      .send({
        label: 'بکاپ کامل درایو',
        storageLocationId: serverLocationId,
        relativePath: `${jalaliYear(new Date())}/${deviceCode}/Backup/full-image`,
        category: 'backup',
        backupStatus: 'completed',
        sizeBytes: 1048576,
        alternativePath: '\\\\REPAIR-SERVER\\RepairStorage\\copy\\full-image',
        notes: 'کپی دوم روی هارد دوم',
      })
      .expect(201);
    const files = (created.body as DeviceResponse).files;
    const backup = files.find((file) => file.label === 'بکاپ کامل درایو');
    expect(backup).toBeDefined();
    expect(backup!.storageLocation?.id).toBe(serverLocationId);
    expect(backup!.category).toBe('backup');
    expect(backup!.backupStatus).toBe('completed');
    expect(backup!.alternativePath).toContain('REPAIR-SERVER');
    expect(backup!.path).toBe(
      path.join(storageRoot, String(jalaliYear(new Date())), deviceCode, 'Backup', 'full-image'),
    );

    const second = await request(http)
      .post(`/api/devices/${deviceId}/files`)
      .set(bearer(adminToken))
      .send({
        label: 'فایل روی هارد دوم',
        storageKind: 'external',
        path: 'E:\\backups\\device-1',
        backupStatus: 'pending',
      })
      .expect(201);
    expect(
      (second.body as DeviceResponse).files.filter((file) => !file.isPrimary).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('جست‌وجوی فایل‌ها با کد پذیرش و فیلتر وضعیت بکاپ انجام می‌شود', async () => {
    const byCode = await request(http)
      .get(`/api/storage/files?search=${encodeURIComponent(deviceCode)}`)
      .set(bearer(adminToken))
      .expect(200);
    expect(byCode.body.total).toBeGreaterThanOrEqual(3);
    expect(
      (byCode.body.items as Array<{ intakeCode: string }>).every(
        (item) => item.intakeCode === deviceCode,
      ),
    ).toBe(true);

    const completed = await request(http)
      .get('/api/storage/files?backupStatus=completed')
      .set(bearer(adminToken))
      .expect(200);
    expect(
      (completed.body.items as Array<{ backupStatus: string }>).every(
        (item) => item.backupStatus === 'completed',
      ),
    ).toBe(true);

    const byPath = await request(http)
      .get('/api/storage/files?search=full-image')
      .set(bearer(adminToken))
      .expect(200);
    expect(byPath.body.total).toBe(1);
  });

  it('بررسی دسترسی مسیر، حجم را محاسبه و قطع بودن مسیر را تشخیص می‌دهد', async () => {
    const detail = await request(http)
      .get(`/api/devices/${deviceId}`)
      .set(bearer(adminToken))
      .expect(200);
    const primary = (detail.body as DeviceResponse).files.find((file) => file.isPrimary)!;
    const folder = primary.path;
    fs.writeFileSync(path.join(folder, 'Backup', 'sample.bin'), Buffer.alloc(2048));

    const ok = await request(http)
      .post(`/api/devices/${deviceId}/files/${primary.id}/check`)
      .set(bearer(adminToken))
      .expect(201);
    expect(ok.body.accessStatus).toBe('ok');
    expect(ok.body.sizeBytes).toBeGreaterThanOrEqual(2048);

    fs.rmSync(folder, { recursive: true, force: true });
    const missing = await request(http)
      .post(`/api/devices/${deviceId}/files/${primary.id}/check`)
      .set(bearer(adminToken))
      .expect(201);
    expect(missing.body.accessStatus).toBe('missing');

    const summary = await request(http)
      .get(`/api/devices/${deviceId}/storage`)
      .set(bearer(adminToken))
      .expect(200);
    expect(summary.body.unavailableCount).toBeGreaterThan(0);
  });

  it('پوشه دستگاه پس از حذف دستی با درخواست مجدد بازسازی می‌شود', async () => {
    const rebuilt = await request(http)
      .post(`/api/devices/${deviceId}/storage/provision`)
      .set(bearer(adminToken))
      .expect(201);
    expect(rebuilt.body.file.accessStatus).toBe('ok');
    expect(rebuilt.body.file.isPrimary).toBe(true);
    expect(fs.existsSync(path.join(rebuilt.body.file.path, 'Backup'))).toBe(true);
  });

  it('بازسازی پوشه، مسیر و متادیتای محل ذخیره‌سازی را همگام می‌کند', async () => {
    const detail = await request(http)
      .get(`/api/devices/${deviceId}`)
      .set(bearer(adminToken))
      .expect(200);
    const primary = (detail.body as DeviceResponse).files.find((file) => file.isPrimary)!;

    const moved = await request(http)
      .patch(`/api/devices/${deviceId}/files/${primary.id}`)
      .set(bearer(adminToken))
      .send({ label: primary.label, path: 'D:\\old-volume\\device', storageKind: 'local' })
      .expect(200);
    const movedPrimary = (moved.body as DeviceResponse).files.find((file) => file.isPrimary)!;
    expect(movedPrimary.path).toBe('D:\\old-volume\\device');
    expect(movedPrimary.storageLocation).toBeNull();

    const rebuilt = await request(http)
      .post(`/api/devices/${deviceId}/storage/provision`)
      .set(bearer(adminToken))
      .expect(201);
    expect(rebuilt.body.file.path).toBe(
      path.join(storageRoot, String(jalaliYear(new Date())), deviceCode),
    );
    expect(rebuilt.body.file.relativePath).toBe(`${jalaliYear(new Date())}/${deviceCode}`);
    expect(rebuilt.body.file.storageLocation.id).toBe(serverLocationId);
    expect(fs.existsSync(path.join(rebuilt.body.file.path, 'Backup'))).toBe(true);
  });

  it('بلیت بازکردن پوشه یک‌بارمصرف و کوتاه‌عمر است', async () => {
    const detail = await request(http)
      .get(`/api/devices/${deviceId}`)
      .set(bearer(adminToken))
      .expect(200);
    const primary = (detail.body as DeviceResponse).files.find((file) => file.isPrimary)!;

    const ticket = await request(http)
      .post(`/api/devices/${deviceId}/files/${primary.id}/open-ticket`)
      .set(bearer(adminToken))
      .expect(201);
    expect(ticket.body.token).toHaveLength(43);
    expect(new Date(ticket.body.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const consumed = await request(http)
      .post(`/api/storage/open-tickets/${ticket.body.token}/consume`)
      .expect(200);
    expect(consumed.body.serverPath).toBe(primary.path);

    const again = await request(http)
      .post(`/api/storage/open-tickets/${ticket.body.token}/consume`)
      .expect(410);
    expect(again.body.code).toBe('OPEN_TICKET_INVALID');

    await request(http).post('/api/storage/open-tickets/invalid-token/consume').expect(410);
  });

  it('محل ذخیره‌سازی در حال استفاده حذف نمی‌شود و به‌روزرسانی نسخه‌دار است', async () => {
    const location = await getLocation(serverLocationId);
    expect(location.fileCount).toBeGreaterThan(0);

    const conflict = await request(http)
      .patch(`/api/storage/locations/${serverLocationId}`)
      .set(bearer(adminToken))
      .send({ name: 'نام جدید', version: location.version + 5 })
      .expect(409);
    expect(conflict.body.code).toBe('CONFLICT');

    const remove = await request(http)
      .delete(`/api/storage/locations/${serverLocationId}`)
      .set(bearer(adminToken))
      .expect(409);
    expect(remove.body.code).toBe('STORAGE_LOCATION_IN_USE');
  });

  it('اگر محل ذخیره‌سازی در دسترس نباشد، پذیرش انجام می‌شود و مسیر با هشدار ثبت می‌گردد', async () => {
    const blocker = path.join(storageRoot, 'offline-blocker');
    fs.writeFileSync(blocker, 'not a directory');
    const offlineRoot = path.join(blocker, 'volume');
    const offline = await request(http)
      .post('/api/storage/locations')
      .set(bearer(adminToken))
      .send({
        name: 'هارد قطع‌شده',
        rootPath: offlineRoot,
        kind: 'external',
        isDefault: true,
      })
      .expect(201);
    expect(offline.body.health.available).toBe(false);

    const device = await createDevice(4);
    const primary = device.files.find((file) => file.isPrimary);
    expect(primary?.accessStatus).toBe('unavailable');
    expect(primary?.path).toBe(path.join(offlineRoot, String(jalaliYear(new Date())), device.intakeCode));

    const health = await request(http)
      .post(`/api/storage/locations/${offline.body.id}/check`)
      .set(bearer(adminToken))
      .expect(200);
    expect(health.body.health.available).toBe(false);
    expect(health.body.health.error).toBeTruthy();

    await request(http)
      .patch(`/api/storage/locations/${serverLocationId}`)
      .set(bearer(adminToken))
      .send({ isDefault: true, version: (await getLocation(serverLocationId)).version })
      .expect(200);
    await request(http)
      .patch(`/api/storage/locations/${offline.body.id}`)
      .set(bearer(adminToken))
      .send({ isActive: false, version: offline.body.version })
      .expect(200);
  });

  it('محل ذخیره‌سازی بدون فایل حذف می‌شود و پیش‌فرض به محل دیگری منتقل می‌گردد', async () => {
    const tempRoot = path.join(storageRoot, 'temp-volume');
    fs.mkdirSync(tempRoot, { recursive: true });
    const temp = await request(http)
      .post('/api/storage/locations')
      .set(bearer(adminToken))
      .send({ name: 'حافظه موقت', rootPath: tempRoot, isDefault: true })
      .expect(201);

    await request(http)
      .delete(`/api/storage/locations/${temp.body.id}`)
      .set(bearer(adminToken))
      .expect(200);

    const locations = await request(http)
      .get('/api/storage/locations')
      .set(bearer(adminToken))
      .expect(200);
    expect(
      (locations.body as LocationResponse[]).some((location) => location.id === temp.body.id),
    ).toBe(false);
    expect((locations.body as LocationResponse[]).some((location) => location.isDefault)).toBe(true);
  });

  it('دسترسی به مسیرهای بکاپ تابع مجوز files.view است', async () => {
    const role = await request(http)
      .post('/api/roles')
      .set(bearer(adminToken))
      .send({
        nameFa: 'مشاهده تعمیرات بدون فایل',
        permissions: ['dashboard.view', 'repairs.view'],
      })
      .expect(201);
    const created = await request(http)
      .post('/api/users')
      .set(bearer(adminToken))
      .send({
        username: 'nofiles',
        fullName: 'کاربر بدون دسترسی فایل',
        roleId: role.body.id,
        password: 'NoFilesPass123',
      })
      .expect(201);
    expect(created.body.permissions).not.toContain('files.view');

    const session = await login(app, 'nofiles', 'NoFilesPass123');
    await request(http)
      .post('/api/auth/change-password')
      .set(bearer(session.accessToken))
      .send({ currentPassword: 'NoFilesPass123', newPassword: 'NoFilesNew123' })
      .expect(200);
    const fresh = await login(app, 'nofiles', 'NoFilesNew123');

    const detail = await request(http)
      .get(`/api/devices/${deviceId}`)
      .set(bearer(fresh.accessToken))
      .expect(200);
    expect((detail.body as DeviceResponse).files).toEqual([]);
    expect((detail.body as DeviceResponse).storageSummary).toBeNull();

    await request(http)
      .get('/api/storage/locations')
      .set(bearer(fresh.accessToken))
      .expect(403);
    await request(http)
      .get('/api/storage/files')
      .set(bearer(fresh.accessToken))
      .expect(403);
    await request(http)
      .post(`/api/devices/${deviceId}/storage/provision`)
      .set(bearer(fresh.accessToken))
      .expect(403);
  });

  async function getLocation(id: string): Promise<LocationResponse> {
    const response = await request(http)
      .get('/api/storage/locations')
      .set(bearer(adminToken))
      .expect(200);
    const location = (response.body as LocationResponse[]).find((item) => item.id === id);
    if (!location) throw new Error('محل ذخیره‌سازی پیدا نشد.');
    return location;
  }
});
