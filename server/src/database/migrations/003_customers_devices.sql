-- مرحله ۲: مشتریان، تجهیزات، پذیرش و پرونده دیجیتال دستگاه
-- اطلاعات مشتری از تجهیز تفکیک شده است؛ هر مشتری چند دستگاه و هر دستگاه
-- چند اقدام، مسیر فایل، تصویر و یادداشت می‌تواند داشته باشد.

-- مشتریان (مالک دستگاه)
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text,
  phone_secondary text,
  job_title text,
  national_id text,
  address text,
  notes text,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT customers_name_not_empty CHECK (length(btrim(full_name)) > 0),
  CONSTRAINT customers_phone_not_empty CHECK (phone IS NULL OR length(btrim(phone)) > 0)
);
CREATE INDEX customers_name_idx ON customers (lower(full_name)) WHERE deleted_at IS NULL;
CREATE INDEX customers_phone_idx ON customers (phone) WHERE deleted_at IS NULL;

-- شمارنده کد پذیرش به تفکیک سال شمسی
CREATE TABLE intake_counters (
  scope text PRIMARY KEY,
  last_value integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- دستگاه / پرونده پذیرش
CREATE TABLE devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_code text NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers (id),
  brought_by_name text NOT NULL,
  brought_by_job text,
  brought_by_phone text,
  equipment_type text NOT NULL,
  manufacturer text,
  model text,
  serial_number text,
  imei1 text,
  imei2 text,
  received_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  physical_condition text,
  accessories jsonb NOT NULL DEFAULT '[]'::jsonb,
  lock_status text NOT NULL DEFAULT 'unknown',
  device_password_cipher text,
  reported_problem text NOT NULL,
  notes text,
  technician_id uuid REFERENCES users (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'received',
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT devices_status_valid CHECK (status IN (
    'received', 'pending_review', 'reviewing', 'awaiting_customer', 'in_progress',
    'awaiting_part', 'done', 'failed', 'unrepairable', 'ready_delivery',
    'delivered', 'cancelled'
  )),
  CONSTRAINT devices_accessories_is_array CHECK (jsonb_typeof(accessories) = 'array'),
  CONSTRAINT devices_custom_fields_is_object CHECK (jsonb_typeof(custom_fields) = 'object'),
  CONSTRAINT devices_problem_not_empty CHECK (length(btrim(reported_problem)) > 0)
);
CREATE UNIQUE INDEX devices_intake_code_uq ON devices (intake_code);
CREATE INDEX devices_customer_idx ON devices (customer_id, received_at DESC);
CREATE INDEX devices_status_idx ON devices (status, received_at DESC);
CREATE INDEX devices_received_idx ON devices (received_at DESC);
CREATE INDEX devices_due_idx ON devices (due_at) WHERE due_at IS NOT NULL;
CREATE INDEX devices_technician_idx ON devices (technician_id);
CREATE INDEX devices_imei1_idx ON devices (imei1) WHERE imei1 IS NOT NULL;
CREATE INDEX devices_imei2_idx ON devices (imei2) WHERE imei2 IS NOT NULL;
CREATE INDEX devices_serial_idx ON devices (serial_number) WHERE serial_number IS NOT NULL;

-- تاریخچه تغییر وضعیت (تغییرناپذیر)
CREATE TABLE device_status_history (
  id bigserial PRIMARY KEY,
  device_id uuid NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  note text,
  changed_by uuid REFERENCES users (id) ON DELETE SET NULL,
  changed_by_name text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX device_status_history_device_idx ON device_status_history (device_id, changed_at DESC);

-- اقدامات انجام‌شده روی دستگاه
CREATE TABLE device_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  operation_type text NOT NULL,
  title text NOT NULL,
  performed_at timestamptz NOT NULL DEFAULT now(),
  technician_id uuid REFERENCES users (id) ON DELETE SET NULL,
  technician_name text,
  description text,
  data_size_bytes bigint,
  storage_path text,
  result text NOT NULL DEFAULT 'success',
  device_status_after text,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT device_operations_result_valid CHECK (result IN ('success', 'partial', 'failed'))
);
CREATE INDEX device_operations_device_idx ON device_operations (device_id, performed_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX device_operations_type_idx ON device_operations (operation_type) WHERE deleted_at IS NULL;

-- مسیرهای ذخیره‌سازی فایل‌های هر دستگاه
CREATE TABLE device_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  label text NOT NULL,
  path text NOT NULL,
  storage_kind text NOT NULL DEFAULT 'network',
  related_operation_id uuid REFERENCES device_operations (id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT device_files_kind_valid CHECK (storage_kind IN ('network', 'local', 'external'))
);
CREATE INDEX device_files_device_idx ON device_files (device_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- یادداشت‌های تکنسین
CREATE TABLE device_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  body text NOT NULL,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT device_notes_body_not_empty CHECK (length(btrim(body)) > 0)
);
CREATE INDEX device_notes_device_idx ON device_notes (device_id, created_at DESC);

-- تصاویر دستگاه (فایل روی سرور مرکزی ذخیره می‌شود)
CREATE TABLE device_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  storage_path text NOT NULL,
  caption text,
  uploaded_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX device_images_device_idx ON device_images (device_id, created_at DESC);

-- تعریف فیلدهای فرم پذیرش (قابل افزودن، غیرفعال‌سازی و مرتب‌سازی توسط مدیر)
CREATE TABLE field_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity text NOT NULL DEFAULT 'device',
  field_key text NOT NULL,
  label_fa text NOT NULL,
  field_type text NOT NULL DEFAULT 'text',
  group_name text NOT NULL DEFAULT 'مشخصات دستگاه',
  placeholder text,
  is_system boolean NOT NULL DEFAULT false,
  is_enabled boolean NOT NULL DEFAULT true,
  is_required boolean NOT NULL DEFAULT false,
  is_locked boolean NOT NULL DEFAULT false,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT field_definitions_type_valid CHECK (field_type IN (
    'text', 'textarea', 'number', 'date', 'select', 'multi_select', 'checkbox', 'password'
  )),
  CONSTRAINT field_definitions_options_is_array CHECK (jsonb_typeof(options) = 'array'),
  CONSTRAINT field_definitions_label_not_empty CHECK (length(btrim(label_fa)) > 0)
);
CREATE UNIQUE INDEX field_definitions_entity_key_uq ON field_definitions (entity, field_key);
CREATE INDEX field_definitions_order_idx ON field_definitions (entity, sort_order, created_at);

-- فهرست‌های قابل مدیریت (نوع تجهیز، سازنده، لوازم همراه، نوع اقدام، وضعیت قفل)
CREATE TABLE option_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  value_key text NOT NULL,
  label_fa text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT option_lists_label_not_empty CHECK (length(btrim(label_fa)) > 0)
);
CREATE UNIQUE INDEX option_lists_category_key_uq ON option_lists (category, value_key);
CREATE INDEX option_lists_category_idx ON option_lists (category, sort_order);

