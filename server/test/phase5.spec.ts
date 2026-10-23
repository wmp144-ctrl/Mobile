import type { INestApplication } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import request from 'supertest';
import { BackupsService } from '../src/modules/backups/backups.service';
import { ADMIN, bearer, createTestApp, httpServer, login, resetDatabase, setupAdmin } from './helpers';

interface FieldResponse {
  id: string;
  key: string;
  label: string;
  type: string;
  isSearchable: boolean;
  isReportable: boolean;
  isEnabled: boolean;
}

interface RoleOption {
  id: string;
  key: string;
}

interface DeviceResponse {
  id: string;
  intakeCode: string;
  customFields: Record<string, unknown>;
}

function localClock(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tehran',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

describe('تنظیمات، توسعه‌پذیری، پشتیبان‌گیری و بازیابی (مرحله ۵)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof httpServer>;
  let adminToken = '';
  let customerId = '';
  let searchableField: FieldResponse | null = null;
  let hiddenField: FieldResponse | null = null;
  let amountField: FieldResponse | null = null;
  let device: DeviceResponse | null = null;

  beforeAll(async () => {
    await resetDatabase();
    app = await createTestApp();
    http = httpServer(app);
    await setupAdmin(app);
    adminToken = (await login(app, ADMIN.username, ADMIN.password)).accessToken;

    const customer = await request(http)
      .post('/api/customers')
      .set(bearer(adminToken))
      .send({ fullName: 'مشتری مرحله پنج', phone: '09120000000', jobTitle: 'کارمند' })
      .expect(201);
    customerId = customer.body.id;
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('تنظیمات عمومی، تاریخ و ظاهر ذخیره و در اطلاعات عمومی اعمال می‌شود', async () => {
    const defaults = await request(http).get('/api/settings').set(bearer(adminToken)).expect(200);
    expect(defaults.body.appearance.language).toBe('fa');
    expect(defaults.body.appearance.calendar).toBe('jalali');
    expect(defaults.body.appearance.theme).toBe('light');
    expect(defaults.body.appearance.timezone).toBe('Asia/Tehran');
    expect(defaults.body.backup.scheduleEnabled).toBe(false);
    expect(defaults.body.backup.encrypt).toBe(true);

    const updated = await request(http)
      .patch('/api/settings')
      .set(bearer(adminToken))
      .send({
        language: 'en',
        calendar: 'gregorian',
        timezone: 'Asia/Dubai',
        timeFormat: '12',
        theme: 'dark',
        accentColor: 'teal',
        backupScheduleTime: '04:30',
        backupDirectory: '',
        backupIncludeSettings: true,
      })
      .expect(200);
    expect(updated.body.appearance.language).toBe('en');
    expect(updated.body.appearance.calendar).toBe('gregorian');
    expect(updated.body.appearance.theme).toBe('dark');
    expect(updated.body.appearance.accentColor).toBe('teal');
    expect(updated.body.backup.scheduleTime).toBe('04:30');

    const info = await request(http).get('/api/public/info').expect(200);
    expect(info.body.appearance.theme).toBe('dark');
    expect(info.body.appearance.accentColor).toBe('teal');
    expect(info.body.workshopName).toBe(ADMIN.workshopName);

    await request(http)
      .patch('/api/settings')
      .set(bearer(adminToken))
      .send({ timezone: 'Mars/Olympus' })
      .expect(400);
    await request(http)
      .patch('/api/settings')
      .set(bearer(adminToken))
      .send({ theme: 'neon' })
      .expect(400);
    await request(http)
      .patch('/api/settings')
      .set(bearer(adminToken))
      .send({ backupScheduleTime: '25:00' })
      .expect(400);

    // بازگرداندن مقادیر پیش‌فرض نمایش برای بقیه آزمون‌ها
    await request(http)
      .patch('/api/settings')
      .set(bearer(adminToken))
      .send({ language: 'fa', calendar: 'jalali', timezone: 'Asia/Tehran', timeFormat: '24', theme: 'light' })
      .expect(200);
  });

  it('فیلدهای سفارشی جدید با پرچم جست‌وجو و گزارش مدیریت می‌شوند', async () => {
    const searchable = await request(http)
      .post('/api/device-config/fields')
      .set(bearer(adminToken))
      .send({
        labelFa: 'کد رهگیری آزمایشگاه',
        fieldType: 'text',
        groupName: 'اطلاعات تکمیلی',
        isSearchable: true,
        isReportable: true,
      })
      .expect(201);
    searchableField = searchable.body as FieldResponse;
    expect(searchableField.isSearchable).toBe(true);

    const hidden = await request(http)
      .post('/api/device-config/fields')
      .set(bearer(adminToken))
      .send({
        labelFa: 'یادداشت داخلی مخفی',
        fieldType: 'textarea',
        groupName: 'اطلاعات تکمیلی',
        isSearchable: false,
        isReportable: false,
      })
      .expect(201);
    hiddenField = hidden.body as FieldResponse;
    expect(hiddenField.isSearchable).toBe(false);

    const amount = await request(http)
      .post('/api/device-config/fields')
      .set(bearer(adminToken))
      .send({
        labelFa: 'هزینه برآوردی',
        fieldType: 'amount',
        groupName: 'اطلاعات تکمیلی',
        isSearchable: true,
        isReportable: true,
      })
      .expect(201);
    amountField = amount.body as FieldResponse;
    expect(amountField.type).toBe('amount');

    const datetime = await request(http)
      .post('/api/device-config/fields')
      .set(bearer(adminToken))
      .send({ labelFa: 'زمان مراجعه بعدی', fieldType: 'datetime' })
      .expect(201);
    expect(datetime.body.type).toBe('datetime');

    const file = await request(http)
      .post('/api/device-config/fields')
      .set(bearer(adminToken))
      .send({ labelFa: 'فایل رسید', fieldType: 'file' })
      .expect(201);
    expect(file.body.type).toBe('file');

    const list = await request(http)
      .get('/api/device-config')
      .set(bearer(adminToken))
      .expect(200);
    const fields = list.body.fields as FieldResponse[];
    expect(fields.find((field) => field.key === searchableField!.key)?.isReportable).toBe(true);
    expect(fields.find((field) => field.key === hiddenField!.key)?.isSearchable).toBe(false);

    const created = await request(http)
      .post('/api/devices')
      .set(bearer(adminToken))
      .send({
        customerId,
        broughtByName: 'آورنده آزمایشی',
        broughtByJob: 'دانشجو',
        equipmentType: 'mobile',
        manufacturer: 'samsung',
        model: 'Galaxy S23',
        serialNumber: '',
        imei1: '',
        reportedProblem: 'تست فیلد سفارشی',
        accessories: [],
        lockStatus: 'unlocked',
        customFields: {
          [searchableField!.key]: 'ZX-SEARCH-77',
          [hiddenField!.key]: 'ZX-HIDDEN-77',
          [amountField!.key]: 125000.5,
          [datetime.body.key as string]: '2026-10-23T10:30:00.000Z',
          [file.body.key as string]: 'receipt-1001.jpg',
        },
      })
      .expect(201);
    device = created.body as DeviceResponse;
    expect(device.customFields[searchableField!.key]).toBe('ZX-SEARCH-77');
    expect(device.customFields[amountField!.key]).toBe(125000.5);

    const negative = await request(http)
      .post('/api/devices')
      .set(bearer(adminToken))
      .send({
        customerId,
        broughtByName: 'آورنده دوم',
        equipmentType: 'mobile',
        manufacturer: 'samsung',
        model: 'Galaxy A14',
        serialNumber: '',
        imei1: '',
        reportedProblem: 'مبلغ نامعتبر',
        accessories: [],
        lockStatus: 'unlocked',
        customFields: {
          [searchableField!.key]: 'ZX-SEARCH-88',
          [amountField!.key]: -10,
        },
      })
      .expect(400);
    expect(negative.body.code).toBe('VALIDATION_ERROR');

    // فیلد غیرفعال می‌شود اما داده ثبت‌شده قبلی حذف نمی‌شود
    await request(http)
      .patch(`/api/device-config/fields/${amountField!.id}`)
      .set(bearer(adminToken))
      .send({ isEnabled: false })
      .expect(200);

    const reloaded = await request(http)
      .get(`/api/devices/${device.id}`)
      .set(bearer(adminToken))
      .expect(200);
    expect((reloaded.body as DeviceResponse).customFields[amountField!.key]).toBe(125000.5);
  });

  it('جست‌وجو فقط فیلدهای علامت‌خورده و ستون‌های گزارش فیلدهای قابل گزارش را شامل می‌شوند', async () => {
    const searchableResult = await request(http)
      .get('/api/devices?search=ZX-SEARCH-77')
      .set(bearer(adminToken))
      .expect(200);
    expect(searchableResult.body.total).toBe(1);

    const hiddenResult = await request(http)
      .get('/api/devices?search=ZX-HIDDEN-77')
      .set(bearer(adminToken))
      .expect(200);
    expect(hiddenResult.body.total).toBe(0);

    const options = await request(http)
      .get('/api/reports/options')
      .set(bearer(adminToken))
      .expect(200);
    const customKeys = (options.body.customColumns as { key: string; label: string }[]).map(
      (column) => column.key,
    );
    expect(customKeys).toContain(`custom:${searchableField!.key}`);
    expect(customKeys).not.toContain(`custom:${hiddenField!.key}`);

    const report = await request(http)
      .post('/api/reports/run')
      .set(bearer(adminToken))
      .send({
        charts: [{ id: 'status', dimension: 'status', metric: 'count', chartType: 'bar' }],
        tableColumns: ['intakeCode', `custom:${searchableField!.key}`],
      })
      .expect(201);
    const table = report.body.table as {
      columns: { key: string; label: string }[];
      rows: Record<string, unknown>[];
    };
    expect(table.columns.map((column) => column.key)).toContain(`custom:${searchableField!.key}`);
    expect(table.rows[0][`custom:${searchableField!.key}`]).toBe('ZX-SEARCH-77');

    // ستون غیرقابل گزارش نادیده گرفته می‌شود
    const hiddenReport = await request(http)
      .post('/api/reports/run')
      .set(bearer(adminToken))
      .send({
        charts: [{ id: 'status', dimension: 'status', metric: 'count', chartType: 'bar' }],
        tableColumns: [`custom:${hiddenField!.key}`],
      })
      .expect(201);
    expect((hiddenReport.body.table as { columns: unknown[] }).columns).toHaveLength(0);
  });

  it('پشتیبان رمزنگاری‌شده ساخته می‌شود و بازیابی تنظیمات کار می‌کند', async () => {
    await request(http)
      .patch('/api/settings')
      .set(bearer(adminToken))
      .send({
        backupEncrypt: true,
        backupIncludeSettings: true,
        backupIncludeFiles: false,
        backupRetentionCount: 5,
        workshopName: 'تعمیرگاه مرحله پنج',
      })
      .expect(200);

    const created = await request(http)
      .post('/api/backups')
      .set(bearer(adminToken))
      .send({})
      .expect(201);
    expect(created.body.encrypted).toBe(true);
    expect(created.body.includesSettings).toBe(true);
    const bundlePath = path.join(process.env.BACKUP_DIR!, created.body.name as string);
    expect(fs.existsSync(path.join(bundlePath, 'manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(bundlePath, 'database.dump.enc'))).toBe(true);
    expect(fs.existsSync(path.join(bundlePath, 'settings.json.enc'))).toBe(true);
    expect(fs.existsSync(path.join(bundlePath, 'database.dump'))).toBe(false);

    const manifest = JSON.parse(
      fs.readFileSync(path.join(bundlePath, 'manifest.json'), 'utf8'),
    ) as { encrypted: boolean; database: { name: string; iv: string; tag: string } };
    expect(manifest.encrypted).toBe(true);
    expect(manifest.database.name).toBe('database.dump.enc');
    expect(manifest.database.iv).toBeTruthy();
    expect(manifest.database.tag).toBeTruthy();

    await request(http)
      .get(`/api/backups/${created.body.name as string}/download`)
      .set(bearer(adminToken))
      .expect(409);

    const status = await request(http).get('/api/backups').set(bearer(adminToken)).expect(200);
    expect(status.body.status.encryptionAvailable).toBe(true);
    expect(status.body.status.pgRestoreAvailable).toBe(true);
    expect(status.body.status.lastSuccessName).toBe(created.body.name);
    expect(status.body.runs[0].status).toBe('success');
    expect(status.body.runs[0].trigger).toBe('manual');

    await request(http)
      .patch('/api/settings')
      .set(bearer(adminToken))
      .send({ workshopName: 'نام موقت برای بازیابی' })
      .expect(200);

    const restored = await request(http)
      .post(`/api/backups/${created.body.name as string}/restore`)
      .set(bearer(adminToken))
      .send({
        confirmName: created.body.name,
        restoreDatabase: false,
        restoreSettings: true,
        restoreFiles: false,
      })
      .expect(201);
    expect(restored.body.settingsRestored).toBe(true);
    expect(restored.body.database).toBe(false);
    expect(restored.body.safetyBackup).toBeTruthy();
    expect(fs.existsSync(path.join(process.env.BACKUP_DIR!, restored.body.safetyBackup as string))).toBe(
      true,
    );

    const settings = await request(http)
      .get('/api/settings')
      .set(bearer(adminToken))
      .expect(200);
    expect(settings.body.workshop.name).toBe('تعمیرگاه مرحله پنج');

    const audit = await request(http)
      .get('/api/audit-logs?action=backup.restored')
      .set(bearer(adminToken))
      .expect(200);
    expect(audit.body.total).toBeGreaterThanOrEqual(1);

    await request(http)
      .post(`/api/backups/${created.body.name as string}/restore`)
      .set(bearer(adminToken))
      .send({ confirmName: 'نام نادرست' })
      .expect(400);
  });

  it('بازیابی پایگاه داده ابزار pg_restore را با پارامترهای ایمن اجرا می‌کند', async () => {
    const list = await request(http).get('/api/backups').set(bearer(adminToken)).expect(200);
    const bundle = (list.body.items as { name: string }[]).find((item) => !item.name.endsWith('.dump'))!;
    expect(bundle).toBeTruthy();

    const restored = await request(http)
      .post(`/api/backups/${bundle.name}/restore`)
      .set(bearer(adminToken))
      .send({ confirmName: bundle.name, restoreDatabase: true, restoreSettings: false })
      .expect(201);
    expect(restored.body.database).toBe(true);

    const argsFile = path.join(path.dirname(process.env.PG_RESTORE_PATH!), 'pg_restore.args');
    const args = fs.readFileSync(argsFile, 'utf8');
    expect(args).toContain('--single-transaction');
    expect(args).toContain('--clean');
    expect(args).toContain('--if-exists');
  });

  it('پشتیبان خودکار در ساعت مقرر یک نسخه در روز می‌سازد', async () => {
    await request(http)
      .patch('/api/settings')
      .set(bearer(adminToken))
      .send({
        backupScheduleEnabled: true,
        backupScheduleTime: localClock(),
        timezone: 'Asia/Tehran',
      })
      .expect(200);

    const service = app.get(BackupsService);
    await service.scheduledTick();

    const afterFirst = await request(http)
      .get('/api/backups')
      .set(bearer(adminToken))
      .expect(200);
    const scheduled = (afterFirst.body.runs as { trigger: string; status: string }[]).filter(
      (run) => run.trigger === 'scheduled',
    );
    expect(scheduled.length).toBe(1);
    expect(scheduled[0].status).toBe('success');

    await service.scheduledTick();
    const afterSecond = await request(http)
      .get('/api/backups')
      .set(bearer(adminToken))
      .expect(200);
    expect(
      (afterSecond.body.runs as { trigger: string }[]).filter((run) => run.trigger === 'scheduled'),
    ).toHaveLength(1);

    await request(http)
      .patch('/api/settings')
      .set(bearer(adminToken))
      .send({ backupScheduleEnabled: false })
      .expect(200);
  });

  it('نگهداری نسخه‌ها و هشدار شکست پشتیبان‌گیری ثبت می‌شود', async () => {
    await request(http)
      .patch('/api/settings')
      .set(bearer(adminToken))
      .send({ backupRetentionCount: 2 })
      .expect(200);

    for (let index = 0; index < 3; index += 1) {
      await request(http).post('/api/backups').set(bearer(adminToken)).send({}).expect(201);
    }
    const afterRetention = await request(http)
      .get('/api/backups')
      .set(bearer(adminToken))
      .expect(200);
    expect(
      (afterRetention.body.items as { legacy: boolean }[]).filter((item) => !item.legacy),
    ).toHaveLength(2);

    const blocker = path.join(process.env.BACKUP_DIR!, 'not-a-directory');
    fs.writeFileSync(blocker, 'blocker');
    await request(http)
      .patch('/api/settings')
      .set(bearer(adminToken))
      .send({ backupDirectory: blocker })
      .expect(200);

    await request(http).post('/api/backups').set(bearer(adminToken)).send({}).expect(500);

    const failedStatus = await request(http)
      .get('/api/backups')
      .set(bearer(adminToken))
      .expect(200);
    expect(failedStatus.body.status.lastFailureAt).toBeTruthy();
    expect(failedStatus.body.status.lastFailureMessage).toBeTruthy();
    expect(failedStatus.body.runs[0].status).toBe('failed');

    await request(http)
      .patch('/api/settings')
      .set(bearer(adminToken))
      .send({ backupDirectory: '', backupRetentionCount: 5 })
      .expect(200);
    fs.rmSync(blocker, { force: true });
  });

  it('دسترسی پشتیبان‌گیری فقط برای دارندگان مجوز است', async () => {
    const roles = await request(http)
      .get('/api/users/role-options')
      .set(bearer(adminToken))
      .expect(200);
    const technicianRole = (roles.body as RoleOption[]).find((role) => role.key === 'technician')!;

    await request(http)
      .post('/api/users')
      .set(bearer(adminToken))
      .send({
        username: 'backup_limited',
        fullName: 'کاربر محدود پشتیبان',
        roleId: technicianRole.id,
        password: 'LimitedPass123',
      })
      .expect(201);

    const session = await login(app, 'backup_limited', 'LimitedPass123');
    await request(http)
      .post('/api/auth/change-password')
      .set(bearer(session.accessToken))
      .send({ currentPassword: 'LimitedPass123', newPassword: 'LimitedNew123' })
      .expect(200);
    const relogin = await login(app, 'backup_limited', 'LimitedNew123');

    await request(http)
      .get('/api/backups')
      .set(bearer(relogin.accessToken))
      .expect(403);
    await request(http)
      .post('/api/backups')
      .set(bearer(relogin.accessToken))
      .send({})
      .expect(403);
    await request(http)
      .patch('/api/settings')
      .set(bearer(relogin.accessToken))
      .send({ theme: 'dark' })
      .expect(403);
  });
});
