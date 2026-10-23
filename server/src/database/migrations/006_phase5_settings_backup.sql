-- مرحله ۵: تنظیمات کامل، توسعه‌پذیری فرم‌ها و پشتیبان‌گیری/بازیابی
-- این مهاجرت افزایشی است و اطلاعات موجود را حذف نمی‌کند.

-- ۱) انواع جدید فیلد سفارشی (تاریخ و ساعت، فایل، مبلغ) و پرچم‌های جست‌وجو/گزارش
ALTER TABLE field_definitions DROP CONSTRAINT field_definitions_type_valid;
ALTER TABLE field_definitions
  ADD CONSTRAINT field_definitions_type_valid CHECK (field_type IN (
    'text', 'textarea', 'number', 'amount', 'date', 'datetime',
    'select', 'multi_select', 'checkbox', 'file', 'password'
  ));

ALTER TABLE field_definitions
  ADD COLUMN is_searchable boolean NOT NULL DEFAULT true,
  ADD COLUMN is_reportable boolean NOT NULL DEFAULT true;

-- فیلدهای از کار افتاده اطلاعات قبلی را نگه می‌دارند؛ حذف فیزیکی انجام نمی‌شود.
CREATE INDEX field_definitions_searchable_idx
  ON field_definitions (entity)
  WHERE is_searchable AND is_enabled;

-- ۲) تنظیمات عمومی، تاریخ/ساعت، ظاهر و پشتیبان‌گیری
INSERT INTO app_settings (key, value) VALUES
  ('app.language', '"fa"'::jsonb),
  ('app.calendar', '"jalali"'::jsonb),
  ('app.timezone', '"Asia/Tehran"'::jsonb),
  ('app.timeFormat', '"24"'::jsonb),
  ('app.theme', '"light"'::jsonb),
  ('app.accentColor', '"blue"'::jsonb),
  ('backup.directory', '""'::jsonb),
  ('backup.scheduleEnabled', 'false'::jsonb),
  ('backup.scheduleTime', '"03:00"'::jsonb),
  ('backup.encrypt', 'true'::jsonb),
  ('backup.includeSettings', 'true'::jsonb),
  ('backup.includeFiles', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ۳) تاریخچه اجرای پشتیبان‌گیری و بازیابی (آخرین موفقیت/شکست و هشدارها)
CREATE TABLE backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_name text NOT NULL,
  operation text NOT NULL DEFAULT 'backup',
  trigger_source text NOT NULL DEFAULT 'manual',
  status text NOT NULL,
  encrypted boolean NOT NULL DEFAULT false,
  includes_files boolean NOT NULL DEFAULT false,
  duration_ms integer,
  error text,
  metadata jsonb,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT backup_runs_operation_valid CHECK (operation IN ('backup', 'restore')),
  CONSTRAINT backup_runs_trigger_valid CHECK (trigger_source IN ('manual', 'scheduled', 'pre_restore')),
  CONSTRAINT backup_runs_status_valid CHECK (status IN ('success', 'failed'))
);
CREATE INDEX backup_runs_created_idx ON backup_runs (created_at DESC);
CREATE INDEX backup_runs_status_idx ON backup_runs (status, created_at DESC);