INSERT INTO option_lists (category, value_key, label_fa, sort_order, is_system) VALUES
  ('equipment_type', 'mobile', 'موبایل', 10, true),
  ('equipment_type', 'tablet', 'تبلت', 20, true),
  ('equipment_type', 'laptop', 'لپ‌تاپ', 30, true),
  ('equipment_type', 'hdd', 'هارد دیسک', 40, true),
  ('equipment_type', 'flash', 'فلش مموری', 50, true),
  ('equipment_type', 'nvr', 'دستگاه NVR', 60, true),
  ('equipment_type', 'dvr', 'دستگاه DVR', 70, true),
  ('equipment_type', 'console', 'کنسول بازی', 80, true),
  ('equipment_type', 'other', 'سایر تجهیزات', 90, true),

  ('manufacturer', 'samsung', 'سامسونگ', 10, true),
  ('manufacturer', 'xiaomi', 'شیائومی', 20, true),
  ('manufacturer', 'apple', 'اپل', 30, true),
  ('manufacturer', 'lenovo', 'لنوو', 40, true),
  ('manufacturer', 'hp', 'اچ‌پی', 50, true),
  ('manufacturer', 'asus', 'ایسوس', 60, true),
  ('manufacturer', 'dell', 'دل', 70, true),
  ('manufacturer', 'huawei', 'هواوی', 80, true),
  ('manufacturer', 'honor', 'آنر', 90, true),
  ('manufacturer', 'realme', 'ریلمی', 100, true),
  ('manufacturer', 'oppo', 'اوپو', 110, true),
  ('manufacturer', 'nokia', 'نوکیا', 120, true),
  ('manufacturer', 'sony', 'سونی', 130, true),
  ('manufacturer', 'lg', 'ال‌جی', 140, true),
  ('manufacturer', 'tcl', 'تی‌سی‌ال', 150, true),
  ('manufacturer', 'acer', 'ایسر', 160, true),
  ('manufacturer', 'msi', 'ام‌اس‌آی', 170, true),
  ('manufacturer', 'toshiba', 'توشیبا', 180, true),
  ('manufacturer', 'western_digital', 'وسترن دیجیتال', 190, true),
  ('manufacturer', 'seagate', 'سیگیت', 200, true),
  ('manufacturer', 'kingston', 'کینگستون', 210, true),
  ('manufacturer', 'sandisk', 'سندیسک', 220, true),
  ('manufacturer', 'hikvision', 'هایک‌ویژن', 230, true),
  ('manufacturer', 'dahua', 'داهوا', 240, true),
  ('manufacturer', 'other', 'سایر برندها', 250, true),

  ('accessory', 'charger', 'شارژر', 10, true),
  ('accessory', 'cable', 'کابل', 20, true),
  ('accessory', 'bag', 'کیف', 30, true),
  ('accessory', 'sim', 'سیم‌کارت', 40, true),
  ('accessory', 'memory_card', 'کارت حافظه', 50, true),
  ('accessory', 'hard_drive', 'هارد اکسترنال', 60, true),
  ('accessory', 'adapter', 'آداپتور', 70, true),
  ('accessory', 'remote', 'ریموت', 80, true),
  ('accessory', 'power_supply', 'منبع تغذیه', 90, true),
  ('accessory', 'other', 'سایر لوازم', 100, true),

  ('operation_type', 'backup', 'بکاپ گرفتن', 10, true),
  ('operation_type', 'format', 'فرمت کردن', 20, true),
  ('operation_type', 'data_recovery', 'ریکاوری اطلاعات', 30, true),
  ('operation_type', 'data_transfer', 'انتقال اطلاعات', 40, true),
  ('operation_type', 'windows_install', 'نصب ویندوز', 50, true),
  ('operation_type', 'flash_update', 'فلش و آپدیت', 60, true),
  ('operation_type', 'hardware_repair', 'تعمیر سخت‌افزاری', 70, true),
  ('operation_type', 'software_repair', 'تعمیر نرم‌افزاری', 80, true),
  ('operation_type', 'memory_test', 'تست سلامت حافظه', 90, true),
  ('operation_type', 'part_replacement', 'تعویض قطعه', 100, true),
  ('operation_type', 'other', 'سایر عملیات', 110, true),

  ('lock_status', 'unlocked', 'بدون قفل', 10, true),
  ('lock_status', 'pin', 'رمز عددی (PIN)', 20, true),
  ('lock_status', 'pattern', 'الگو', 30, true),
  ('lock_status', 'password', 'رمز عبور', 40, true),
  ('lock_status', 'biometric', 'قفل بیومتریک', 50, true),
  ('lock_status', 'icloud', 'قفل iCloud', 60, true),
  ('lock_status', 'google', 'قفل حساب گوگل', 70, true),
  ('lock_status', 'frp', 'قفل FRP', 80, true),
  ('lock_status', 'unknown', 'نامشخص', 90, true)
