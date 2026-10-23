import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service';
import { ADMIN, bearer, createTestApp, httpServer, login, resetDatabase, setupAdmin } from './helpers';

interface RoleOption {
  id: string;
  key: string;
  nameFa: string;
}

interface DeviceResponse {
  id: string;
  intakeCode: string;
  status: { key: string; label: string };
  version: number;
  hasPassword: boolean;
  owner: { id: string; fullName: string };
  operations: Array<{ id: string; title: string; version: number }>;
  files: Array<{ id: string; label: string; isPrimary: boolean }>;
  technicianNotes: Array<{ id: string; body: string }>;
  images: Array<{ id: string; originalName: string }>;
  statusHistory: Array<{
    toStatus: { key: string; label: string };
    note: string | null;
    changedByName: string | null;
  }>;
  customFields: Record<string, unknown>;
}

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function binaryParser(response: any, callback: any): void {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
  response.on('error', (error: Error) => callback(error));
}

describe('مدیریت تجهیزات، پذیرش و پرونده دیجیتال (مرحله ۲)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof httpServer>;
  let adminToken = '';
  let customerId = '';
  let deviceId = '';
  let deviceCode = '';
  let secondDeviceId = '';
  let secondDeviceCode = '';

  function devicePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      customerId,
      broughtByName: 'علی رضایی',
      broughtByJob: 'دانشجو',
      broughtByPhone: '09121112233',
      equipmentType: 'mobile',
      manufacturer: 'samsung',
      model: 'Galaxy A54',
      serialNumber: 'SN-2026-0001',
      imei1: '356789012345678',
      imei2: '',
      reportedProblem: 'صفحه نمایش شکسته است و لمس کار نمی‌کند.',
      physicalCondition: 'خط و خش روی قاب',
      accessories: ['charger', 'sim'],
      lockStatus: 'pin',
      devicePassword: '4837',
      notes: 'تحویل حضوری',
      ...overrides,
    };
  }

  beforeAll(async () => {
    await resetDatabase();
    app = await createTestApp();
    http = httpServer(app);
    await setupAdmin(app);
    adminToken = (await login(app, ADMIN.username, ADMIN.password)).accessToken;

    const customer = await request(http)
      .post('/api/customers')
      .set(bearer(adminToken))
      .send({
        fullName: 'سارا احمدی',
        phone: '09351234567',
        jobTitle: 'کارمند',
        notes: 'مشتری قدیمی',
      })
      .expect(201);
    customerId = customer.body.id;
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('مشتری ثبت، جستجو و ویرایش می‌شود', async () => {
    const list = await request(http)
      .get('/api/customers?search=سارا')
      .set(bearer(adminToken))
      .expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].phone).toBe('09351234567');

    const updated = await request(http)
      .patch(`/api/customers/${customerId}`)
      .set(bearer(adminToken))
      .send({ fullName: 'سارا احمدی نژاد', jobTitle: 'کارمند بانک', version: 1 })
      .expect(200);
    expect(updated.body.fullName).toBe('سارا احمدی نژاد');
    expect(updated.body.version).toBe(2);

    await request(http)
      .patch(`/api/customers/${customerId}`)
      .set(bearer(adminToken))
      .send({ fullName: 'ویرایش قدیمی', version: 1 })
      .expect(409);
  });

  it('پذیرش دستگاه کد یکتا، وضعیت اولیه و پرونده کامل می‌سازد', async () => {
    const response = await request(http)
      .post('/api/devices')
      .set(bearer(adminToken))
      .send(devicePayload())
      .expect(201);

    const device = response.body as DeviceResponse;
    deviceId = device.id;
    deviceCode = device.intakeCode;

    expect(deviceCode).toMatch(/^MR-\d{4}-0001$/);
    expect(device.status.key).toBe('received');
    expect(device.owner.fullName).toBe('سارا احمدی نژاد');
    expect(device.hasPassword).toBe(true);
    expect(device.version).toBe(1);
    expect(device.statusHistory).toHaveLength(1);
    expect(device.statusHistory[0].changedByName).toBe(ADMIN.fullName);
    expect((device as unknown as Record<string, unknown>).device_password_cipher).toBeUndefined();
  });

  it('رمز دستگاه فقط به‌صورت رمزنگاری‌شده ذخیره و با ثبت تاریخچه آشکار می‌شود', async () => {
    const db = app.get(DatabaseService);
    const rows = await db.query<{ device_password_cipher: string | null }>(
      'SELECT device_password_cipher FROM devices WHERE id = $1',
      [deviceId],
    );
    expect(rows[0].device_password_cipher).toBeTruthy();
    expect(rows[0].device_password_cipher).not.toContain('4837');

    const revealed = await request(http)
      .get(`/api/devices/${deviceId}/password`)
      .set(bearer(adminToken))
      .expect(200);
    expect(revealed.body.password).toBe('4837');

    const audit = await request(http)
      .get('/api/audit-logs?action=device.password_viewed')
      .set(bearer(adminToken))
      .expect(200);
    expect(audit.body.total).toBeGreaterThanOrEqual(1);
  });

  it('IMEI تکراری هشدار می‌دهد و با تأیید کاربر پرونده جدید ثبت می‌شود', async () => {
    const duplicate = await request(http)
      .post('/api/devices')
      .set(bearer(adminToken))
      .send(devicePayload({ model: 'گوشی تکراری', serialNumber: '' }))
      .expect(409);
    expect(duplicate.body.code).toBe('DEVICE_DUPLICATE');
    expect(
      (duplicate.body.details.duplicates as Array<{ intakeCode: string }>).some(
        (item) => item.intakeCode === deviceCode,
      ),
    ).toBe(true);

    const check = await request(http)
      .get('/api/devices/duplicates?imei1=356789012345678')
      .set(bearer(adminToken))
      .expect(200);
    expect(check.body).toHaveLength(1);

    const allowed = await request(http)
      .post('/api/devices')
      .set(bearer(adminToken))
      .send(
        devicePayload({
          model: 'بازگشت مجدد دستگاه',
          serialNumber: '',
          allowDuplicate: true,
        }),
      )
      .expect(201);
    expect(allowed.body.intakeCode).not.toBe(deviceCode);
  });

  it('پذیرش هم‌زمان چند کلاینت کد پذیرش تکراری تولید نمی‌کند', async () => {
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        request(http)
          .post('/api/devices')
          .set(bearer(adminToken))
          .send(
            devicePayload({
              model: `دستگاه هم‌زمان ${index + 1}`,
              serialNumber: '',
              imei1: '',
              accessories: [],
            }),
          )
          .expect(201),
      ),
    );
    const codes = responses.map((response) => (response.body as DeviceResponse).intakeCode);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((code) => /^MR-\d{4}-\d{4}$/.test(code))).toBe(true);
  });

  it('جست‌وجوی پیشرفته بر اساس IMEI، سریال، مالک، تلفن و وضعیت کار می‌کند', async () => {
    const byImei = await request(http)
      .get('/api/devices?search=356789012345678')
      .set(bearer(adminToken))
      .expect(200);
    expect(byImei.body.total).toBeGreaterThanOrEqual(2);

    const bySerial = await request(http)
      .get('/api/devices?search=SN-2026-0001')
      .set(bearer(adminToken))
      .expect(200);
    expect(bySerial.body.items[0].intakeCode).toBe(deviceCode);

    const byOwner = await request(http)
      .get('/api/devices?search=سارا')
      .set(bearer(adminToken))
      .expect(200);
    expect(byOwner.body.total).toBeGreaterThanOrEqual(1);

    const byPhone = await request(http)
      .get('/api/devices?search=09351234567')
      .set(bearer(adminToken))
      .expect(200);
    expect(byPhone.body.total).toBeGreaterThanOrEqual(1);

    const byCode = await request(http)
      .get(`/api/devices?search=${encodeURIComponent(deviceCode)}`)
      .set(bearer(adminToken))
      .expect(200);
    expect(byCode.body.items).toHaveLength(1);

    const byStatus = await request(http)
      .get('/api/devices?status=received')
      .set(bearer(adminToken))
      .expect(200);
    expect(byStatus.body.total).toBeGreaterThanOrEqual(7);

    const byEquipment = await request(http)
      .get('/api/devices?equipmentType=mobile&manufacturer=samsung')
      .set(bearer(adminToken))
      .expect(200);
    expect(byEquipment.body.total).toBeGreaterThanOrEqual(1);
  });

  it('تغییر وضعیت با کاربر، زمان و تاریخچه ثبت می‌شود و تداخل نسخه را رد می‌کند', async () => {
    const changed = await request(http)
      .patch(`/api/devices/${deviceId}/status`)
      .set(bearer(adminToken))
      .send({ status: 'in_progress', note: 'شروع تعمیر توسط تکنسین' })
      .expect(200);
    const device = changed.body as DeviceResponse;
    expect(device.status.key).toBe('in_progress');
    expect(device.version).toBe(2);
    expect(device.statusHistory[0].toStatus.key).toBe('in_progress');
    expect(device.statusHistory[0].note).toBe('شروع تعمیر توسط تکنسین');
    expect(device.statusHistory[0].changedByName).toBe(ADMIN.fullName);

    await request(http)
      .patch(`/api/devices/${deviceId}/status`)
      .set(bearer(adminToken))
      .send({ status: 'in_progress' })
      .expect(400);

    await request(http)
      .patch(`/api/devices/${deviceId}/status`)
      .set(bearer(adminToken))
      .send({ status: 'awaiting_part', version: 1 })
      .expect(409);
  });

  it('چند اقدام روی دستگاه ثبت، ویرایش و حذف می‌شود', async () => {
    const backup = await request(http)
      .post(`/api/devices/${deviceId}/operations`)
      .set(bearer(adminToken))
      .send({
        operationType: 'backup',
        title: 'بکاپ کامل اطلاعات',
        description: 'بکاپ روی هارد سرور',
        dataSizeBytes: 1073741824,
        storagePath: '\\\\server\\backups\\a54',
        result: 'success',
      })
      .expect(201);
    expect((backup.body as DeviceResponse).operations).toHaveLength(1);

    const repair = await request(http)
      .post(`/api/devices/${deviceId}/operations`)
      .set(bearer(adminToken))
      .send({
        operationType: 'hardware_repair',
        title: 'تعویض تاچ و ال‌سی‌دی',
        result: 'success',
        deviceStatusAfter: 'done',
      })
      .expect(201);
    const repaired = repair.body as DeviceResponse;
    expect(repaired.operations).toHaveLength(2);
    expect(repaired.operations[0].title).toBe('تعویض تاچ و ال‌سی‌دی');
    expect(repaired.status.key).toBe('done');
    expect(repaired.statusHistory[0].note).toContain('تعویض تاچ و ال‌سی‌دی');

    const operationId = repaired.operations[0].id;
    const updated = await request(http)
      .patch(`/api/devices/${deviceId}/operations/${operationId}`)
      .set(bearer(adminToken))
      .send({
        operationType: 'hardware_repair',
        title: 'تعویض تاچ، ال‌سی‌دی و فریم',
        result: 'success',
        version: repaired.operations[0].version,
      })
      .expect(200);
    expect((updated.body as DeviceResponse).operations[0].title).toBe('تعویض تاچ، ال‌سی‌دی و فریم');

    const removed = await request(http)
      .delete(`/api/devices/${deviceId}/operations/${operationId}`)
      .set(bearer(adminToken))
      .expect(200);
    expect((removed.body as DeviceResponse).operations).toHaveLength(1);
  });

  it('جست‌وجو بر اساس نوع اقدام انجام‌شده نتیجه می‌دهد', async () => {
    const response = await request(http)
      .get('/api/devices?search=' + encodeURIComponent('بکاپ'))
      .set(bearer(adminToken))
      .expect(200);
    expect(response.body.items.some((item: { id: string }) => item.id === deviceId)).toBe(true);
  });

  it('مسیر فایل و یادداشت تکنسین به پرونده اضافه، ویرایش و حذف می‌شود', async () => {
    const withFile = await request(http)
      .post(`/api/devices/${deviceId}/files`)
      .set(bearer(adminToken))
      .send({
        label: 'بکاپ مخاطبین',
        path: '\\\\server\\backups\\a54\\contacts.vcf',
        storageKind: 'network',
      })
      .expect(201);
    const addedFile = (withFile.body as DeviceResponse).files.find(
      (file) => file.label === 'بکاپ مخاطبین',
    );
    expect(addedFile).toBeDefined();
    const fileId = addedFile!.id;

    const updated = await request(http)
      .patch(`/api/devices/${deviceId}/files/${fileId}`)
      .set(bearer(adminToken))
      .send({
        label: 'بکاپ مخاطبین و پیامک',
        path: '\\\\server\\backups\\a54',
        storageKind: 'network',
      })
      .expect(200);
    expect(
      (updated.body as DeviceResponse).files.find((file) => file.id === fileId)?.label,
    ).toBe('بکاپ مخاطبین و پیامک');

    const withNote = await request(http)
      .post(`/api/devices/${deviceId}/notes`)
      .set(bearer(adminToken))
      .send({ body: 'برد اصلی سالم است؛ فقط ال‌سی‌دی معیوب بود.' })
      .expect(201);
    const noteId = (withNote.body as DeviceResponse).technicianNotes[0].id;
    expect((withNote.body as DeviceResponse).technicianNotes[0].body).toContain('برد اصلی');

    const withoutFile = await request(http)
      .delete(`/api/devices/${deviceId}/files/${fileId}`)
      .set(bearer(adminToken))
      .expect(200);
    expect(
      (withoutFile.body as DeviceResponse).files.filter((file) => !file.isPrimary),
    ).toHaveLength(0);

    const withoutNote = await request(http)
      .delete(`/api/devices/${deviceId}/notes/${noteId}`)
      .set(bearer(adminToken))
      .expect(200);
    expect((withoutNote.body as DeviceResponse).technicianNotes).toHaveLength(0);
  });

  it('پرونده دیجیتال همه بخش‌ها را در یک پاسخ برمی‌گرداند', async () => {
    const response = await request(http)
      .get(`/api/devices/${deviceId}`)
      .set(bearer(adminToken))
      .expect(200);
    const device = response.body as DeviceResponse;
    expect(device.intakeCode).toBe(deviceCode);
    expect(Array.isArray(device.statusHistory)).toBe(true);
    expect(Array.isArray(device.operations)).toBe(true);
    expect(Array.isArray(device.files)).toBe(true);
    expect(Array.isArray(device.technicianNotes)).toBe(true);
    expect(Array.isArray(device.images)).toBe(true);
    expect(device.owner.fullName).toBe('سارا احمدی نژاد');
  });

  it('IMEI دستگاه دیگر در ویرایش پذیرفته نمی‌شود', async () => {
    const second = await request(http)
      .post('/api/devices')
      .set(bearer(adminToken))
      .send(
        devicePayload({
          model: 'Galaxy S23',
          serialNumber: '',
          imei1: '',
          imei2: '356789012345999',
          allowDuplicate: true,
        }),
      )
      .expect(201);
    const secondBody = second.body as DeviceResponse;
    secondDeviceId = secondBody.id;
    secondDeviceCode = secondBody.intakeCode;

    const conflict = await request(http)
      .patch(`/api/devices/${secondDeviceId}`)
      .set(bearer(adminToken))
      .send(
        devicePayload({
          model: 'Galaxy S23',
          imei1: '356789012345678',
          imei2: '',
          serialNumber: '',
          version: secondBody.version,
        }),
      )
      .expect(409);
    expect(conflict.body.code).toBe('DEVICE_DUPLICATE');
    expect(
      (conflict.body.details.duplicates as Array<{ intakeCode: string }>).some(
        (item) => item.intakeCode === deviceCode,
      ),
    ).toBe(true);

    const unchanged = await request(http)
      .patch(`/api/devices/${secondDeviceId}`)
      .set(bearer(adminToken))
      .send(
        devicePayload({
          model: 'Galaxy S23 پلاس',
          imei1: '',
          imei2: '356789012345999',
          serialNumber: '',
          version: secondBody.version,
          allowDuplicate: true,
        }),
      )
      .expect(200);
    expect((unchanged.body as DeviceResponse).version).toBe(secondBody.version + 1);
  });

  it('مشتری دارای پرونده قابل حذف نیست', async () => {
    const response = await request(http)
      .delete(`/api/customers/${customerId}`)
      .set(bearer(adminToken))
      .expect(409);
    expect(response.body.code).toBe('CUSTOMER_HAS_DEVICES');
  });

  it('فیلد سفارشی الزامی در فرم پذیرش اعتبارسنجی و ذخیره می‌شود', async () => {
    const field = await request(http)
      .post('/api/device-config/fields')
      .set(bearer(adminToken))
      .send({ labelFa: 'شماره فاکتور فروشگاه', fieldType: 'text', isRequired: true })
      .expect(201);
    const fieldKey = field.body.key as string;

    const missing = await request(http)
      .post('/api/devices')
      .set(bearer(adminToken))
      .send(devicePayload({ model: 'بدون فیلد سفارشی', imei1: '', serialNumber: '' }))
      .expect(400);
    expect(missing.body.message).toContain('شماره فاکتور فروشگاه');

    const created = await request(http)
      .post('/api/devices')
      .set(bearer(adminToken))
      .send(
        devicePayload({
          model: 'با فیلد سفارشی',
          imei1: '',
          serialNumber: '',
          customFields: { [fieldKey]: 'INV-100' },
        }),
      )
      .expect(201);
    expect((created.body as DeviceResponse).customFields[fieldKey]).toBe('INV-100');

    await request(http)
      .delete(`/api/device-config/fields/${field.body.id}`)
      .set(bearer(adminToken))
      .expect(200);
  });

  it('فیلدهای اصلی حذف نمی‌شوند ولی غیرفعال‌سازی فیلدهای غیراصلی ممکن است', async () => {
    const fields = await request(http)
      .get('/api/device-config/fields')
      .set(bearer(adminToken))
      .expect(200);
    const intakeField = (fields.body as Array<{ id: string; key: string }>).find(
      (item) => item.key === 'intake_code',
    )!;
    const manufacturerField = (fields.body as Array<{ id: string; key: string }>).find(
      (item) => item.key === 'manufacturer',
    )!;

    const blocked = await request(http)
      .delete(`/api/device-config/fields/${intakeField.id}`)
      .set(bearer(adminToken))
      .expect(409);
    expect(blocked.body.code).toBe('FIELD_LOCKED');

    const disabled = await request(http)
      .patch(`/api/device-config/fields/${manufacturerField.id}`)
      .set(bearer(adminToken))
      .send({ isEnabled: false })
      .expect(200);
    expect(disabled.body.isEnabled).toBe(false);

    await request(http)
      .patch(`/api/device-config/fields/${manufacturerField.id}`)
      .set(bearer(adminToken))
      .send({ isEnabled: true })
      .expect(200);
  });

  it('فهرست گزینه‌ها مدیریت می‌شود و گزینه در حال استفاده حذف نمی‌گردد', async () => {
    const option = await request(http)
      .post('/api/device-config/options')
      .set(bearer(adminToken))
      .send({ category: 'manufacturer', labelFa: 'برند آزمون' })
      .expect(201);
    const optionKey = option.body.key as string;
    expect(optionKey).toMatch(/^c_[a-f0-9]{10}$/);

    await request(http)
      .post('/api/devices')
      .set(bearer(adminToken))
      .send(
        devicePayload({
          model: 'دستگاه برند آزمون',
          imei1: '',
          serialNumber: 'SN-TEST-BRAND',
          manufacturer: optionKey,
        }),
      )
      .expect(201);

    const inUse = await request(http)
      .delete(`/api/device-config/options/${option.body.id}`)
      .set(bearer(adminToken))
      .expect(409);
    expect(inUse.body.code).toBe('OPTION_IN_USE');
    expect(inUse.body.details.usageCount).toBeGreaterThanOrEqual(1);

    await request(http)
      .patch(`/api/device-config/options/${option.body.id}`)
      .set(bearer(adminToken))
      .send({ isActive: false })
      .expect(200);

    await request(http)
      .post('/api/devices')
      .set(bearer(adminToken))
      .send(
        devicePayload({
          model: 'با گزینه غیرفعال',
          imei1: '',
          serialNumber: '',
          manufacturer: optionKey,
        }),
      )
      .expect(400);

    const config = await request(http)
      .get('/api/device-config')
      .set(bearer(adminToken))
      .expect(200);
    expect(config.body.fields.length).toBeGreaterThanOrEqual(19);
    expect(Array.isArray(config.body.options.equipment_type)).toBe(true);
    expect(Array.isArray(config.body.technicians)).toBe(true);

    const systemOption = (config.body.options.manufacturer as Array<{
      id: string;
      isSystem: boolean;
    }>).find((item) => item.isSystem)!;
    const systemDelete = await request(http)
      .delete(`/api/device-config/options/${systemOption.id}`)
      .set(bearer(adminToken))
      .expect(409);
    expect(systemDelete.body.code).toBe('OPTION_IN_USE');
  });

  it('تکنسین مسئول باید کاربر فعال باشد', async () => {
    await request(http)
      .post('/api/devices')
      .set(bearer(adminToken))
      .send(
        devicePayload({
          model: 'تکنسین نامعتبر',
          imei1: '',
          serialNumber: '',
          technicianId: '11111111-1111-4111-8111-111111111111',
        }),
      )
      .expect(400);

    const me = await request(http).get('/api/auth/me').set(bearer(adminToken)).expect(200);
    const created = await request(http)
      .post('/api/devices')
      .set(bearer(adminToken))
      .send(
        devicePayload({
          model: 'با تکنسین معتبر',
          imei1: '',
          serialNumber: '',
          technicianId: me.body.user.id as string,
        }),
      )
      .expect(201);
    expect((created.body as DeviceResponse).id).toBeTruthy();
  });

  it('خروجی اکسل با فیلتر جستجو تولید می‌شود', async () => {
    const response = await request(http)
      .get('/api/devices/export?search=' + encodeURIComponent(deviceCode))
      .set(bearer(adminToken))
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    expect(response.headers['content-type']).toContain('spreadsheetml');
    expect(response.headers['content-disposition']).toContain('.xlsx');
    const buffer = response.body as Buffer;
    expect(buffer.subarray(0, 2).toString()).toBe('PK');

    const audit = await request(http)
      .get('/api/audit-logs?action=device.exported')
      .set(bearer(adminToken))
      .expect(200);
    expect(audit.body.total).toBeGreaterThanOrEqual(1);
  });

  it('تصویر دستگاه بارگذاری، دریافت و حذف می‌شود', async () => {
    const uploaded = await request(http)
      .post(`/api/devices/${deviceId}/images`)
      .set(bearer(adminToken))
      .field('caption', 'تصویر دستگاه در زمان پذیرش')
      .attach('file', PNG_1PX, { filename: 'device.png', contentType: 'image/png' })
      .expect(201);
    const images = (uploaded.body as DeviceResponse).images;
    expect(images).toHaveLength(1);
    expect(images[0].originalName).toBe('device.png');

    await request(http)
      .get(`/api/devices/${deviceId}/images/${images[0].id}/file`)
      .set(bearer(adminToken))
      .expect(200)
      .expect('Content-Type', 'image/png');

    const rejected = await request(http)
      .post(`/api/devices/${deviceId}/images`)
      .set(bearer(adminToken))
      .attach('file', Buffer.from('not an image'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      })
      .expect(400);
    expect(rejected.body.message).toContain('JPG');

    const removed = await request(http)
      .delete(`/api/devices/${deviceId}/images/${images[0].id}`)
      .set(bearer(adminToken))
      .expect(200);
    expect((removed.body as DeviceResponse).images).toHaveLength(0);
  });

  it('کاربر بدون مجوز مدیریت فقط می‌تواند پرونده‌ها را ببیند', async () => {
    const roles = await request(http)
      .get('/api/users/role-options')
      .set(bearer(adminToken))
      .expect(200);
    const warehouseRoleId = (roles.body as RoleOption[]).find((role) => role.key === 'warehouse')!.id;
    await request(http)
      .post('/api/users')
      .set(bearer(adminToken))
      .send({
        username: 'anbardar',
        fullName: 'کاربر انبار',
        roleId: warehouseRoleId,
        password: 'WarehousePass123',
      })
      .expect(201);
    const session = await login(app, 'anbardar', 'WarehousePass123');
    await request(http)
      .post('/api/auth/change-password')
      .set(bearer(session.accessToken))
      .send({ currentPassword: 'WarehousePass123', newPassword: 'WarehousePass456' })
      .expect(200);
    const relogin = await login(app, 'anbardar', 'WarehousePass456');

    await request(http)
      .get('/api/devices')
      .set(bearer(relogin.accessToken))
      .expect(200);
    await request(http)
      .get(`/api/devices/${deviceId}`)
      .set(bearer(relogin.accessToken))
      .expect(200);
    await request(http)
      .post('/api/devices')
      .set(bearer(relogin.accessToken))
      .send(devicePayload({ model: 'غیرمجاز', imei1: '', serialNumber: '' }))
      .expect(403);
    await request(http)
      .patch(`/api/devices/${deviceId}/status`)
      .set(bearer(relogin.accessToken))
      .send({ status: 'ready_delivery' })
      .expect(403);
    await request(http)
      .get(`/api/devices/${deviceId}/password`)
      .set(bearer(relogin.accessToken))
      .expect(403);
    await request(http).get('/api/devices').expect(401);
    expect(secondDeviceCode).toMatch(/^MR-\d{4}-\d{4}$/);
  });
});
