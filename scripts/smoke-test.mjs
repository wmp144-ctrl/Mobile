/**
 * آزمون دود سرتاسری روی سرور در حال اجرا (HTTP واقعی).
 * اجرا: node scripts/smoke-test.mjs
 * متغیرها: SMOKE_BASE (پیش‌فرض http://127.0.0.1:3001)
 */
const BASE = (process.env.SMOKE_BASE ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
const ADMIN = {
  workshopName: process.env.SMOKE_WORKSHOP ?? 'تعمیرگاه آزمون',
  fullName: 'مدیر آزمون',
  username: process.env.SMOKE_USER ?? 'smokeadmin',
  password: process.env.SMOKE_PASS ?? 'SmokeAdmin123',
};

let passed = 0;
function check(condition, label, extra = '') {
  if (!condition) {
    console.error(`FAIL  ${label}${extra ? ` — ${extra}` : ''}`);
    process.exitCode = 1;
    throw new Error(label);
  }
  passed += 1;
  console.log(`PASS  ${label}`);
}

async function call(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers ?? {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body) headers['Content-Type'] = 'application/json';
  if (options.cookie) headers.Cookie = options.cookie;
  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    redirect: 'manual',
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body, headers: response.headers };
}

console.log(`آزمون دود روی ${BASE}`);

const info = await call('/api/public/info');
check(info.status === 200, 'اطلاعات عمومی سامانه در دسترس است');
check(info.body.needsSetup === true, 'سامانه در وضعیت راه‌اندازی اولیه است');

const setup = await call('/api/auth/setup', { method: 'POST', body: ADMIN });
check(setup.status === 201, 'راه‌اندازی اولیه انجام شد', `وضعیت ${setup.status}`);

const login = await call('/api/auth/login', {
  method: 'POST',
  body: { username: ADMIN.username, password: ADMIN.password },
});
check(login.status === 200 && Boolean(login.body.accessToken), 'ورود مدیر با موفقیت انجام شد');
const token = login.body.accessToken;
const setCookies = login.headers.getSetCookie();
const refreshCookie = setCookies.find((item) => item.startsWith('mrb_refresh='));
check(Boolean(refreshCookie), 'کوکی نشست صادر شد');
check(/HttpOnly/i.test(refreshCookie), 'کوکی نشست HttpOnly است');

const me = await call('/api/auth/me', { token });
check(me.status === 200 && me.body.user.username === ADMIN.username, 'اطلاعات کاربر جاری دریافت شد');

const users = await call('/api/users', { token });
check(users.status === 200 && users.body.total === 1, 'فهرست کاربران از پایگاه داده خوانده شد');

const roles = await call('/api/roles', { token });
check(roles.status === 200 && roles.body.length >= 5, 'نقش‌های سیستمی موجود است');

const options = await call('/api/users/role-options', { token });
check(options.status === 200 && options.body.length >= 5, 'گزینه‌های نقش برای فرم کاربر در دسترس است');

const created = await call('/api/users', {
  method: 'POST',
  token,
  body: {
    username: 'smoketech',
    fullName: 'تکنسین آزمون',
    roleId: options.body.find((role) => role.key === 'technician').id,
    password: 'SmokeTech123',
  },
});
check(created.status === 201 && created.body.role.key === 'technician', 'کاربر جدید با نقش تکنسین ساخته شد');

const overview = await call('/api/dashboard/overview', { token });
check(overview.status === 200 && overview.body.stats.usersTotal === 2, 'داشبورد آمار واقعی را نشان می‌دهد');
check(overview.body.recentActivity.length > 0, 'رویدادهای اخیر در داشبورد دیده می‌شود');

const settings = await call('/api/settings', { token });
check(settings.status === 200 && settings.body.security.idleTimeoutMinutes === 10, 'تنظیمات پیش‌فرض امنیتی خوانده شد');

const settingsUpdate = await call('/api/settings', {
  method: 'PATCH',
  token,
  body: { workshopName: 'تعمیرگاه آزمون دود', idleTimeoutMinutes: 8 },
});
check(settingsUpdate.status === 200 && settingsUpdate.body.workshop.name === 'تعمیرگاه آزمون دود', 'تنظیمات ذخیره شد');

const audit = await call('/api/audit-logs?action=auth.login', { token });
check(audit.status === 200 && audit.body.total >= 1, 'تاریخچه ورود قابل مشاهده است');

const backups = await call('/api/backups', { token });
check(backups.status === 200 && Array.isArray(backups.body.items), 'وضعیت پشتیبان‌گیری در دسترس است');

const refreshed = await call('/api/auth/refresh', {
  method: 'POST',
  cookie: refreshCookie.split(';')[0],
});
check(refreshed.status === 200 && Boolean(refreshed.body.accessToken), 'نشست با کوکی تازه‌سازی شد');

const login2 = await call('/api/auth/login', {
  method: 'POST',
  body: { username: ADMIN.username, password: ADMIN.password },
});
const token2 = login2.body.accessToken;
const logout = await call('/api/auth/logout', { method: 'POST', token: token2 });
check(logout.status === 200, 'خروج از حساب انجام شد');
const afterLogout = await call('/api/auth/me', { token: token2 });
check(afterLogout.status === 401, 'توکن پس از خروج باطل شده است');

const health = await call('/api/health');
check(health.status === 200 && health.body.database === 'up', 'پایگاه داده سالم است');

console.log(`\nنتیجه: ${passed} بررسی موفق.`);
