# طراحی پایگاه داده — مراحل ۱ تا ۳

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

  ┌───────────┐ 1    n ┌─────────┐ 1    n ┌───────────────────┐
  │ customers ├───────►│ devices ├───────►│ device_operations │
  └───────────┘        └────┬────┘        └───────────────────┘
                            │ 1
      ┌─────────────┬───────┼──────────────┬──────────────┐
      ▼ n           ▼ n     ▼ n            ▼ n            ▼ n
┌──────────────┐┌──────────────┐┌────────────┐┌──────────────┐
│ device_files ││ device_images││device_notes││ status_hist. │
└──────────────┘└──────────────┘└────────────┘└──────────────┘

  field_definitions و option_lists ← تعریف فرم پذیرش و فهرست‌های کشویی
  intake_counters ← شمارنده کد پذیرش به تفکیک سال

  storage_locations 1 ──── n device_files  (مسیر مرجع، مسیر کلاینتی، وضعیت دسترسی)
  storage_open_tickets ← بلیت یک‌بارمصرف بازکردن پوشه برای برنامه کمکی
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
`backup.retentionCount` (۱۴)، `devices.intakePrefix` (`MR`)، `devices.defaultDueDays` (۳)،
`storage.folderLayout` (`{year}/{intakeCode}`)، `storage.subfolders` (شش زیرپوشه پیش‌فرض) و
`storage.lowSpaceGb` (۵).

### `customers`
| ستون | نوع | توضیح |
| --- | --- | --- |
| id | uuid PK | شناسه |
| full_name | text | نام و نام خانوادگی مالک |
| phone / phone_secondary | text | تلفن اصلی و دوم |
| job_title | text | شغل |
| national_id | text | کد ملی (اختیاری) |
| address / notes | text | نشانی و یادداشت |
| version | integer | کنترل تداخل ویرایش هم‌زمان |
| created_by | uuid FK → users | ثبت‌کننده |
| created_at / updated_at | timestamptz | زمان‌ها |
| deleted_at | timestamptz | حذف نرم |

### `intake_counters`
| ستون | نوع | توضیح |
| --- | --- | --- |
| scope | text PK | بازه شمارش، مثل `MR-1405` |
| last_value | integer | آخرین شماره استفاده‌شده |
| updated_at | timestamptz | زمان آخرین به‌روزرسانی |

### `devices`
| ستون | نوع | توضیح |
| --- | --- | --- |
| id | uuid PK | شناسه |
| intake_code | text | کد پذیرش یکتا با قالب `MR-YYYY-NNNN` (ایندکس یکتا) |
| customer_id | uuid FK → customers | مالک دستگاه |
| brought_by_name / brought_by_job / brought_by_phone | text | مشخصات آورنده |
| equipment_type | text | نوع تجهیز (کلید `option_lists`) |
| manufacturer | text | سازنده |
| model | text | مدل دقیق |
| serial_number | text | شماره سریال (ایندکس جزئی) |
| imei1 / imei2 | text | IMEIها (ایندکس جزئی) |
| received_at | timestamptz | زمان دریافت |
| due_at | timestamptz | تحویل پیش‌بینی‌شده |
| physical_condition | text | خط و خش، شکستگی و آسیب‌ها |
| accessories | jsonb | آرایه لوازم همراه (کلیدهای `accessory`) |
| lock_status | text | وضعیت قفل دستگاه |
| device_password_cipher | text | رمز/الگوی دستگاه با AES-256-GCM؛ هرگز به‌صورت متن ساده |
| reported_problem | text | مشکل اعلام‌شده مشتری |
| notes | text | توضیحات تکمیلی |
| technician_id | uuid FK → users | تکنسین مسئول |
| status | text | یکی از ۱۲ وضعیت تعریف‌شده (CHECK) |
| status_changed_at / delivered_at | timestamptz | زمان آخرین تغییر وضعیت و تحویل |
| custom_fields | jsonb | مقادیر فیلدهای سفارشی تعریف‌شده در `field_definitions` |
| version | integer | کنترل تداخل |
| created_by / created_at / updated_at | uuid / timestamptz | ثبت‌کننده و زمان‌ها |

### `device_status_history`
| ستون | نوع | توضیح |
| --- | --- | --- |
| id | bigserial PK | شناسه |
| device_id | uuid FK → devices | دستگاه |
| from_status / to_status | text | وضعیت مبدأ و مقصد |
| note | text | یادداشت کاربر |
| changed_by | uuid FK → users | کاربر تغییردهنده |
| changed_by_name | text | نام کاربر در زمان رویداد |
| changed_at | timestamptz | زمان دقیق |

