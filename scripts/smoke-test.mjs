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
check(
  info.body.appearance?.theme === 'light' && info.body.appearance?.accentColor === 'blue',
  'تنظیمات ظاهر پیش‌فرض در اطلاعات عمومی موجود است',
);

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
check(Array.isArray(overview.body.statusBreakdown) && overview.body.statusBreakdown.length === 12, 'وضعیت‌های تعمیر در داشبورد موجود است');

const settings = await call('/api/settings', { token });
check(settings.status === 200 && settings.body.security.idleTimeoutMinutes === 10, 'تنظیمات پیش‌فرض امنیتی خوانده شد');

const settingsUpdate = await call('/api/settings', {
  method: 'PATCH',
  token,
  body: { workshopName: 'تعمیرگاه آزمون دود', idleTimeoutMinutes: 8 },
});
check(settingsUpdate.status === 200 && settingsUpdate.body.workshop.name === 'تعمیرگاه آزمون دود', 'تنظیمات ذخیره شد');

const customer = await call('/api/customers', {
  method: 'POST',
  token,
  body: { fullName: 'مشتری آزمون دود', phone: '09121234567', jobTitle: 'کارمند' },
});
check(customer.status === 201 && customer.body.deviceCount === 0, 'مشتری جدید ثبت شد');

const devicePayload = {
  customerId: customer.body.id,
  broughtByName: 'آورنده آزمون',
  broughtByJob: 'دانشجو',
  broughtByPhone: '09121112233',
  equipmentType: 'mobile',
  manufacturer: 'samsung',
  model: 'Galaxy A54',
  serialNumber: 'SN-SMOKE-1',
  imei1: '356789012345678',
  reportedProblem: 'صفحه نمایش شکسته است.',
  accessories: ['charger', 'sim'],
  lockStatus: 'pin',
  devicePassword: '4837',
};

const device = await call('/api/devices', { method: 'POST', token, body: devicePayload });
check(
  device.status === 201 && /^MR-\d{4}-\d{4}$/.test(device.body.intakeCode),
  'پذیرش دستگاه با کد یکتا انجام شد',
  `وضعیت ${device.status}`,
);
const deviceId = device.body.id;
check(device.body.status.key === 'received' && device.body.hasPassword, 'پرونده با وضعیت اولیه و رمز رمزنگاری‌شده ساخته شد');

const duplicate = await call('/api/devices', { method: 'POST', token, body: devicePayload });
check(duplicate.status === 409 && duplicate.body.code === 'DEVICE_DUPLICATE', 'IMEI تکراری هشدار می‌دهد');

const deviceSearch = await call('/api/devices?search=356789012345678', { token });
check(deviceSearch.status === 200 && deviceSearch.body.total >= 1, 'جست‌وجوی دستگاه با IMEI کار می‌کند');

const statusChange = await call(`/api/devices/${deviceId}/status`, {
  method: 'PATCH',
  token,
  body: { status: 'in_progress', note: 'شروع تعمیر در آزمون دود' },
});
check(
  statusChange.status === 200 &&
    statusChange.body.status.key === 'in_progress' &&
    statusChange.body.statusHistory[0].changedByName === ADMIN.fullName,
  'تغییر وضعیت با تاریخچه و نام کاربر ثبت شد',
);

const operation = await call(`/api/devices/${deviceId}/operations`, {
  method: 'POST',
  token,
  body: {
    operationType: 'backup',
    title: 'بکاپ آزمون دود',
    dataSizeBytes: 1048576,
    storagePath: 'smoke/backups',
    result: 'success',
    deviceStatusAfter: 'ready_delivery',
  },
});
check(
  operation.status === 201 &&
    operation.body.operations.length === 1 &&
    operation.body.status.key === 'ready_delivery',
  'اقدام ثبت شد و وضعیت نهایی به‌روزرسانی گردید',
);

const detail = await call(`/api/devices/${deviceId}`, { token });
check(
  detail.status === 200 &&
    Array.isArray(detail.body.files) &&
    Array.isArray(detail.body.images) &&
    Array.isArray(detail.body.technicianNotes),
  'پرونده دیجیتال همه بخش‌ها را برمی‌گرداند',
);

