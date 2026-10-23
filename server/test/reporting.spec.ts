import type { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { toGregorian, toJalaali } from 'jalaali-js';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service';
import {
  jalaliMonthLabel,
  toPersianDigits,
} from '../src/common/utils/jalali';
import {
  ADMIN,
  bearer,
  createTestApp,
  httpServer,
  login,
  resetDatabase,
  setupAdmin,
} from './helpers';

interface RoleOption {
  id: string;
  key: string;
}

interface DeviceResponse {
  id: string;
  intakeCode: string;
  status: { key: string };
}

interface ChartResponse {
  id: string;
  title: string;
  chartType: string;
  categories: string[];
  series: { name: string; data: number[] }[];
  total: number;
}

interface DashboardResponse {
  stats: {
    totalEquipment: number;
    receivedToday: number;
    inProgress: number;
    done: number;
    failed: number;
    ready: number;
    delivered: number;
    customers: number;
  };
  charts: Record<string, ChartResponse>;
  recentDevices: { rows: Record<string, unknown>[] };
}

interface ReportRunResponse {
  charts: ChartResponse[];
  table: {
    columns: { key: string; label: string; type: string }[];
    rows: Record<string, string | number | null>[];
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function binaryParser(response: any, callback: any): void {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
  response.on('error', (error: Error) => callback(error));
}

function isoFor(jy: number, jm: number, jd: number): string {
  const g = toGregorian(jy, jm, jd);
  return new Date(Date.UTC(g.gy, g.gm - 1, g.gd, 12, 0, 0)).toISOString();
}

function jalaliOf(iso: string): { jy: number; jm: number; jd: number } {
  const date = new Date(iso);
  return toJalaali(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

describe('داشبورد تحلیلی و گزارش‌گیری پیشرفته (مرحله ۴)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof httpServer>;
  let adminToken = '';
  let adminId = '';
  const now = new Date();
  const current = toJalaali(now);
  const previousMonth = shiftMonth(current.jy, current.jm, -1);
  const twoMonthsAgo = shiftMonth(current.jy, current.jm, -2);
  const previousYear = current.jy - 1;

  let customerId = '';
  let secondCustomerId = '';
  const devices: Record<string, DeviceResponse> = {};

  function devicePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      customerId,
      broughtByName: 'علی رضایی',
      broughtByJob: 'دانشجو',
      broughtByPhone: '09121112233',
      equipmentType: 'mobile',
      manufacturer: 'samsung',
      model: 'Galaxy A54',
      serialNumber: '',
      imei1: '',
      imei2: '',
      reportedProblem: 'صفحه نمایش شکسته است.',
      accessories: [],
      lockStatus: 'unlocked',
      ...overrides,
    };
  }

  async function createDevice(overrides: Record<string, unknown> = {}): Promise<DeviceResponse> {
    const response = await request(http)
      .post('/api/devices')
      .set(bearer(adminToken))
      .send(devicePayload(overrides))
      .expect(201);
    return response.body as DeviceResponse;
  }

  async function setDeliveredAt(deviceId: string, deliveredAt: string): Promise<void> {
    const db = app.get(DatabaseService);
    await db.query('UPDATE devices SET delivered_at = $2 WHERE id = $1', [deviceId, deliveredAt]);
  }

  beforeAll(async () => {
    await resetDatabase();
    app = await createTestApp();
    http = httpServer(app);
    await setupAdmin(app);
    const session = await login(app, ADMIN.username, ADMIN.password);
    adminToken = session.accessToken;
    adminId = session.userId;

    const customer = await request(http)
      .post('/api/customers')
      .set(bearer(adminToken))
      .send({ fullName: 'سارا احمدی', phone: '09351234567', jobTitle: 'کارمند' })
      .expect(201);
    customerId = customer.body.id;

    const secondCustomer = await request(http)
      .post('/api/customers')
      .set(bearer(adminToken))
      .send({ fullName: 'رضا کریمی', phone: '09361234567', jobTitle: 'آزاد' })
      .expect(201);
    secondCustomerId = secondCustomer.body.id;

    devices.mobileInProgress = await createDevice({
      receivedAt: isoFor(current.jy, current.jm, 5),
      technicianId: adminId,
      broughtByJob: 'دانشجو',
    });
    await request(http)
      .patch(`/api/devices/${devices.mobileInProgress.id}/status`)
      .set(bearer(adminToken))
      .send({ status: 'in_progress' })
      .expect(200);
    await request(http)
      .post(`/api/devices/${devices.mobileInProgress.id}/operations`)
      .set(bearer(adminToken))
      .send({ operationType: 'backup', title: 'بکاپ کامل', result: 'success' })
      .expect(201);

    devices.laptopDelivered = await createDevice({
      equipmentType: 'laptop',
      manufacturer: 'hp',
      model: 'ProBook 450',
      receivedAt: isoFor(previousMonth.year, previousMonth.month, 15),
      broughtByJob: 'کارمند',
    });
    await request(http)
      .patch(`/api/devices/${devices.laptopDelivered.id}/status`)
      .set(bearer(adminToken))
      .send({ status: 'delivered' })
      .expect(200);
    await setDeliveredAt(
      devices.laptopDelivered.id,
      isoFor(previousMonth.year, previousMonth.month, 20),
    );

    devices.mobileFailed = await createDevice({
      manufacturer: 'apple',
      model: 'iPhone 12',
      receivedAt: isoFor(current.jy, current.jm, 6),
      broughtByJob: 'آزاد',
      imei1: '111111111111111',
    });
    await request(http)
      .patch(`/api/devices/${devices.mobileFailed.id}/status`)
      .set(bearer(adminToken))
      .send({ status: 'failed', note: 'برد سوخته' })
      .expect(200);

    devices.mobileReady = await createDevice({
      receivedAt: isoFor(current.jy, current.jm, 7),
      broughtByJob: 'دانشجو',
      model: 'Galaxy S23',
      imei1: '222222222222222',
    });
    await request(http)
      .patch(`/api/devices/${devices.mobileReady.id}/status`)
      .set(bearer(adminToken))
      .send({ status: 'ready_delivery' })
      .expect(200);
    await request(http)
      .post(`/api/devices/${devices.mobileReady.id}/operations`)
      .set(bearer(adminToken))
      .send({ operationType: 'data_recovery', title: 'ریکاوری اطلاعات', result: 'success' })
      .expect(201);

    devices.hddDone = await createDevice({
      equipmentType: 'hdd',
      manufacturer: 'western_digital',
      model: 'WD Blue 1TB',
      receivedAt: isoFor(twoMonthsAgo.year, twoMonthsAgo.month, 10),
      broughtByJob: 'بازنشسته',
    });
    await request(http)
      .patch(`/api/devices/${devices.hddDone.id}/status`)
      .set(bearer(adminToken))
      .send({ status: 'done' })
      .expect(200);

    devices.nvrToday = await createDevice({
      equipmentType: 'nvr',
      manufacturer: '',
      model: 'NVR-8CH',
      receivedAt: now.toISOString(),
      broughtByJob: '',
      imei1: '',
    });

    devices.laptopDelivered2 = await createDevice({
      equipmentType: 'laptop',
      manufacturer: 'lenovo',
      model: 'ThinkPad E15',
      receivedAt: isoFor(current.jy, current.jm, 8),
      broughtByJob: 'کارمند',
      imei1: '',
    });
    await request(http)
      .patch(`/api/devices/${devices.laptopDelivered2.id}/status`)
      .set(bearer(adminToken))
      .send({ status: 'delivered' })
      .expect(200);
    await setDeliveredAt(
      devices.laptopDelivered2.id,
      isoFor(current.jy, current.jm, 9),
    );

    devices.mobileOld = await createDevice({
      customerId: secondCustomerId,
      receivedAt: isoFor(previousYear, 5, 10),
      broughtByJob: 'دانشجو',
      model: 'Galaxy A34',
      imei1: '333333333333333',
    });
    await request(http)
      .patch(`/api/devices/${devices.mobileOld.id}/status`)
      .set(bearer(adminToken))
      .send({ status: 'in_progress' })
      .expect(200);

    devices.flashCancelled = await createDevice({
      equipmentType: 'flash',
      manufacturer: 'sandisk',
      model: 'Cruzer 32GB',
      receivedAt: isoFor(current.jy, current.jm, 9),
      broughtByJob: 'دانشجو',
    });
    await request(http)
      .patch(`/api/devices/${devices.flashCancelled.id}/status`)
      .set(bearer(adminToken))
      .send({ status: 'cancelled' })
      .expect(200);
  }, 90_000);

  afterAll(async () => {
    await app.close();
  });

  it('آمار کارت‌های داشبورد از داده واقعی و وضعیت‌های ثبت‌شده محاسبه می‌شود', async () => {
    const response = await request(http)
      .get('/api/analytics/dashboard')
      .set(bearer(adminToken))
      .expect(200);
    const data = response.body as DashboardResponse;

    expect(data.stats.totalEquipment).toBe(9);
    expect(data.stats.inProgress).toBe(3); // دو پرونده در حال انجام + یک پرونده دریافت‌شده
    expect(data.stats.done).toBe(1);
    expect(data.stats.failed).toBe(1);
    expect(data.stats.ready).toBe(1);
    expect(data.stats.delivered).toBe(2);
    expect(data.stats.customers).toBe(2);
    expect(data.stats.receivedToday).toBeGreaterThanOrEqual(1);
    expect(data.recentDevices.rows.length).toBe(5);
  });

  it('نمودار توزیع نوع تجهیز و سازنده درصد و تعداد صحیح برمی‌گرداند', async () => {
    const response = await request(http)
      .get('/api/analytics/dashboard')
      .set(bearer(adminToken))
      .expect(200);
    const charts = (response.body as DashboardResponse).charts;

    const mobileIndex = charts.equipmentTypes.categories.indexOf('موبایل');
    expect(mobileIndex).toBeGreaterThanOrEqual(0);
    expect(charts.equipmentTypes.series[0].data[mobileIndex]).toBe(4);
    expect(charts.equipmentTypes.total).toBe(9);

    const laptopIndex = charts.equipmentTypes.categories.indexOf('لپ‌تاپ');
    expect(charts.equipmentTypes.series[0].data[laptopIndex]).toBe(2);

    const samsungIndex = charts.manufacturers.categories.indexOf('سامسونگ');
    expect(charts.manufacturers.series[0].data[samsungIndex]).toBe(3);
    expect(charts.manufacturers.categories).toContain('نامشخص');
  });

  it('روند ماهانه شمسی، تحویل‌ها و مقایسه سالانه را دقیق گروه‌بندی می‌کند', async () => {
    const response = await request(http)
      .get('/api/analytics/dashboard')
      .set(bearer(adminToken))
      .expect(200);
    const charts = (response.body as DashboardResponse).charts;
    const currentLabel = jalaliMonthLabel(
      `${current.jy}-${String(current.jm).padStart(2, '0')}`,
    );
    const previousLabel = jalaliMonthLabel(
      `${previousMonth.year}-${String(previousMonth.month).padStart(2, '0')}`,
    );

    const currentIndex = charts.monthlyTrend.categories.indexOf(currentLabel);
    expect(currentIndex).toBeGreaterThanOrEqual(0);
    expect(charts.monthlyTrend.series[0].data[currentIndex]).toBe(6);
    expect(charts.monthlyTrend.series[1].data[currentIndex]).toBe(1);

    const previousIndex = charts.monthlyTrend.categories.indexOf(previousLabel);
    expect(charts.monthlyTrend.series[0].data[previousIndex]).toBe(1);
    expect(charts.monthlyTrend.series[1].data[previousIndex]).toBe(1);

    const currentYearLabel = toPersianDigits(current.jy);
    const previousYearLabel = toPersianDigits(previousYear);
    const currentYearIndex = charts.yearly.categories.indexOf(currentYearLabel);
    const previousYearIndex = charts.yearly.categories.indexOf(previousYearLabel);
    expect(currentYearIndex).toBeGreaterThanOrEqual(0);
    expect(previousYearIndex).toBeGreaterThanOrEqual(0);
    expect(charts.yearly.series[0].data[currentYearIndex]).toBe(8);
    expect(charts.yearly.series[0].data[previousYearIndex]).toBe(1);
  });

  it('فیلترهای ترکیبی روی کارت‌ها و نمودارها یکپارچه اعمال می‌شوند', async () => {
    const params = new URLSearchParams({
      equipmentType: 'mobile',
      manufacturer: 'samsung',
      job: 'دانشجو',
      status: 'in_progress',
      year: String(current.jy),
      month: String(current.jm),
      technicianId: adminId,
      operationType: 'backup',
    });
    const response = await request(http)
      .get(`/api/analytics/dashboard?${params.toString()}`)
      .set(bearer(adminToken))
      .expect(200);
    const data = response.body as DashboardResponse;
    expect(data.stats.totalEquipment).toBe(1);
    expect(data.stats.inProgress).toBe(1);
    expect(data.stats.customers).toBe(1);
    expect(data.charts.equipmentTypes.total).toBe(1);
    expect(data.charts.equipmentTypes.categories).toEqual(['موبایل']);

    const unknownBrand = await request(http)
      .get('/api/analytics/dashboard?manufacturer=__unknown__')
      .set(bearer(adminToken))
      .expect(200);
    expect((unknownBrand.body as DashboardResponse).stats.totalEquipment).toBe(1);

    const dateRange = await request(http)
      .get(
        `/api/analytics/dashboard?from=${encodeURIComponent(
          isoFor(current.jy, current.jm, 5),
        )}&to=${encodeURIComponent(isoFor(current.jy, current.jm, 8))}`,
      )
      .set(bearer(adminToken))
      .expect(200);
    expect((dateRange.body as DashboardResponse).stats.totalEquipment).toBe(3);
  });

  it('گزارش پیشرفته چندنموداری، جدول داده و انواع نمودار را برمی‌گرداند', async () => {
    const response = await request(http)
      .post('/api/reports/run')
      .set(bearer(adminToken))
      .send({
        year: current.jy,
        charts: [
          { id: 'c1', dimension: 'equipmentType', metric: 'count', chartType: 'bar' },
          { id: 'c2', dimension: 'manufacturer', metric: 'count', chartType: 'doughnut' },
          { id: 'c3', dimension: 'month', metric: 'count', chartType: 'line' },
          { id: 'c4', dimension: 'equipmentType', metric: 'count', chartType: 'stackedBar' },
          { id: 'c5', dimension: 'year', metric: 'count', chartType: 'combo' },
          { id: 'c6', dimension: 'operationType', metric: 'count', chartType: 'pie' },
          { id: 'c7', dimension: 'job', metric: 'count', chartType: 'area' },
          { id: 'c8', dimension: 'status', metric: 'failed', chartType: 'bar' },
        ],
        tableColumns: ['intakeCode', 'ownerName', 'status', 'receivedAt', 'operationCount'],
        tableLimit: 100,
      })
      .expect(201);

    const data = response.body as ReportRunResponse;
    expect(data.charts).toHaveLength(8);
    expect(data.charts[0].series[0].data[0]).toBeGreaterThan(0);
    expect(data.charts[3].series.length).toBeGreaterThan(1);
    expect(data.charts[4].series).toHaveLength(2);
    expect(data.charts[5].categories).toContain('بکاپ گرفتن');
    expect(data.table.columns.map((column) => column.key)).toEqual([
      'intakeCode',
      'ownerName',
      'status',
      'receivedAt',
      'operationCount',
    ]);
    expect(data.table.rows.length).toBeGreaterThan(0);
    expect(String(data.table.rows[0].status)).toMatch(/[\u0600-\u06FF]/);
    expect(String(data.table.rows[0].receivedAt)).toMatch(/T/);
  });

  it('قالب گزارش ذخیره، ویرایش، اجرای مجدد و حذف می‌شود', async () => {
    const config = {
      year: current.jy,
      charts: [{ id: 'saved-1', dimension: 'manufacturer', metric: 'count', chartType: 'bar' }],
      tableColumns: ['intakeCode', 'ownerName'],
    };

    const created = await request(http)
      .post('/api/reports/saved')
      .set(bearer(adminToken))
      .send({
        name: 'گزارش برندهای سال جاری',
        description: 'تست قالب',
        isShared: true,
        config,
      })
      .expect(201);
    expect(created.body.id).toBeTruthy();
    expect(created.body.version).toBe(1);

    const list = await request(http)
      .get('/api/reports/saved')
      .set(bearer(adminToken))
      .expect(200);
    expect(list.body.some((item: { id: string }) => item.id === created.body.id)).toBe(true);

    const run = await request(http)
      .post(`/api/reports/saved/${created.body.id}/run`)
      .set(bearer(adminToken))
      .expect(201);
    expect((run.body as ReportRunResponse).charts).toHaveLength(1);

    const updated = await request(http)
      .patch(`/api/reports/saved/${created.body.id}`)
      .set(bearer(adminToken))
      .send({ name: 'گزارش برندها', version: 1 })
      .expect(200);
    expect(updated.body.version).toBe(2);

    await request(http)
      .patch(`/api/reports/saved/${created.body.id}`)
      .set(bearer(adminToken))
      .send({ name: 'ویرایش قدیمی', version: 1 })
      .expect(409);

    await request(http)
      .delete(`/api/reports/saved/${created.body.id}`)
      .set(bearer(adminToken))
      .expect(200);

    await request(http)
      .post(`/api/reports/saved/${created.body.id}/run`)
      .set(bearer(adminToken))
      .expect(404);
  });

  it('خروجی Excel و CSV با تاریخ شمسی و ستون‌های انتخابی ساخته می‌شود', async () => {
    const config = {
      charts: [{ id: 'export-1', dimension: 'equipmentType', metric: 'count', chartType: 'bar' }],
      tableColumns: ['intakeCode', 'ownerName', 'receivedAt'],
    };

    const excel = await request(http)
      .post('/api/reports/export/excel')
      .set(bearer(adminToken))
      .send(config)
      .buffer(true)
      .parse(binaryParser)
      .expect(201);
    expect(String(excel.headers['content-disposition'])).toContain('attachment');
    const workbook = new ExcelJS.Workbook();
    const bytes = Uint8Array.from(excel.body as Buffer);
    await workbook.xlsx.load(bytes.buffer as ArrayBuffer);
    expect(workbook.getWorksheet('خلاصه گزارش')).toBeTruthy();
    expect(workbook.getWorksheet('داده‌ها')).toBeTruthy();

    const csv = await request(http)
      .post('/api/reports/export/csv')
      .set(bearer(adminToken))
      .send(config)
      .buffer(true)
      .parse(binaryParser)
      .expect(201);
    const text = (csv.body as Buffer).toString('utf8');
    expect(text.startsWith('\uFEFF')).toBe(true);
    expect(text).toContain('کد پذیرش');
    expect(text).toContain('تاریخ پذیرش');
    expect(text).toContain(devices.mobileInProgress.intakeCode);
  });

  it('لوگوی کارگاه ذخیره و در سربرگ گزارش‌ها برگردانده می‌شود', async () => {
    const logo =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    const updated = await request(http)
      .patch('/api/settings')
      .set(bearer(adminToken))
      .send({ workshopLogo: logo })
      .expect(200);
    expect(updated.body.workshop.logo).toBe(logo);

    const dashboard = await request(http)
      .get('/api/analytics/dashboard')
      .set(bearer(adminToken))
      .expect(200);
    expect(dashboard.body.workshop.logo).toBe(logo);

    const report = await request(http)
      .post('/api/reports/run')
      .set(bearer(adminToken))
      .send({ charts: [{ id: 'logo', dimension: 'status', metric: 'count', chartType: 'doughnut' }] })
      .expect(201);
    expect(report.body.workshop.logo).toBe(logo);

    await request(http)
      .patch('/api/settings')
      .set(bearer(adminToken))
      .send({ workshopLogo: 'javascript:alert(1)' })
      .expect(400);
  });

  it('دسترسی گزارش‌ها بر اساس مجوز reports.view کنترل می‌شود', async () => {
    const roles = await request(http)
      .get('/api/users/role-options')
      .set(bearer(adminToken))
      .expect(200);
    const technicianRole = (roles.body as RoleOption[]).find((role) => role.key === 'technician')!;

    await request(http)
      .post('/api/users')
      .set(bearer(adminToken))
      .send({
        username: 'report_limited',
        fullName: 'کاربر گزارش محدود',
        roleId: technicianRole.id,
        password: 'LimitedPass123',
      })
      .expect(201);

    const session = await login(app, 'report_limited', 'LimitedPass123');
    await request(http)
      .post('/api/auth/change-password')
      .set(bearer(session.accessToken))
      .send({ currentPassword: 'LimitedPass123', newPassword: 'LimitedNew123' })
      .expect(200);
    const relogin = await login(app, 'report_limited', 'LimitedNew123');

    await request(http)
      .get('/api/analytics/dashboard')
      .set(bearer(relogin.accessToken))
      .expect(200);
    await request(http)
      .get('/api/reports/options')
      .set(bearer(relogin.accessToken))
      .expect(403);
    await request(http)
      .post('/api/reports/run')
      .set(bearer(relogin.accessToken))
      .send({ charts: [{ id: 'x', dimension: 'equipmentType', metric: 'count', chartType: 'bar' }] })
      .expect(403);
    await request(http)
      .get('/api/reports/saved')
      .set(bearer(relogin.accessToken))
      .expect(403);
  });
});
