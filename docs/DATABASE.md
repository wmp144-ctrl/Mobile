# طراحی پایگاه داده — مرحله ۱

پایگاه داده: PostgreSQL ۱۸ (سازگار با ۱۵ به بعد)
کدگذاری: UTF-8
ایندکس‌ها و مهاجرت‌ها در `server/src/database/migrations` نگهداری می‌شوند و در هر راه‌اندازی، فقط
مهاجرت‌های اجرانشده اعمال می‌شوند (جدول `schema_migrations`). بنابراین به‌روزرسانی برنامه هرگز
داده‌های موجود را حذف نمی‌کند.

## نمودار روابط

```
┌──────────────┐        ┌───────────────┐        ┌──────────────┐
│    roles     │ 1    n │     users     │ 1    n │   sessions   │
│ key, perm[]  ├───────►│ role_id       ├───────►│ token_hash   │
└──────────────┘        └───────┬───────┘        └──────────────┘
                                │ 1
                                │ n
                        ┌───────▼───────┐        ┌──────────────┐
                        │  audit_logs   │        │ app_settings │
                        │ user_id (set) │        │ key → jsonb  │
                        └───────────────┘        └──────────────┘
```

## جداول

### `roles`
| ستون | نوع | توضیح |
| --- | --- | --- |
| id | uuid PK | شناسه |
| key | text UNIQUE | کلید ماشینی (admin، technician، …) |
| name_fa | text | نام فارسی |
| description | text | توضیح |
| permissions | jsonb | آرایه مجوزها؛ `["*"]` یعنی همه مجوزها |
| is_system | boolean | نقش سیستمی قابل حذف نیست |
| version | integer | کنترل تداخل ویرایش هم‌زمان |
| created_at / updated_at | timestamptz | زمان ایجاد و ویرایش |

### `users`
| ستون | نوع | توضیح |
| --- | --- | --- |
| id | uuid PK | شناسه |
| username | text | یکتا بین کاربران حذف‌نشده (ایندکس یکتای جزئی روی `lower(username)`) |
| full_name | text | نام و نام خانوادگی |
| phone | text | تلفن همراه (اختیاری) |
| role_id | uuid FK → roles | نقش کاربر |
| password_hash | text | هش bcrypt |
| is_active | boolean | فعال/غیرفعال |
| must_change_password | boolean | اجبار تغییر رمز در ورود بعدی |
| password_changed_at | timestamptz | آخرین تغییر رمز |
| last_login_at | timestamptz | آخرین ورود موفق |
| failed_login_attempts | integer | شمارنده تلاش ناموفق |
| locked_until | timestamptz | قفل موقت حساب |
| version | integer | کنترل تداخل |
| created_at / updated_at | timestamptz | زمان‌ها |
| deleted_at | timestamptz | حذف نرم (داده هرگز فیزیکی حذف نمی‌شود) |

### `sessions`
| ستون | نوع | توضیح |
| --- | --- | --- |
| id | uuid PK | شناسه نشست (در توکن دسترسی هم می‌آید) |
| user_id | uuid FK → users | کاربر |
| refresh_token_hash | text UNIQUE | SHA-256 توکن تازه‌سازی |
| ip / user_agent | text | شناسه دستگاه |
| created_at / last_used_at | timestamptz | زمان ایجاد و آخرین استفاده |
| expires_at | timestamptz | انقضای مطلق نشست |
| revoked_at / revoked_reason | timestamptz / text | ابطال (خروج، تغییر رمز، استفاده مجدد) |

### `audit_logs`
| ستون | نوع | توضیح |
| --- | --- | --- |
| id | bigserial PK | شناسه |
| user_id | uuid FK → users ON DELETE SET NULL | کاربر عامل (با حذف کاربر تاریخچه می‌ماند) |
| username | text | نام کاربر در زمان رویداد |
| action | text | کلید رویداد مثل `auth.login`، `user.created` |
| entity_type / entity_id | text | موجودیت هدف |
| description | text | شرح فارسی رویداد |
| metadata | jsonb | جزئیات اضافی (بدون داده حساس) |
| ip / user_agent | text | منشأ درخواست |
| created_at | timestamptz | زمان (ایندکس نزولی برای فهرست) |

### `app_settings`
| ستون | نوع | توضیح |
| --- | --- | --- |
| key | text PK | کلید تنظیم |
| value | jsonb | مقدار |
| updated_at | timestamptz | زمان |
| updated_by | uuid FK → users | آخرین ویرایش‌کننده |

تنظیمات پیش‌فرض: `workshop.name`، `security.idleTimeoutMinutes` (۱۰)،
`security.maxFailedLogins` (۵)، `security.lockoutMinutes` (۱۵)، `security.sessionDays` (۷)،
`backup.retentionCount` (۱۴).

## مهاجرت‌ها

| فایل | محتوا |
| --- | --- |
| `001_initial_schema.sql` | جداول پایه، ایندکس‌ها، نقش‌ها و تنظیمات پیش‌فرض |
| `002_seed_roles_permissions.sql` | تنظیم مجوزهای نقش‌های سیستمی و نقش «مدیر کل» |

## مجوزهای تعریف‌شده

`dashboard.view`، `users.view`، `users.manage`، `roles.view`، `roles.manage`، `settings.view`،
`settings.manage`، `audit.view`، `backups.manage` و مجوزهای آینده: `customers.view/manage`،
`repairs.view/manage`، `inventory.view/manage`، `invoices.view/manage`، `reports.view`،
`files.manage`.

نقش‌های پیش‌فرض: مدیر کل (`*`)، سرپرست تعمیرات، تکنسین، پذیرش، انباردار. ساخت نقش سفارشی با
انتخاب مجوزها نیز پشتیبانی می‌شود.

## قواعد نگهداری داده

1. حذف کاربران و نقش‌های سفارشی به‌صورت نرم انجام می‌شود؛ تاریخچه دست‌نخورده می‌ماند.
2. حذف نقش سیستمی یا نقشی که کاربر دارد مسدود است.
3. آخرین کاربر فعال با مجوز `users.manage` قابل غیرفعال‌سازی یا حذف نیست تا دسترسی مدیر از بین نرود.
4. تمام تغییرات ساختاری فقط از طریق مهاجرت افزایشی انجام می‌شود.