const locations = await call('/api/storage/locations', { token });
check(
  locations.status === 200 &&
    locations.body.some((item) => item.isDefault && item.health.available),
  'محل ذخیره‌سازی پیش‌فرض با فضای آزاد و سلامت گزارش شد',
);
const defaultLocation = locations.body.find((item) => item.isDefault);
const primaryFolder = detail.body.files.find((file) => file.isPrimary);
check(
  Boolean(primaryFolder) && primaryFolder.relativePath.includes(device.body.intakeCode),
  'پوشه اختصاصی دستگاه هنگام پذیرش ساخته شد',
);

const fileEntry = await call(`/api/devices/${deviceId}/files`, {
  method: 'POST',
  token,
  body: {
    label: 'بکاپ آزمون دود',
    storageLocationId: defaultLocation.id,
    relativePath: `${primaryFolder.relativePath}/Backup/smoke`,
    category: 'backup',
    backupStatus: 'completed',
  },
});
check(
  fileEntry.status === 201 &&
    fileEntry.body.files.some((file) => file.label === 'بکاپ آزمون دود' && file.backupStatus === 'completed'),
  'مسیر فایل با محل ذخیره‌سازی و وضعیت بکاپ ثبت شد',
);

const checkedFile = await call(`/api/devices/${deviceId}/files/${primaryFolder.id}/check`, {
  method: 'POST',
  token,
});
check(
  checkedFile.status === 201 && checkedFile.body.accessStatus === 'ok',
  'دسترسی به پوشه دستگاه بررسی و تأیید شد',
);

const fileSearch = await call(`/api/storage/files?search=${encodeURIComponent(device.body.intakeCode)}`, {
  token,
});
check(fileSearch.status === 200 && fileSearch.body.total >= 2, 'جست‌وجوی فایل با کد پذیرش کار می‌کند');

const openTicket = await call(`/api/devices/${deviceId}/files/${primaryFolder.id}/open-ticket`, {
  method: 'POST',
  token,
});
const consumedTicket = await call(`/api/storage/open-tickets/${openTicket.body.token}/consume`, {
  method: 'POST',
});
check(
  openTicket.status === 201 &&
    consumedTicket.status === 200 &&
    consumedTicket.body.serverPath === primaryFolder.path,
  'بلیت یک‌بارمصرف بازکردن پوشه صادر و مصرف شد',
);

const deviceConfig = await call('/api/device-config', { token });
check(
  deviceConfig.status === 200 && deviceConfig.body.fields.length >= 19 && deviceConfig.body.options.manufacturer.length > 0,
  'تنظیمات فیلدها و فهرست‌ها در دسترس است',
);

const customStatus = await call('/api/device-config/options', {
  method: 'POST',
  token,
  body: { category: 'device_status', labelFa: 'در انتظار تست نهایی' },
});
check(
  customStatus.status === 201 && customStatus.body.isSystem === false && customStatus.body.key.startsWith('c_'),
  'وضعیت سفارشی جدید توسط مدیر تعریف شد',
);

const statusList = await call('/api/device-config/statuses', { token });
check(
  statusList.status === 200 &&
    statusList.body.length === 13 &&
    statusList.body.some((item) => item.key === customStatus.body.key && item.label === 'در انتظار تست نهایی'),
  'وضعیت سفارشی در فهرست وضعیت‌های دستگاه قرار گرفت',
);

const secondDevice = await call('/api/devices', {
  method: 'POST',
  token,
  body: {
    ...devicePayload,
    equipmentType: 'laptop',
    model: 'IdeaPad Smoke',
    serialNumber: 'SN-SMOKE-2',
    imei1: '356789012345679',
    reportedProblem: 'روشن نمی‌شود.',
  },
});
check(secondDevice.status === 201, 'دستگاه دوم برای آزمون وضعیت سفارشی پذیرش شد');