رکوردهای این جدول فقط درج می‌شوند و ویرایش یا حذف نمی‌شوند.

### `device_operations`
| ستون | نوع | توضیح |
| --- | --- | --- |
| id | uuid PK | شناسه |
| device_id | uuid FK → devices | دستگاه |
| operation_type | text | نوع اقدام (کلید `operation_type`) |
| title | text | عنوان اقدام |
| performed_at | timestamptz | تاریخ و ساعت انجام |
| technician_id / technician_name | uuid / text | تکنسین انجام‌دهنده |
| description | text | توضیحات |
| data_size_bytes | bigint | حجم داده بکاپ یا ریکاوری‌شده |
| storage_path | text | محل ذخیره فایل‌ها |
| result | text | `success` / `partial` / `failed` |
| device_status_after | text | وضعیت دستگاه پس از اقدام |
| version | integer | کنترل تداخل |
| created_by / created_at / updated_at | uuid / timestamptz | ثبت‌کننده و زمان‌ها |
| deleted_at | timestamptz | حذف نرم |

### `device_files`
| ستون | نوع | توضیح |
| --- | --- | --- |
| id | uuid PK | شناسه |
| device_id | uuid FK → devices | دستگاه |
| label | text | عنوان مسیر (مثل «بکاپ تصاویر») |
| path | text | مسیر کامل مرجع روی سرور |
| relative_path | text | مسیر نسبی داخل محل ذخیره‌سازی |
| client_path | text | مسیر قابل دسترس در کلاینت (UNC یا درایو نگاشت‌شده) |
| storage_location_id | uuid FK → storage_locations | محل ذخیره‌سازی (اختیاری) |
| storage_kind | text | `network` / `local` / `external` |
| category | text | root / original / backup / recovered / report / image / document / other |
| size_bytes | bigint | حجم محاسبه‌شده مسیر |
| backup_status | text | none / pending / in_progress / completed / failed |
| alternative_path | text | مسیر جایگزین پس از جابه‌جایی |
| access_status | text | unknown / ok / missing / unavailable |
| last_checked_at | timestamptz | آخرین بررسی دسترسی |
| is_primary | boolean | پوشه اصلی دستگاه (ایندکس یکتای جزئی) |
| related_operation_id | uuid FK → device_operations | اقدام مرتبط (اختیاری) |
| notes | text | توضیح |
| version | integer | شماره نسخه ردیف |
| created_by / created_at / updated_at | uuid / timestamptz | ثبت‌کننده و زمان‌ها |
| deleted_at | timestamptz | حذف نرم |

### `storage_locations`
| ستون | نوع | توضیح |
| --- | --- | --- |
| id | uuid PK | شناسه |
| name | text | نام محل (مثلاً «هارد بکاپ اصلی») |
| root_path | text | مسیر ریشه از دید سرور |
| client_root | text | مسیر ریشه قابل دسترس در کلاینت |
| kind | text | server / nas / external |
| drive_letter / volume_label / volume_id / host_name | text | شناسه‌های درایو، حافظه و میزبان |
| notes | text | محل نگهداری فیزیکی و توضیحات |
| is_default | boolean | محل ساخت پوشه دستگاه‌های جدید (یکتا با ایندکس جزئی) |
| is_active | boolean | قابل استفاده بودن |
| last_checked_at / last_success_at | timestamptz | آخرین بررسی و آخرین دسترسی موفق |
| last_check_ok / last_check_error | boolean / text | نتیجه و پیام آخرین سلامت‌سنجی |
| version | integer | کنترل تداخل |
| created_by / created_at / updated_at | uuid / timestamptz | ثبت‌کننده و زمان‌ها |
| deleted_at | timestamptz | حذف نرم |

### `storage_open_tickets`
| ستون | نوع | توضیح |
| --- | --- | --- |
| id | uuid PK | شناسه |
| token_hash | text UNIQUE | SHA-256 بلیت؛ مقدار خام ذخیره نمی‌شود |
| device_file_id | uuid FK → device_files | مسیر مبدأ (برای ریشه حافظه NULL) |
| path / client_path | text | مسیر مجاز snapshot‌شده در زمان صدور |
| requested_by | uuid FK → users | کاربر درخواست‌دهنده |
| expires_at / consumed_at | timestamptz | انقضا و زمان مصرف یک‌بارمصرف |
| created_at | timestamptz | زمان صدور |