ON CONFLICT (category, value_key) DO NOTHING;

INSERT INTO field_definitions
  (field_key, label_fa, field_type, group_name, placeholder, is_system, is_enabled, is_required, is_locked, sort_order)
VALUES
  ('intake_code', 'کد پذیرش', 'text', 'مشخصات دستگاه', 'به‌صورت خودکار تولید می‌شود', true, true, true, true, 10),
  ('equipment_type', 'نوع تجهیز', 'select', 'مشخصات دستگاه', NULL, true, true, true, true, 20),
  ('manufacturer', 'سازنده', 'select', 'مشخصات دستگاه', NULL, true, true, false, false, 30),
  ('model', 'مدل دقیق دستگاه', 'text', 'مشخصات دستگاه', 'مثلاً Galaxy A54', true, true, true, false, 40),
  ('serial_number', 'شماره سریال', 'text', 'مشخصات دستگاه', NULL, true, true, false, false, 50),
  ('imei1', 'IMEI 1', 'text', 'مشخصات دستگاه', '۱۵ رقم', true, true, false, false, 60),
  ('imei2', 'IMEI 2', 'text', 'مشخصات دستگاه', '۱۵ رقم', true, true, false, false, 70),
  ('brought_by_name', 'نام آورنده', 'text', 'مشخصات آورنده', NULL, true, true, true, true, 80),
  ('brought_by_job', 'نوع شغل آورنده', 'text', 'مشخصات آورنده', NULL, true, true, false, false, 90),
  ('brought_by_phone', 'شماره تماس آورنده', 'text', 'مشخصات آورنده', NULL, true, true, true, true, 100),
  ('received_at', 'زمان دریافت دستگاه', 'date', 'وضعیت و زمان', NULL, true, true, true, true, 110),
  ('due_at', 'تاریخ تحویل پیش‌بینی‌شده', 'date', 'وضعیت و زمان', NULL, true, true, false, false, 120),
  ('status', 'وضعیت فعلی', 'select', 'وضعیت و زمان', NULL, true, true, true, true, 130),
  ('physical_condition', 'وضعیت ظاهری دستگاه', 'textarea', 'وضعیت دستگاه', 'خط و خش، شکستگی و آسیب‌ها', true, true, false, false, 140),
  ('accessories', 'لوازم همراه', 'multi_select', 'وضعیت دستگاه', NULL, true, true, false, false, 150),
  ('lock_status', 'وضعیت قفل دستگاه', 'select', 'وضعیت دستگاه', NULL, true, true, false, false, 160),
  ('device_password', 'رمز یا الگوی دستگاه', 'password', 'وضعیت دستگاه', 'اختیاری — رمزنگاری‌شده ذخیره می‌شود', true, true, false, false, 170),
  ('reported_problem', 'مشکل اعلام‌شده توسط مشتری', 'textarea', 'اطلاعات تکمیلی', NULL, true, true, true, true, 180),
  ('technician_id', 'تکنسین مسئول', 'select', 'اطلاعات تکمیلی', NULL, true, true, false, false, 190),
  ('notes', 'توضیحات تکمیلی', 'textarea', 'اطلاعات تکمیلی', NULL, true, true, false, false, 200)
ON CONFLICT (entity, field_key) DO NOTHING;

-- تنظیمات پیش‌فرض مربوط به پذیرش
INSERT INTO app_settings (key, value) VALUES
  ('devices.intakePrefix', '"MR"'::jsonb),
  ('devices.defaultDueDays', '3'::jsonb)
ON CONFLICT (key) DO NOTHING;