const customStatusChange = await call(`/api/devices/${secondDevice.body.id}/status`, {
  method: 'PATCH',
  token,
  body: { status: customStatus.body.key, note: 'وضعیت سفارشی در آزمون دود' },
});
check(
  customStatusChange.status === 200 &&
    customStatusChange.body.status.label === 'در انتظار تست نهایی' &&
    customStatusChange.body.statusHistory[0].toStatus.label === 'در انتظار تست نهایی',
  'وضعیت سفارشی با برچسب صحیح در پرونده و تاریخچه ثبت شد',
);

const customStatusFilter = await call(`/api/devices?status=${customStatus.body.key}`, { token });
check(
  customStatusFilter.status === 200 && customStatusFilter.body.total === 1,
  'فیلتر فهرست تجهیزات با وضعیت سفارشی کار می‌کند',
);

const customerDevices = await call(`/api/customers/${customer.body.id}/devices`, { token });
check(
  customerDevices.status === 200 &&
    customerDevices.body.length === 2 &&
    customerDevices.body.some((item) => item.status.label === 'در انتظار تست نهایی'),
  'سوابق هر دو دستگاه از پرونده مشتری قابل مشاهده است',
);

const customStatusReport = await call('/api/reports/run', {
  method: 'POST',
  token,
  body: {
    charts: [{ id: 'custom-status', dimension: 'status', metric: 'count', chartType: 'bar' }],
    tableColumns: ['intakeCode', 'status'],
  },
});
check(
  customStatusReport.status === 201 &&
    customStatusReport.body.charts[0].categories.includes('در انتظار تست نهایی') &&
    customStatusReport.body.table.rows.some((row) => row.status === 'در انتظار تست نهایی'),
  'وضعیت سفارشی در نمودار و جدول گزارش ظاهر شد',
);

const exportResponse = await fetch(`${BASE}/api/devices/export?search=SMOKE`, {
  headers: { Authorization: `Bearer ${token}` },
});
check(
  exportResponse.status === 200 &&
    (exportResponse.headers.get('content-type') ?? '').includes('spreadsheetml'),
  'خروجی اکسل تجهیزات تولید شد',
);
await exportResponse.arrayBuffer();

const reportOptions = await call('/api/reports/options', { token });
check(
  reportOptions.status === 200 && reportOptions.body.equipmentTypes.length > 0 && reportOptions.body.years.length > 0,
  'گزینه‌های فیلتر گزارش‌گیری در دسترس است',
);

const dashboardFilters = await call(
  '/api/analytics/dashboard?equipmentType=mobile&manufacturer=samsung&status=ready_delivery',
  { token },
);
check(
  dashboardFilters.status === 200 &&
    dashboardFilters.body.stats.totalEquipment === 1 &&
    dashboardFilters.body.charts.equipmentTypes.total === 1,
  'داشبورد تحلیلی با فیلترهای ترکیبی محاسبه شد',
);

const reportConfig = {
  equipmentType: 'mobile',
  manufacturer: 'samsung',
  charts: [
    { id: 'smoke-1', dimension: 'equipmentType', metric: 'count', chartType: 'doughnut' },
    { id: 'smoke-2', dimension: 'month', metric: 'count', chartType: 'line' },
    { id: 'smoke-3', dimension: 'status', metric: 'count', chartType: 'stackedBar' },
  ],
  tableColumns: ['intakeCode', 'ownerName', 'status', 'receivedAt'],
};
const reportRun = await call('/api/reports/run', { method: 'POST', token, body: reportConfig });
check(
  reportRun.status === 201 &&
    reportRun.body.charts.length === 3 &&
    reportRun.body.table.rows.some((row) => row.intakeCode === device.body.intakeCode),
  'گزارش پیشرفته چندنموداری با جدول داده اجرا شد',
);

