import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service';
import { ADMIN, bearer, createTestApp, httpServer, login, refreshCookie, resetDatabase, setupAdmin } from './helpers';

describe('احراز هویت، نشست و امنیت (مرحله ۱)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof httpServer>;
  let adminToken = '';
  let adminId = '';
  let technicianRoleId = '';

  beforeAll(async () => {
    await resetDatabase();
    app = await createTestApp();
    http = httpServer(app);
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('در اولین اجرا، سامانه نیازمند تعریف مدیر است', async () => {
    const response = await request(http).get('/api/public/info').expect(200);
    expect(response.body.needsSetup).toBe(true);
  });

  it('راه‌اندازی اولیه، مدیر کل را می‌سازد و نام کارگاه را ذخیره می‌کند', async () => {
    await setupAdmin(app);
    const info = await request(http).get('/api/public/info').expect(200);
    expect(info.body.needsSetup).toBe(false);
    expect(info.body.workshopName).toBe(ADMIN.workshopName);

    const session = await login(app, ADMIN.username, ADMIN.password);
    adminToken = session.accessToken;
    adminId = session.userId;

    const roles = await request(http).get('/api/roles').set(bearer(adminToken)).expect(200);
    technicianRoleId = (roles.body as Array<{ key: string; id: string }>).find(
      (role) => role.key === 'technician',
    )!.id;
  });

  it('راه‌اندازی مجدد مسدود است', async () => {
    const response = await request(http)
      .post('/api/auth/setup')
      .send({ ...ADMIN, username: 'another-admin' })
      .expect(403);
    expect(response.body.code).toBe('SETUP_COMPLETED');
  });

  it('ورود با رمز اشتباه رد می‌شود و رویداد ثبت می‌گردد', async () => {
    const response = await request(http)
      .post('/api/auth/login')
      .send({ username: ADMIN.username, password: 'WrongPassword1' })
      .expect(401);
    expect(response.body.code).toBe('INVALID_CREDENTIALS');

    const audit = await request(http)
      .get('/api/audit-logs?action=auth.login_failed')
      .set(bearer(adminToken))
      .expect(200);
    expect(audit.body.total).toBeGreaterThanOrEqual(1);
  });

  it('پس از تلاش‌های ناموفق، حساب موقتاً قفل می‌شود', async () => {
    await request(http)
      .post('/api/users')
      .set(bearer(adminToken))
      .send({
        username: 'lockme',
        fullName: 'کاربر قفل‌شونده',
        roleId: technicianRoleId,
        password: 'LockMePass123',
        mustChangePassword: false,
      })
      .expect(201);

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const response = await request(http)
        .post('/api/auth/login')
        .send({ username: 'lockme', password: 'WrongPassword1' })
        .expect(401);
      expect(response.body.code).toBe('INVALID_CREDENTIALS');
    }

    const fifth = await request(http)
      .post('/api/auth/login')
      .send({ username: 'lockme', password: 'WrongPassword1' })
      .expect(423);
    expect(fifth.body.code).toBe('ACCOUNT_LOCKED');

    const correctButLocked = await request(http)
      .post('/api/auth/login')
      .send({ username: 'lockme', password: 'LockMePass123' })
      .expect(423);
    expect(correctButLocked.body.code).toBe('ACCOUNT_LOCKED');

    const db = app.get(DatabaseService);
    await db.query(
      'UPDATE users SET locked_until = NULL, failed_login_attempts = 0 WHERE username = $1',
      ['lockme'],
    );
    await request(http)
      .post('/api/auth/login')
      .send({ username: 'lockme', password: 'LockMePass123' })
      .expect(200);
  });

  it('ورود موفق، توکن دسترسی و کوکی امن نشست صادر می‌کند', async () => {
    const response = await request(http)
      .post('/api/auth/login')
      .send({ username: ADMIN.username, password: ADMIN.password })
      .expect(200);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.user.permissions).toContain('*');
    expect(response.body.user.role.key).toBe('admin');

    const cookies = response.headers['set-cookie'] as unknown as string[];
    const cookie = cookies.find((item) => item.startsWith('mrb_refresh='));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/auth/i);
  });

  it('دسترسی بدون توکن به مسیرهای محافظت‌شده مسدود است', async () => {
    const response = await request(http).get('/api/users').expect(401);
    expect(response.body.code).toBe('UNAUTHENTICATED');
  });

  it('تازه‌سازی نشست، توکن قبلی را باطل می‌کند', async () => {
    const agent = request.agent(http);
    const firstLogin = await agent
      .post('/api/auth/login')
      .send({ username: ADMIN.username, password: ADMIN.password })
      .expect(200);
    const firstCookie = refreshCookie(firstLogin.headers['set-cookie'] as unknown as string[]);

    const refreshed = await agent.post('/api/auth/refresh').expect(200);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));
    expect(refreshed.body.accessToken).not.toBe(firstLogin.body.accessToken);

    const reuse = await request(http)
      .post('/api/auth/refresh')
      .set('Cookie', firstCookie)
      .expect(401);
    expect(reuse.body.code).toBe('SESSION_INVALID');

    await request(http)
      .get('/api/auth/me')
      .set(bearer(firstLogin.body.accessToken as string))
      .expect(401);
    await request(http)
      .get('/api/auth/me')
      .set(bearer(refreshed.body.accessToken as string))
      .expect(200);
  });

  it('ادامه نشست پس از بی‌کاری بیش از حد مجاز رد می‌شود', async () => {
    const agent = request.agent(http);
    await agent
      .post('/api/auth/login')
      .send({ username: ADMIN.username, password: ADMIN.password })
      .expect(200);

    const db = app.get(DatabaseService);
    await db.query(
      `UPDATE sessions SET last_used_at = now() - interval '30 minutes'
        WHERE id = (SELECT id FROM sessions WHERE user_id = $1 AND revoked_at IS NULL
                     ORDER BY created_at DESC, id DESC LIMIT 1)`,
      [adminId],
    );

    const rejected = await agent.post('/api/auth/refresh').expect(401);
    expect(rejected.body.code).toBe('SESSION_INVALID');
  });

  it('تغییر رمز عبور، رمز قبلی را باطل و الزام تغییر را رفع می‌کند', async () => {
    await request(http)
      .post('/api/users')
      .set(bearer(adminToken))
      .send({
        username: 'tech1',
        fullName: 'تکنسین یک',
        roleId: technicianRoleId,
        password: 'TechPass123',
        mustChangePassword: true,
      })
      .expect(201);

    const session = await login(app, 'tech1', 'TechPass123');
    const blocked = await request(http)
      .get('/api/users')
      .set(bearer(session.accessToken))
      .expect(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const wrongCurrent = await request(http)
      .post('/api/auth/change-password')
      .set(bearer(session.accessToken))
      .send({ currentPassword: 'WrongPass123', newPassword: 'NewTech12345' })
      .expect(400);
    expect(wrongCurrent.body.code).toBe('INVALID_PASSWORD');

    await request(http)
      .post('/api/auth/change-password')
      .set(bearer(session.accessToken))
      .send({ currentPassword: 'TechPass123', newPassword: 'NewTech12345' })
      .expect(200);

    await request(http)
      .post('/api/auth/login')
      .send({ username: 'tech1', password: 'TechPass123' })
      .expect(401);

    const relogin = await request(http)
      .post('/api/auth/login')
      .send({ username: 'tech1', password: 'NewTech12345' })
      .expect(200);
    expect(relogin.body.user.mustChangePassword).toBe(false);

    const forbidden = await request(http)
      .get('/api/users')
      .set(bearer(relogin.body.accessToken as string))
      .expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');
  });

  it('قفل صفحه فقط با رمز صحیح و نشست معتبر باز می‌شود', async () => {
    const agent = request.agent(http);
    await agent
      .post('/api/auth/login')
      .send({ username: ADMIN.username, password: ADMIN.password })
      .expect(200);

    const wrong = await agent.post('/api/auth/unlock').send({ password: 'WrongPassword1' }).expect(401);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');

    const ok = await agent.post('/api/auth/unlock').send({ password: ADMIN.password }).expect(200);
    expect(ok.body.accessToken).toEqual(expect.any(String));

    await request(http).post('/api/auth/unlock').send({ password: ADMIN.password }).expect(401);
  });

  it('خروج از حساب، نشست و توکن دسترسی را باطل می‌کند', async () => {
    const agent = request.agent(http);
    const session = await agent
      .post('/api/auth/login')
      .send({ username: ADMIN.username, password: ADMIN.password })
      .expect(200);

    await agent
      .post('/api/auth/logout')
      .set(bearer(session.body.accessToken as string))
      .expect(200);

    await request(http)
      .get('/api/auth/me')
      .set(bearer(session.body.accessToken as string))
      .expect(401);
    await agent.post('/api/auth/refresh').expect(401);
  });

  it('درخواست از مبدأ غیرمجاز رد می‌شود', async () => {
    const response = await request(http)
      .post('/api/auth/login')
      .set('Origin', 'http://evil.example')
      .send({ username: ADMIN.username, password: ADMIN.password })
      .expect(403);
    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('چند کلاینت می‌توانند هم‌زمان از سرور استفاده کنند', async () => {
    const logins = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(http)
          .post('/api/auth/login')
          .send({ username: ADMIN.username, password: ADMIN.password })
          .expect(200),
      ),
    );
    const tokens = logins.map((response) => response.body.accessToken as string);
    expect(new Set(tokens).size).toBe(5);

    const responses = await Promise.all(
      tokens.flatMap((token) =>
        Array.from({ length: 3 }, () =>
          request(http).get('/api/dashboard/overview').set(bearer(token)),
        ),
      ),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);

    const sessions = await request(http)
      .get('/api/auth/sessions')
      .set(bearer(tokens[0]))
      .expect(200);
    expect(sessions.body.length).toBeGreaterThanOrEqual(5);
  });

  it('داشبورد آمار واقعی پایگاه داده را برمی‌گرداند', async () => {
    const response = await request(http)
      .get('/api/dashboard/overview')
      .set(bearer(adminToken))
      .expect(200);

    expect(response.body.stats.usersTotal).toBeGreaterThanOrEqual(1);
    expect(response.body.stats.rolesTotal).toBeGreaterThanOrEqual(5);
    expect(typeof response.body.stats.databaseSize).toBe('number');
    expect(response.body.stats.databaseSize).toBeGreaterThan(0);
    expect(response.body.currentUser.fullName).toBe(ADMIN.fullName);
    expect(response.body.server.workshopName).toBe(ADMIN.workshopName);
  });

  it('فهرست نشست‌های کاربر قابل مشاهده و بستن است', async () => {
    const agent = request.agent(http);
    const session = await agent
      .post('/api/auth/login')
      .send({ username: ADMIN.username, password: ADMIN.password })
      .expect(200);

    const sessions = await request(http)
      .get('/api/auth/sessions')
      .set(bearer(session.body.accessToken as string))
      .expect(200);
    expect(Array.isArray(sessions.body)).toBe(true);
    expect(sessions.body.length).toBeGreaterThanOrEqual(1);

    const current = (sessions.body as Array<{ id: string; current: boolean }>).find(
      (item) => item.current,
    );
    expect(current).toBeDefined();

    await request(http)
      .delete(`/api/auth/sessions/${current!.id}`)
      .set(bearer(session.body.accessToken as string))
      .expect(200);

    await request(http)
      .get('/api/auth/me')
      .set(bearer(session.body.accessToken as string))
      .expect(401);
  });

  it('شناسه مدیر برای بررسی‌های بعدی معتبر است', () => {
    expect(adminId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
