import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service';
import { ADMIN, bearer, createTestApp, httpServer, login, resetDatabase, setupAdmin } from './helpers';

interface RoleOption {
  id: string;
  key: string;
  nameFa: string;
}

describe('مدیریت کاربران، نقش‌ها و کنترل تداخل (مرحله ۱)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof httpServer>;
  let adminToken = '';
  let adminId = '';
  let technicianRoleId = '';
  let createdUserId = '';

  beforeAll(async () => {
    await resetDatabase();
    app = await createTestApp();
    http = httpServer(app);
    await setupAdmin(app);
    const session = await login(app, ADMIN.username, ADMIN.password);
    adminToken = session.accessToken;
    adminId = session.userId;
    const roles = await request(http)
      .get('/api/users/role-options')
      .set(bearer(adminToken))
      .expect(200);
    technicianRoleId = (roles.body as RoleOption[]).find((role) => role.key === 'technician')!.id;
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('مدیر می‌تواند کاربر جدید بسازد', async () => {
    const response = await request(http)
      .post('/api/users')
      .set(bearer(adminToken))
      .send({
        username: 'reza',
        fullName: 'رضا محمدی',
        phone: '09121234567',
        roleId: technicianRoleId,
        password: 'RezaPass123',
      })
      .expect(201);

    createdUserId = response.body.id;
    expect(response.body.username).toBe('reza');
    expect(response.body.role.key).toBe('technician');
    expect(response.body.mustChangePassword).toBe(true);
    expect(response.body.version).toBe(1);
    expect(response.body.passwordHash).toBeUndefined();
  });

  it('نام کاربری تکراری پذیرفته نمی‌شود', async () => {
    const response = await request(http)
      .post('/api/users')
      .set(bearer(adminToken))
      .send({
        username: 'REZA',
        fullName: 'کاربر تکراری',
        roleId: technicianRoleId,
        password: 'AnotherPass123',
      })
      .expect(409);
    expect(response.body.code).toBe('DUPLICATE');
  });

  it('جستجو و فیلتر کاربران کار می‌کند', async () => {
    const response = await request(http)
      .get('/api/users?search=رضا&roleId=' + technicianRoleId)
      .set(bearer(adminToken))
      .expect(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].username).toBe('reza');
  });

  it('ویرایش هم‌زمان با نسخه قدیمی رد می‌شود', async () => {
    const updated = await request(http)
      .patch(`/api/users/${createdUserId}`)
      .set(bearer(adminToken))
      .send({ fullName: 'رضا محمدی اصل', version: 1 })
      .expect(200);
    expect(updated.body.version).toBe(2);
    expect(updated.body.fullName).toBe('رضا محمدی اصل');

    const conflict = await request(http)
      .patch(`/api/users/${createdUserId}`)
      .set(bearer(adminToken))
      .send({ fullName: 'ویرایش قدیمی', version: 1 })
      .expect(409);
    expect(conflict.body.code).toBe('CONFLICT');
  });

  it('غیرفعال‌سازی کاربر، ورود او را مسدود می‌کند', async () => {
    const disabled = await request(http)
      .patch(`/api/users/${createdUserId}`)
      .set(bearer(adminToken))
      .send({ isActive: false, version: 2 })
      .expect(200);
    expect(disabled.body.isActive).toBe(false);

    const blocked = await request(http)
      .post('/api/auth/login')
      .send({ username: 'reza', password: 'RezaPass123' })
      .expect(403);
    expect(blocked.body.code).toBe('ACCOUNT_INACTIVE');

    await request(http)
      .patch(`/api/users/${createdUserId}`)
      .set(bearer(adminToken))
      .send({ isActive: true, version: 3 })
      .expect(200);
  });

  it('کاربر نمی‌تواند حساب خودش را غیرفعال، حذف یا نقش خود را تغییر دهد', async () => {
    const me = await request(http).get('/api/auth/me').set(bearer(adminToken)).expect(200);
    const version = me.body.user.version as number;

    const deactivate = await request(http)
      .patch(`/api/users/${adminId}`)
      .set(bearer(adminToken))
      .send({ isActive: false, version })
      .expect(409);
    expect(deactivate.body.message).toContain('خودتان');

    const demote = await request(http)
      .patch(`/api/users/${adminId}`)
      .set(bearer(adminToken))
      .send({ roleId: technicianRoleId, version })
      .expect(409);
    expect(demote.body.code).toBe('LAST_ADMIN');

    await request(http).delete(`/api/users/${adminId}`).set(bearer(adminToken)).expect(409);
  });

  it('بازنشانی رمز توسط مدیر، نشست‌های کاربر را می‌بندد', async () => {
    const session = await login(app, 'reza', 'RezaPass123');
    await request(http).get('/api/auth/me').set(bearer(session.accessToken)).expect(200);

    await request(http)
      .post(`/api/users/${createdUserId}/reset-password`)
      .set(bearer(adminToken))
      .send({ newPassword: 'ResetPass123' })
      .expect(201);

    await request(http).get('/api/auth/me').set(bearer(session.accessToken)).expect(401);

    const newLogin = await request(http)
      .post('/api/auth/login')
      .send({ username: 'reza', password: 'ResetPass123' })
      .expect(200);
    expect(newLogin.body.user.mustChangePassword).toBe(true);
  });

  it('حذف کاربر به‌صورت نرم انجام می‌شود و تاریخچه حفظ می‌گردد', async () => {
    await request(http).delete(`/api/users/${createdUserId}`).set(bearer(adminToken)).expect(200);
    await request(http).get(`/api/users/${createdUserId}`).set(bearer(adminToken)).expect(404);

    const db = app.get(DatabaseService);
    const rows = await db.query<{ deleted_at: Date | null }>(
      'SELECT deleted_at FROM users WHERE id = $1',
      [createdUserId],
    );
    expect(rows[0].deleted_at).not.toBeNull();

    await request(http)
      .post('/api/auth/login')
      .send({ username: 'reza', password: 'ResetPass123' })
      .expect(401);

    const audit = await request(http)
      .get('/api/audit-logs?action=user.deleted')
      .set(bearer(adminToken))
      .expect(200);
    expect(audit.body.total).toBeGreaterThanOrEqual(1);
  });

  it('کاربر بدون مجوز به مدیریت کاربران دسترسی ندارد', async () => {
    const roles = await request(http)
      .get('/api/users/role-options')
      .set(bearer(adminToken))
      .expect(200);
    const receptionistRoleId = (roles.body as RoleOption[]).find(
      (role) => role.key === 'receptionist',
    )!.id;

    await request(http)
      .post('/api/users')
      .set(bearer(adminToken))
      .send({
        username: 'reception',
        fullName: 'کاربر پذیرش',
        roleId: receptionistRoleId,
        password: 'ReceptionPass123',
      })
      .expect(201);

    const session = await login(app, 'reception', 'ReceptionPass123');
    await request(http)
      .post('/api/auth/change-password')
      .set(bearer(session.accessToken))
      .send({ currentPassword: 'ReceptionPass123', newPassword: 'ReceptionNew123' })
      .expect(200);

    const relogin = await login(app, 'reception', 'ReceptionNew123');
    await request(http).get('/api/users').set(bearer(relogin.accessToken)).expect(403);
    await request(http)
      .post('/api/users')
      .set(bearer(relogin.accessToken))
      .send({ username: 'hacker', fullName: 'کاربر غیرمجاز', roleId: technicianRoleId, password: 'HackerPass123' })
      .expect(403);
    await request(http).get('/api/users/role-options').set(bearer(relogin.accessToken)).expect(403);
  });

  it('نقش سفارشی با مجوزهای انتخاب‌شده ساخته می‌شود', async () => {
    const created = await request(http)
      .post('/api/roles')
      .set(bearer(adminToken))
      .send({
        nameFa: 'مسئول پیگیری',
        description: 'پیگیری وضعیت تعمیرات',
        permissions: ['dashboard.view', 'repairs.view'],
      })
      .expect(201);

    expect(created.body.isSystem).toBe(false);
    expect(created.body.permissions).toEqual(['dashboard.view', 'repairs.view']);

    const updated = await request(http)
      .patch(`/api/roles/${created.body.id}`)
      .set(bearer(adminToken))
      .send({ nameFa: 'مسئول پیگیری تعمیرات', version: created.body.version })
      .expect(200);
    expect(updated.body.nameFa).toBe('مسئول پیگیری تعمیرات');

    await request(http)
      .patch(`/api/roles/${created.body.id}`)
      .set(bearer(adminToken))
      .send({ nameFa: 'قدیمی', version: 1 })
      .expect(409);

    await request(http)
      .delete(`/api/roles/${created.body.id}`)
      .set(bearer(adminToken))
      .expect(200);
  });

  it('نقش‌های سیستمی قابل حذف یا ویرایش نیستند', async () => {
    const roles = await request(http).get('/api/roles').set(bearer(adminToken)).expect(200);
    const adminRole = (roles.body as Array<{ key: string; id: string; version: number }>).find(
      (role) => role.key === 'admin',
    )!;

    const update = await request(http)
      .patch(`/api/roles/${adminRole.id}`)
      .set(bearer(adminToken))
      .send({ nameFa: 'مدیر', version: adminRole.version })
      .expect(409);
    expect(update.body.code).toBe('SYSTEM_ROLE');

    const remove = await request(http)
      .delete(`/api/roles/${adminRole.id}`)
      .set(bearer(adminToken))
      .expect(409);
    expect(remove.body.code).toBe('SYSTEM_ROLE');
  });
});