### `device_images`
| ستون | نوع | توضیح |
| --- | --- | --- |
| id | uuid PK | شناسه |
| device_id | uuid FK → devices | دستگاه |
| original_name / mime_type / size_bytes | text / text / integer | فراداده فایل |
| storage_path | text | مسیر فایل در `UPLOADS_DIR` سرور |
| caption | text | توضیح تصویر |
| uploaded_by / created_at | uuid / timestamptz | بارگذار و زمان |

### `device_notes`
| ستون | نوع | توضیح |
| --- | --- | --- |
| id | uuid PK | شناسه |
| device_id | uuid FK → devices | دستگاه |
| body | text | متن یادداشت |
| created_by / created_by_name | uuid / text | نویسنده |
| created_at | timestamptz | زمان ثبت |

### `field_definitions`
| ستون | نوع | توضیح |
| --- | --- | --- |
| id | uuid PK | شناسه |
| entity | text | موجودیت هدف (پیش‌فرض `device`) |
| field_key | text | کلید ماشینی؛ یکتا در هر موجودیت |
| label_fa | text | برچسب فارسی |
| field_type | text | text / textarea / number / date / select / multi_select / checkbox / password |
| group_name | text | گروه نمایش در فرم |
| placeholder | text | راهنمای فیلد |
| is_system | boolean | فیلد اصلی؛ حذف نمی‌شود |
| is_enabled / is_required / is_locked | boolean | فعال، اجباری و غیرقابل تغییر |
| options | jsonb | گزینه‌های فیلدهای انتخابی |
| sort_order | integer | ترتیب نمایش |
| created_at / updated_at | timestamptz | زمان‌ها |

### `option_lists`
| ستون | نوع | توضیح |
| --- | --- | --- |
| id | uuid PK | شناسه |
| category | text | equipment_type / manufacturer / accessory / operation_type / lock_status |
| value_key | text | کلید ماشینی؛ یکتا در هر دسته |
| label_fa | text | برچسب فارسی |
| sort_order | integer | ترتیب نمایش |
| is_active | boolean | نمایش در فرم |
| is_system | boolean | گزینه پیش‌فرض |
| created_at / updated_at | timestamptz | زمان‌ها |

## مهاجرت‌ها

| فایل | محتوا |
| --- | --- |
| `001_initial_schema.sql` | جداول پایه، ایندکس‌ها، نقش‌ها و تنظیمات پیش‌فرض |
| `002_seed_system_roles.sql` | تعریف نقش‌های سیستمی و مجوزهای پیش‌فرض |
| `003_customers_devices.sql` | مشتریان، تجهیزات، تاریخچه وضعیت، اقدامات، فایل‌ها، تصاویر، یادداشت‌ها، تعریف فیلدها و فهرست گزینه‌ها |
| `004_storage_files.sql` | محل‌های ذخیره‌سازی، متادیتای فایل و بلیت بازکردن پوشه، تنظیمات پوشه و مجوز `files.view` |

## مجوزهای تعریف‌شده

`dashboard.view`، `users.view`، `users.manage`، `roles.view`، `roles.manage`، `settings.view`،
`settings.manage`، `audit.view`، `backups.manage`، `customers.view/manage`، `repairs.view/manage`،
`files.view`، `files.manage` و مجوزهای آینده: `inventory.view/manage`، `invoices.view/manage`،
`reports.view`.

نقش‌های پیش‌فرض: مدیر کل (`*`)، سرپرست تعمیرات، تکنسین، پذیرش، انباردار. ساخت نقش سفارشی با
انتخاب مجوزها نیز پشتیبانی می‌شود.

## قواعد نگهداری داده

1. حذف کاربران، نقش‌های سفارشی، مشتریان، دستگاه‌ها و اقدامات به‌صورت نرم انجام می‌شود؛ تاریخچه
   دست‌نخورده می‌ماند.
2. حذف نقش سیستمی یا نقشی که کاربر دارد مسدود است.
3. آخرین کاربر فعال با مجوز `users.manage` قابل غیرفعال‌سازی یا حذف نیست تا دسترسی مدیر از بین نرود.
4. مشتری دارای پرونده فعال قابل حذف نیست.
5. گزینه فهرستی که در پرونده‌ای استفاده شده، به‌جای حذف غیرفعال می‌شود.
6. تمام تغییرات ساختاری فقط از طریق مهاجرت افزایشی انجام می‌شود.