const savedReport = await call('/api/reports/saved', {
  method: 'POST',
  token,
  body: { name: 'قالب آزمون دود', isShared: true, config: reportConfig },
});
check(savedReport.status === 201, 'قالب گزارش ذخیره شد');
const rerun = await call(`/api/reports/saved/${savedReport.body.id}/run`, {
  method: 'POST',
  token,
});
check(rerun.status === 201 && rerun.body.charts.length === 3, 'قالب گزارش ذخیره‌شده مجدداً اجرا شد');
await call(`/api/reports/saved/${savedReport.body.id}`, { method: 'DELETE', token });

const csvResponse = await fetch(`${BASE}/api/reports/export/csv`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  body: JSON.stringify(reportConfig),
});
const csvText = await csvResponse.text();
check(
  csvResponse.status === 201 &&
    (csvResponse.headers.get('content-type') ?? '').includes('text/csv') &&
    csvText.includes(device.body.intakeCode),
  'خروجی CSV گزارش با کد پذیرش تولید شد',
);

const appearanceUpdate = await call('/api/settings', {
  method: 'PATCH',
  token,
  body: {
    language: 'fa',
    calendar: 'jalali',
    timezone: 'Asia/Tehran',
    timeFormat: '24',
    theme: 'dark',
    accentColor: 'teal',
    backupScheduleTime: '03:15',
  },
});
check(
  appearanceUpdate.status === 200 &&
    appearanceUpdate.body.appearance.theme === 'dark' &&
    appearanceUpdate.body.appearance.accentColor === 'teal' &&
    appearanceUpdate.body.backup.scheduleTime === '03:15',
  'تنظیمات ظاهر، تقویم و پشتیبان‌گیری ذخیره شد',
);

const publicAfterUpdate = await call('/api/public/info');
check(
  publicAfterUpdate.body.appearance.theme === 'dark' &&
    publicAfterUpdate.body.appearance.accentColor === 'teal',
  'تنظیمات ظاهر بدون ورود نیز اعمال می‌شود',
);

const customField = await call('/api/device-config/fields', {
  method: 'POST',
  token,
  body: {
    labelFa: 'هزینه برآوردی آزمون',
    fieldType: 'amount',
    groupName: 'اطلاعات تکمیلی',
    isSearchable: false,
    isReportable: true,
  },
});
check(
  customField.status === 201 &&
    customField.body.type === 'amount' &&
    customField.body.isSearchable === false &&
    customField.body.isReportable === true,
  'فیلد سفارشی مبلغ با پرچم جست‌وجو و گزارش ساخته شد',
);

const phase5ReportOptions = await call('/api/reports/options', { token });
check(
  phase5ReportOptions.status === 200 &&
    (phase5ReportOptions.body.customColumns ?? []).some(
      (column) => column.key === `custom:${customField.body.key}`,
    ),
  'فیلد سفارشی قابل گزارش در انتخاب ستون‌های گزارش موجود است',
);

const audit = await call('/api/audit-logs?action=auth.login', { token });
check(audit.status === 200 && audit.body.total >= 1, 'تاریخچه ورود قابل مشاهده است');

const backups = await call('/api/backups', { token });
check(
  backups.status === 200 &&
    Array.isArray(backups.body.items) &&
    Array.isArray(backups.body.runs) &&
    typeof backups.body.status.encryptionAvailable === 'boolean',
  'وضعیت، تاریخچه و رمزنگاری پشتیبان‌گیری در دسترس است',
);

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

const clientSessions = await Promise.all(
  Array.from({ length: 5 }, async (_, index) => {
    const session = await call('/api/auth/login', {
      method: 'POST',
      body: { username: ADMIN.username, password: ADMIN.password },
    });
    const profile = await call('/api/auth/me', { token: session.body.accessToken });
    const list = await call('/api/devices?page=1&pageSize=10', {
      token: session.body.accessToken,
    });
    return { index, session, profile, list };
  }),
);
check(
  clientSessions.every(
    (item) =>
      item.session.status === 200 &&
      item.profile.status === 200 &&
      item.list.status === 200 &&
      item.list.body.total >= 2,
  ),
  'پنج کلاینت هم‌زمان به سرور، نشست و پایگاه داده دسترسی داشتند',
);

console.log(`\nنتیجه: ${passed} بررسی موفق.`);
