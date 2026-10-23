import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ADMIN, bearer, createTestApp, httpServer, login, resetDatabase, setupAdmin } from './helpers';

interface StatusResponse {
  key: string;
  label: string;
  tone: string;
  isActive: boolean;
  isSystem: boolean;
}

describe('وضعیت‌های سفارشی دستگاه و پرونده مشتری (مرحله ۶)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof httpServer>;
  let token = '';
  let customerId = '';
  let deviceId = '';
  let customStatusId = '';
  let customStatusKey = '';

  function devicePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      customerId,
      broughtByName: 'محمد کریمی',
      broughtByPhone: '09120000000',
      equipmentType: 'laptop',
      model: 'IdeaPad 3',
      serialNumber: 'SN-CUSTOM-STATUS-1',
      reportedProblem: 'روشن نمی‌شود و چراغ شارژ چشمک می‌زند.',
      ...overrides,
    };
  }

  beforeAll(async () => {
    await resetDatabase();
    app = await createTestApp();
    http = httpServer(app);
    await setupAdmin(app);
    token = (await login(app, ADMIN.username, ADMIN.password)).accessToken;

    const customer = await request(http)
      .post('/api/customers')
      .set(bearer(token))
      .send({ fullName: 'رضا مرادی', phone: '09121230000', jobTitle: 'آزاد' })
      .expect(201);
    customerId = customer.body.id;

    const device = await request(http)
      .post('/api/devices')
      .set(bearer(token))
      .send(devicePayload())
      .expect(201);
    deviceId = device.body.id;
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('وضعیت‌های پیش‌فرض سامانه در فهرست وضعیت‌ها برچسب پایگاه داده دارند', async () => {
    const statuses = await request(http)
      .get('/api/device-config/statuses')
      .set(bearer(token))
      .expect(200);
    const keys = (statuses.body as StatusResponse[]).map((item) => item.key);
    expect(keys).toContain('received');
    expect(keys).toContain('delivered');
    expect(keys).toHaveLength(12);
    expect((statuses.body as StatusResponse[])[0]).toMatchObject({
      label: 'دریافت شده',
      isSystem: true,
      isActive: true,
    });

    await request(http)
      .post('/api/devices')
      .set(bearer(token))
      .send(devicePayload({ status: 'unknown_status' }))
      .expect(400);
  });

  it('مدیر می‌تواند وضعیت سفارشی جدید تعریف کند', async () => {
    const created = await request(http)
      .post('/api/device-config/options')
      .set(bearer(token))
      .send({ category: 'device_status', labelFa: 'در انتظار قطعه خاص' })
      .expect(201);
    customStatusId = created.body.id;
    customStatusKey = created.body.key;
    expect(customStatusKey).toMatch(/^[a-z_0-9]+$/);
    expect(created.body.isSystem).toBe(false);

    const statuses = await request(http)
      .get('/api/device-config/statuses')
      .set(bearer(token))
      .expect(200);
    const custom = (statuses.body as StatusResponse[]).find((item) => item.key === customStatusKey);
    expect(custom).toMatchObject({ label: 'در انتظار قطعه خاص', tone: 'info', isActive: true });
  });

  it('وضعیت سفارشی در تغییر وضعیت، فیلتر، تاریخچه و گزارش‌ها استفاده می‌شود', async () => {
    const changed = await request(http)
      .patch(`/api/devices/${deviceId}/status`)
      .set(bearer(token))
      .send({ status: customStatusKey, note: 'منتظر قطعه از تأمین‌کننده', version: 1 })
      .expect(200);
    expect(changed.body.status).toMatchObject({
      key: customStatusKey,
      label: 'در انتظار قطعه خاص',
    });
    expect(changed.body.statusHistory[0].toStatus.label).toBe('در انتظار قطعه خاص');

    const filtered = await request(http)
      .get(`/api/devices?status=${customStatusKey}`)
      .set(bearer(token))
      .expect(200);
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.items[0].status.label).toBe('در انتظار قطعه خاص');

    const options = await request(http)
      .get('/api/reports/options')
      .set(bearer(token))
      .expect(200);
    expect(options.body.statuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: customStatusKey, label: 'در انتظار قطعه خاص' }),
      ]),
    );

    const dashboard = await request(http)
      .get(`/api/analytics/dashboard?status=${customStatusKey}`)
      .set(bearer(token))
      .expect(200);
    expect(dashboard.body.stats.totalEquipment).toBe(1);
    expect(dashboard.body.charts.statuses.categories).toContain('در انتظار قطعه خاص');

    const report = await request(http)
      .post('/api/reports/run')
      .set(bearer(token))
      .send({
        status: customStatusKey,
        charts: [
          { id: 'by-status', dimension: 'status', metric: 'count', chartType: 'bar' },
        ],
        tableColumns: ['intakeCode', 'status'],
      })
      .expect(201);
    expect(report.body.charts[0].categories).toContain('در انتظار قطعه خاص');
    expect(report.body.table.rows[0].status).toBe('در انتظار قطعه خاص');
  });

  it('وضعیت سفارشی استفاده‌شده قابل حذف نیست و غیرفعال‌سازی آن مانع انتخاب می‌شود', async () => {
    await request(http)
      .delete(`/api/device-config/options/${customStatusId}`)
      .set(bearer(token))
      .expect(409);

    await request(http)
      .patch(`/api/device-config/options/${customStatusId}`)
      .set(bearer(token))
      .send({ isActive: false })
      .expect(200);

    const statuses = await request(http)
      .get('/api/device-config/statuses')
      .set(bearer(token))
      .expect(200);
    expect((statuses.body as StatusResponse[]).some((item) => item.key === customStatusKey)).toBe(
      false,
    );

    await request(http)
      .patch(`/api/devices/${deviceId}/status`)
      .set(bearer(token))
      .send({ status: customStatusKey, version: 2 })
      .expect(400);

    await request(http)
      .patch(`/api/device-config/options/${customStatusId}`)
      .set(bearer(token))
      .send({ isActive: true })
      .expect(200);
  });

  it('وضعیت‌های پیش‌فرض غیرفعال نمی‌شوند اما عنوانشان قابل ویرایش است', async () => {
    const config = await request(http)
      .get('/api/device-config')
      .set(bearer(token))
      .expect(200);
    const systemStatus = (config.body.options.device_status as Array<StatusResponse & { id: string }>)
      .find((item) => item.key === 'received');
    expect(systemStatus).toBeTruthy();

    await request(http)
      .patch(`/api/device-config/options/${systemStatus!.id}`)
      .set(bearer(token))
      .send({ isActive: false })
      .expect(409);

    const renamed = await request(http)
      .patch(`/api/device-config/options/${systemStatus!.id}`)
      .set(bearer(token))
      .send({ labelFa: 'پذیرش شده' })
      .expect(200);
    expect(renamed.body.label).toBe('پذیرش شده');

    const renamedStatuses = await request(http)
      .get('/api/device-config/statuses')
      .set(bearer(token))
      .expect(200);
    expect(
      (renamedStatuses.body as StatusResponse[]).find((item) => item.key === 'received')?.label,
    ).toBe('پذیرش شده');

    await request(http)
      .patch(`/api/device-config/options/${systemStatus!.id}`)
      .set(bearer(token))
      .send({ labelFa: 'دریافت شده' })
      .expect(200);
  });

  it('سوابق تمام دستگاه‌های مشتری از پرونده مشتری قابل دریافت است', async () => {
    const devices = await request(http)
      .get(`/api/customers/${customerId}/devices`)
      .set(bearer(token))
      .expect(200);
    expect(devices.body).toHaveLength(1);
    expect(devices.body[0]).toMatchObject({
      id: deviceId,
      equipmentType: 'لپ‌تاپ',
      status: { key: customStatusKey, label: 'در انتظار قطعه خاص' },
    });
    expect(typeof devices.body[0].receivedAt).toBe('string');

    await request(http)
      .get('/api/customers/00000000-0000-4000-8000-000000000000/devices')
      .set(bearer(token))
      .expect(404);
  });

  it('تغییر وضعیت به تحویل داده شده زمان تحویل واقعی را ثبت می‌کند', async () => {
    const delivered = await request(http)
      .patch(`/api/devices/${deviceId}/status`)
      .set(bearer(token))
      .send({ status: 'delivered', note: 'تحویل حضوری به مشتری', version: 2 })
      .expect(200);
    expect(delivered.body.status).toMatchObject({ key: 'delivered', label: 'تحویل داده شده' });
    expect(typeof delivered.body.deliveredAt).toBe('string');
    expect(delivered.body.statusHistory[0].toStatus.key).toBe('delivered');

    const dashboard = await request(http)
      .get('/api/analytics/dashboard?status=delivered')
      .set(bearer(token))
      .expect(200);
    expect(dashboard.body.stats.delivered).toBe(1);

    const customerDevices = await request(http)
      .get(`/api/customers/${customerId}/devices`)
      .set(bearer(token))
      .expect(200);
    expect(customerDevices.body[0].deliveredAt).toBe(delivered.body.deliveredAt);
  });
});
