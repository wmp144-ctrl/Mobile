import type { INestApplication } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import request from 'supertest';
import { ADMIN, bearer, createTestApp, httpServer, login, resetDatabase, setupAdmin } from './helpers';

interface RoleOption {
  id: string;
  key: string;
}

describe('تنظیمات، تاریخچه تغییرات و پشتیبان‌گیری (مرحله ۱)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof httpServer>;
  let adminToken = '';

  beforeAll(async () => {
    await resetDatabase();
    app = await createTestApp();
    http = httpServer(app);
    await setupAdmin(app);
    adminToken = (await login(app, ADMIN.username, ADMIN.password)).accessToken;
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('تنظیمات پیش‌فرض امنیتی و کارگاه خوانده می‌شود', async () => {
    const response = await request(http)
      .get('/api/settings')
      .set(bearer(adminToken))
      .expect(200);

    expect(response.body.workshop.name).toBe(ADMIN.workshopName);
    expect(response.body.security.idleTimeoutMinutes).toBe(10);
    expect(response.body.security.maxFailedLogins).toBe(5);
    expect(response.body.security.lockoutMinutes).toBe(15);
    expect(response.body.backup.retentionCount).toBe(14);
  });

  it('تنظیمات با اعتبارسنجی ذخیره می‌شود', async () => {
    const invalid = await request(http)
      .patch('/api/settings')
      .set(bearer(adminToken))
      .send({ idleTimeoutMinutes: 1 })
      .expect(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');

    const updated = await request(http)
      .patch('/api/settings')
      .set(bearer(adminToken))
      .send({
        workshopName: 'تعمیرگاه مرکزی',
        workshopAddress: 'تهران، خیابان ولیعصر',
        workshopPhone: '021-12345678',
        idleTimeoutMinutes: 5,
        maxFailedLogins: 6,
        lockoutMinutes: 20,
        sessionDays: 5,
        backupRetentionCount: 2,
      })
      .expect(200);

    expect(updated.body.workshop.name).toBe('تعمیرگاه مرکزی');
    expect(updated.body.security.idleTimeoutMinutes).toBe(5);
    expect(updated.body.backup.retentionCount).toBe(2);

    const audit = await request(http)
      .get('/api/audit-logs?action=settings.updated')
      .set(bearer(adminToken))
      .expect(200);
    expect(audit.body.total).toBeGreaterThanOrEqual(1);
  });

  it('نسخه پشتیبان ساخته، فهرست و دانلود می‌شود', async () => {
    const status = await request(http)
      .get('/api/backups')
      .set(bearer(adminToken))
      .expect(200);
    expect(status.body.status.pgDumpAvailable).toBe(true);
    expect(status.body.status.retentionCount).toBe(2);

    const created = await request(http)
      .post('/api/backups')
      .set(bearer(adminToken))
      .expect(201);
    expect(created.body.name).toMatch(/^backup-\d{8}-\d{6}(-\d+)?\.dump$/);

    const filePath = path.join(process.env.BACKUP_DIR!, created.body.name as string);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, 'utf8')).toContain('fake backup content');

    const list = await request(http).get('/api/backups').set(bearer(adminToken)).expect(200);
    expect(list.body.items).toHaveLength(1);

    const download = await request(http)
      .get(`/api/backups/${created.body.name as string}/download`)
      .set(bearer(adminToken))
      .expect(200);
    expect(String(download.headers['content-disposition'])).toContain('attachment');

    const audit = await request(http)
      .get('/api/audit-logs?action=backup.created')
      .set(bearer(adminToken))
      .expect(200);
    expect(audit.body.total).toBeGreaterThanOrEqual(1);
  });

  it('نسخه‌های پشتیبان قدیمی بر اساس سیاست نگهداری حذف می‌شوند', async () => {
    await request(http).post('/api/backups').set(bearer(adminToken)).expect(201);
    await request(http).post('/api/backups').set(bearer(adminToken)).expect(201);

    const list = await request(http).get('/api/backups').set(bearer(adminToken)).expect(200);
    expect(list.body.items).toHaveLength(2);
  });

  it('فهرست و خلاصه رویدادهای تاریخچه در دسترس است', async () => {
    const logs = await request(http)
      .get('/api/audit-logs?pageSize=5')
      .set(bearer(adminToken))
      .expect(200);
    expect(logs.body.items.length).toBeGreaterThan(0);
    expect(logs.body.items[0].createdAt).toEqual(expect.any(String));

    const summary = await request(http)
      .get('/api/audit-logs/actions')
      .set(bearer(adminToken))
      .expect(200);
    expect(summary.body.some((item: { key: string }) => item.key === 'auth.login')).toBe(true);
  });

  it('کاربر بدون مجوز به تنظیمات و پشتیبان‌گیری دسترسی ندارد', async () => {
    const roles = await request(http)
      .get('/api/users/role-options')
      .set(bearer(adminToken))
      .expect(200);
    const receptionist = (roles.body as RoleOption[]).find((role) => role.key === 'receptionist')!;

    await request(http)
      .post('/api/users')
      .set(bearer(adminToken))
      .send({
        username: 'limited',
        fullName: 'کاربر محدود',
        roleId: receptionist.id,
        password: 'LimitedPass123',
      })
      .expect(201);

    const session = await login(app, 'limited', 'LimitedPass123');
    await request(http)
      .post('/api/auth/change-password')
      .set(bearer(session.accessToken))
      .send({ currentPassword: 'LimitedPass123', newPassword: 'LimitedNew123' })
      .expect(200);

    const relogin = await login(app, 'limited', 'LimitedNew123');
    await request(http).get('/api/settings').set(bearer(relogin.accessToken)).expect(403);
    await request(http)
      .patch('/api/settings')
      .set(bearer(relogin.accessToken))
      .send({ workshopName: 'دستکاری' })
      .expect(403);
    await request(http).get('/api/backups').set(bearer(relogin.accessToken)).expect(403);
    await request(http)
      .post('/api/backups')
      .set(bearer(relogin.accessToken))
      .expect(403);
  });

  it('بررسی سلامت سرور و پایگاه داده پاسخ می‌دهد', async () => {
    const response = await request(http).get('/api/health').expect(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.database).toBe('up');
  });
});
