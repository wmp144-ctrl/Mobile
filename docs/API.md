# مستندات API

سرویس مرکزی یک REST API روی مسیر `/api` است. تمام پاسخ‌ها JSON و پیام خطاها فارسی هستند. این سند
خلاصه قراردادهای پایدار نسخه ۱ است.

## احراز هویت

| موضوع | جزئیات |
| --- | --- |
| توکن دسترسی | JWT با عمر پیش‌فرض ۱۵ دقیقه: `Authorization: Bearer <token>` |
| نشست | توکن تازه‌سازی ۴۸ بایتی در کوکی `HttpOnly` با `SameSite=Strict` و مسیر `/api/auth` |
| تازه‌سازی | `POST /api/auth/refresh` کوکی را می‌خواند، نشست را می‌چرخاند و توکن تازه می‌دهد |
| بی‌کاری | سرور تازه‌سازی پس از مدت بی‌کاری تنظیم‌شده را رد می‌کند |
| مبدأ | درخواست‌های تغییردهنده با `Origin` ناشناخته رد می‌شوند (CSRF) |
| مجوز | نقش کاربر در هر درخواست از پایگاه داده خوانده می‌شود؛ تغییر دسترسی فوری اعمال می‌شود |

## قالب خطا

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "پیام فارسی",
  "details": {},
  "path": "/api/devices",
  "timestamp": "2026-10-23T10:00:00.000Z"
}
```

کدهای رایج: `VALIDATION_ERROR` (۴۰۰)، `UNAUTHENTICATED` (۴۰۱)، `FORBIDDEN` (۴۰۳)،
`NOT_FOUND` (۴۰۴)، `DUPLICATE` / `CONFLICT` (۴۰۹)، `BACKUP_ENCRYPTED` (۴۰۹)،
`PG_DUMP_MISSING` / `PG_RESTORE_MISSING` / `BACKUP_ENCRYPTION_UNAVAILABLE` (۵۰۳).

## عمومی

| متد | مسیر | توضیح |
| --- | --- | --- |
| GET | `/api/public/info` | نیاز به راه‌اندازی، نام کارگاه، لوگو، نسخه و تنظیمات ظاهر |
| GET | `/api/health` | سلامت سرویس و پایگاه داده |
| POST | `/api/auth/setup` | راه‌اندازی اولیه (فقط وقتی هیچ کاربری وجود ندارد) |
| POST | `/api/auth/login` | ورود؛ توکن و کوکی تازه‌سازی |
| POST | `/api/auth/refresh` | تازه‌سازی نشست با کوکی |
| POST | `/api/auth/unlock` | بازکردن قفل صفحه با رمز |

## احراز هویت‌شده

| متد | مسیر | توضیح |
| --- | --- | --- |
| GET | `/api/auth/me` | کاربر جاری و مجوزها |
| POST | `/api/auth/logout` | خروج و ابطال نشست |
| POST | `/api/auth/change-password` | تغییر رمز |
| GET | `/api/auth/sessions` | نشست‌های فعال کاربر |
| POST | `/api/auth/sessions/revoke-others` | بستن سایر نشست‌ها |
| DELETE | `/api/auth/sessions/:id` | بستن یک نشست |

## کاربران و نقش‌ها

| متد | مسیر | مجوز |
| --- | --- | --- |
| GET/POST | `/api/users` | `users.view` / `users.manage` |
| GET | `/api/users/role-options` | `users.view` |
| GET/PATCH/DELETE | `/api/users/:id` | `users.view` / `users.manage` |
| POST | `/api/users/:id/reset-password` | `users.manage` |
| GET | `/api/roles` | `roles.view` |
| GET | `/api/roles/permissions` | `roles.view` |
| POST/PATCH/DELETE | `/api/roles...` | `roles.manage` |

ویرایش کاربر و نقش نیازمند فیلد `version` است؛ نسخه نادرست `409` می‌دهد.

## تنظیمات و ظاهر

| متد | مسیر | توضیح |
| --- | --- | --- |
| GET | `/api/settings` | تنظیمات کامل (کارگاه، امنیت، ظاهر، پشتیبان، دستگاه، ذخیره‌سازی) |
| PATCH | `/api/settings` | به‌روزرسانی جزئی؛ نیازمند `settings.manage` |

نمونه بدنه PATCH:

```json
{
  "workshopName": "تعمیرگاه مرکزی",
  "language": "fa",
  "calendar": "jalali",
  "timezone": "Asia/Tehran",
  "timeFormat": "24",
  "theme": "dark",
  "accentColor": "teal",
  "backupScheduleEnabled": true,
  "backupScheduleTime": "03:00",
  "backupDirectory": "D:\\Backups\\RepairWorkshop",
  "backupEncrypt": true,
  "backupIncludeSettings": true,
  "backupIncludeFiles": false,
  "backupRetentionCount": 14
}
```

مقادیر مجاز: `language` = `fa|en`، `calendar` = `jalali|gregorian`، `theme` =
`light|dark|system`، `accentColor` = `blue|navy|teal|violet|emerald`، `timezone` از فهرست
امن (تهران، دبی، استانبول، برلین، لندن، نیویورک، UTC) و `backupScheduleTime` با قالب `HH:MM`.

## مشتریان

| متد | مسیر | توضیح |
| --- | --- | --- |
| GET | `/api/customers?search=&page=&pageSize=` | فهرست صفحه‌بندی‌شده |
| GET | `/api/customers/options` | گزینه‌های انتخاب مشتری |
| GET | `/api/customers/:id/devices` | سوابق تمام دستگاه‌های مشتری (مجوز `customers.view`) |
| GET/PATCH/DELETE | `/api/customers/:id` | جزئیات/ویرایش/حذف نرم |
| POST | `/api/customers` | ایجاد |

## تجهیزات

| متد | مسیر | توضیح |
| --- | --- | --- |
| GET | `/api/devices` | فیلترها: `search,status,equipmentType,manufacturer,technicianId,customerId,receivedFrom,receivedTo,sort,page,pageSize` |
| POST | `/api/devices` | پذیرش دستگاه و تولید کد یکتا |
| GET | `/api/devices/:id` | پرونده دیجیتال کامل |
| PATCH | `/api/devices/:id` | ویرایش با `version` |
| PATCH | `/api/devices/:id/status` | تغییر وضعیت + یادداشت |
| GET | `/api/devices/:id/password` | نمایش رمز دستگاه (مجوز ویژه + ثبت تاریخچه) |
| POST/PATCH/DELETE | `/api/devices/:id/operations...` | اقدامات تعمیر |
| POST/PATCH/DELETE | `/api/devices/:id/files...` | مسیرهای فایل |
| POST/DELETE | `/api/devices/:id/notes...` | یادداشت‌ها |
| POST/GET/DELETE | `/api/devices/:id/images...` | تصاویر (چندبخشی، حداکثر ۶ مگابایت) |
| GET | `/api/devices/export` | خروجی Excel |
| GET | `/api/devices/duplicates?serial=&imei=` | بررسی شناسه تکراری |

فیلدهای سفارشی در `customFields` (شیء کلید/مقدار) ارسال می‌شوند و بر اساس تعریف فعال فیلدها
اعتبارسنجی می‌شوند. مقدار فیلد مبلغ عدد نامنفی، تاریخ/تاریخ‌وساعت رشته ISO و فایل رشته مسیر/نام است.

## تنظیم فیلدها و فهرست‌ها

| متد | مسیر | مجوز |
| --- | --- | --- |
| GET | `/api/device-config` | `repairs.view` — فیلدها، فهرست‌ها، وضعیت‌ها و تکنسین‌ها |
| GET | `/api/device-config/statuses` | `repairs.view` — وضعیت‌های فعال دستگاه |
| POST | `/api/device-config/fields` | `settings.manage` |
| PATCH/DELETE | `/api/device-config/fields/:id` | `settings.manage` |
| POST | `/api/device-config/options` | `settings.manage` |
| PATCH/DELETE | `/api/device-config/options/:id` | `settings.manage` |

نمونه بدنه ایجاد فیلد:

```json
{
  "labelFa": "هزینه برآوردی",
  "fieldType": "amount",
  "groupName": "اطلاعات تکمیلی",
  "isRequired": false,
  "isSearchable": true,
  "isReportable": true
}
```

`fieldType`: `text | textarea | number | amount | date | datetime | select | multi_select |
checkbox | file | password`. برای فیلدهای انتخابی، آرایه `options: [{value,label}]` لازم است.

### وضعیت‌های دستگاه

دسته `device_status` در همان endpoint فهرست‌ها مدیریت می‌شود:

```json
{ "category": "device_status", "labelFa": "در انتظار قطعه خاص" }
```

- ۱۲ وضعیت پیش‌فرض سامانه (`received`، `in_progress`، `delivered` و …) در پایگاه داده Seed شده‌اند،
  برچسبشان قابل ویرایش است اما غیرفعال یا حذف نمی‌شوند.
- وضعیت سفارشی کلید `c_<hex>` می‌گیرد، در `POST/PATCH /api/devices/:id/status` و فیلتر
  `GET /api/devices?status=` پذیرفته می‌شود و در داشبورد، گزارش‌ها و تاریخچه با همان برچسب ظاهر می‌شود.
- وضعیت سفارشی غیرفعال قابل انتخاب نیست؛ دستگاهی که قبلاً آن وضعیت را داشته، اطلاعات و تاریخچه
  خود را حفظ می‌کند و فقط از فهرست انتخاب حذف می‌شود.
- وضعیت سفارشی که هنوز دستگاهی با آن وجود دارد قابل حذف نیست (پاسخ `409 OPTION_IN_USE`).

## داشبورد و گزارش‌ها

| متد | مسیر | مجوز |
| --- | --- | --- |
| GET | `/api/analytics/dashboard` | `dashboard.view` |
| GET | `/api/analytics/options` | `dashboard.view` |
| GET | `/api/reports/options` | `reports.view` |
| POST | `/api/reports/run` | `reports.view` |
| GET/POST | `/api/reports/saved` | `reports.view` / `reports.manage` |
| GET/PATCH/DELETE | `/api/reports/saved/:id` | `reports.manage` |
| POST | `/api/reports/saved/:id/run` | `reports.view` |
| POST | `/api/reports/export/excel` | `reports.view` |
| POST | `/api/reports/export/csv` | `reports.view` |

فیلترها: `from, to, year, month, equipmentType, manufacturer, model, job, technicianId, status,
operationType`.

```json
{
  "from": "2026-03-21T00:00:00.000Z",
  "to": "2026-10-23T00:00:00.000Z",
  "charts": [
    { "id": "c1", "dimension": "equipmentType", "metric": "count", "chartType": "doughnut" },
    { "id": "c2", "dimension": "month", "metric": "delivered", "chartType": "line" }
  ],
  "tableColumns": ["intakeCode", "custom:lab_code"],
  "tableLimit": 200
}
```

ستون سفارشی با `custom:<field_key>` و فقط برای فیلدهای `is_reportable` قابل استفاده است.
`GET /api/reports/options` فهرست این ستون‌ها را در `customColumns` برمی‌گرداند.

## ذخیره‌سازی و فایل‌ها

| متد | مسیر | توضیح |
| --- | --- | --- |
| GET/POST | `/api/storage/locations` | فهرست/ایجاد محل ذخیره‌سازی |
| PATCH/DELETE | `/api/storage/locations/:id` | ویرایش/حذف |
| POST | `/api/storage/locations/:id/check` | بررسی سلامت و فضای آزاد |
| POST | `/api/storage/locations/:id/open-ticket` | بلیت یک‌بارمصرف بازکردن پوشه |
| GET/PATCH | `/api/storage/config` | ساختار پوشه و آستانه فضا |
| GET | `/api/storage/files` | جست‌وجوی فایل‌ها |
| POST | `/api/storage/open-tickets/:token/consume` | مصرف بلیت (برنامه کمکی) |
| GET | `/api/devices/:id/storage` | وضعیت پوشه دستگاه |
| POST | `/api/devices/:id/storage/provision` | ساخت پوشه دستگاه |

## پشتیبان‌گیری و بازیابی

| متد | مسیر | توضیح |
| --- | --- | --- |
| GET | `/api/backups` | `items` (بسته‌ها)، `status` و `runs` (تاریخچه) |
| POST | `/api/backups` | ساخت بسته؛ بدنه اختیاری `{ "includeFiles": true }` |
| GET | `/api/backups/:name/download?file=database\|settings\|manifest` | دانلود؛ نسخه رمزنگاری‌شده `409` می‌دهد |
| POST | `/api/backups/:name/restore` | بازیابی |

نمونه بازیابی:

```json
{
  "confirmName": "backup-20261023-030000",
  "restoreDatabase": true,
  "restoreSettings": true,
  "restoreFiles": false
}
```

پاسخ موفق:

```json
{
  "bundleName": "backup-20261023-030000",
  "restoredAt": "2026-10-23T12:00:00.000Z",
  "database": true,
  "settingsRestored": true,
  "filesRestored": 0,
  "filesSkipped": 0,
  "safetyBackup": "backup-20261023-120000"
}
```

وضعیت پشتیبان شامل `pgDumpAvailable`، `pgRestoreAvailable`، `encryptionAvailable`،
`directory`، `retentionCount`، `scheduledEnabled`، `scheduleTime`، `lastSuccessAt`،
`lastSuccessName`، `lastFailureAt` و `lastFailureMessage` است.

## تاریخچه و داشبورد عملیاتی

| متد | مسیر | توضیح |
| --- | --- | --- |
| GET | `/api/audit-logs?action=&userId=&from=&to=&page=` | رویدادهای ثبت‌شده |
| GET | `/api/audit-logs/actions` | فهرست نوع رویدادها با شمارش |
| GET | `/api/dashboard/overview` | آمار کاربران، نشست‌ها، فضای پایگاه داده و وضعیت‌ها |

## قواعد ویرایش هم‌زمان

هر رکورد قابل ویرایش (کاربر، نقش، دستگاه، اقدام، فایل، قالب گزارش، محل ذخیره‌سازی) فیلد `version`
دارد. مقدار خوانده‌شده را در بدنه PATCH بفرستید؛ اگر رکورد توسط کاربر دیگری تغییر کرده باشد پاسخ
`409 CONFLICT` با پیام فارسی برگردانده می‌شود.
