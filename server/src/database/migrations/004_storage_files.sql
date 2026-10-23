-- مرحله ۳: مدیریت فایل‌ها، محل‌های ذخیره‌سازی و پوشه خودکار دستگاه
-- مسیر مرجع، مسیر شبکه‌ای/کلاینتی، وضعیت دسترسی، حجم و پشتیبان‌گیری
-- برای هر مسیر ثبت می‌شود و تمام تغییرات در audit_logs نگهداری می‌شود.

-- محل‌های ذخیره‌سازی (دیسک سرور، NAS، حافظه خارجی)
CREATE TABLE storage_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  root_path text NOT NULL,
  client_root text,
  kind text NOT NULL DEFAULT 'server',
  drive_letter text,
  volume_label text,
  volume_id text,
  host_name text,
  notes text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_check_ok boolean,
  last_check_error text,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT storage_locations_kind_valid CHECK (kind IN ('server', 'nas', 'external')),
  CONSTRAINT storage_locations_name_not_empty CHECK (length(btrim(name)) > 0),
  CONSTRAINT storage_locations_root_not_empty CHECK (length(btrim(root_path)) > 0)
);
CREATE UNIQUE INDEX storage_locations_default_uq ON storage_locations (is_default)
  WHERE is_default AND deleted_at IS NULL;
CREATE INDEX storage_locations_active_idx ON storage_locations (is_active, created_at)
  WHERE deleted_at IS NULL;

-- گسترش مسیرهای فایل دستگاه با متادیتای ذخیره‌سازی
ALTER TABLE device_files
  ADD COLUMN storage_location_id uuid REFERENCES storage_locations (id) ON DELETE SET NULL,
  ADD COLUMN relative_path text,
  ADD COLUMN client_path text,
  ADD COLUMN category text NOT NULL DEFAULT 'other',
  ADD COLUMN size_bytes bigint,
  ADD COLUMN backup_status text NOT NULL DEFAULT 'none',
  ADD COLUMN alternative_path text,
  ADD COLUMN access_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN last_checked_at timestamptz,
  ADD COLUMN is_primary boolean NOT NULL DEFAULT false,
  ADD COLUMN version integer NOT NULL DEFAULT 1;

ALTER TABLE device_files
  ADD CONSTRAINT device_files_category_valid CHECK (
    category IN ('root', 'original', 'backup', 'recovered', 'report', 'image', 'document', 'other')
  ),
  ADD CONSTRAINT device_files_backup_status_valid CHECK (
    backup_status IN ('none', 'pending', 'in_progress', 'completed', 'failed')
  ),
  ADD CONSTRAINT device_files_access_status_valid CHECK (
    access_status IN ('unknown', 'ok', 'missing', 'unavailable')
  ),
  ADD CONSTRAINT device_files_size_non_negative CHECK (size_bytes IS NULL OR size_bytes >= 0);

CREATE UNIQUE INDEX device_files_primary_uq ON device_files (device_id)
  WHERE is_primary AND deleted_at IS NULL;
CREATE INDEX device_files_location_idx ON device_files (storage_location_id)
  WHERE deleted_at IS NULL;
CREATE INDEX device_files_access_idx ON device_files (access_status)
  WHERE deleted_at IS NULL;

-- بلیت یک‌بارمصرف بازکردن پوشه برای برنامه کمکی ویندوز
CREATE TABLE storage_open_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL,
  device_file_id uuid REFERENCES device_files (id) ON DELETE CASCADE,
  path text NOT NULL,
  client_path text,
  requested_by uuid REFERENCES users (id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX storage_open_tickets_token_uq ON storage_open_tickets (token_hash);
CREATE INDEX storage_open_tickets_expiry_idx ON storage_open_tickets (expires_at)
  WHERE consumed_at IS NULL;

-- تنظیمات ساختار پوشه و آستانه هشدار فضا
INSERT INTO app_settings (key, value) VALUES
  ('storage.folderLayout', '"{year}/{intakeCode}"'::jsonb),
  ('storage.subfolders',
   '["Original","Backup","Recovered","Reports","Images","Documents"]'::jsonb),
  ('storage.lowSpaceGb', '5'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- نقش‌هایی که اجازه مدیریت فایل دارند، اجازه مشاهده مسیرها را نیز دریافت می‌کنند
UPDATE roles
   SET permissions = permissions || '["files.view"]'::jsonb,
       updated_at = now()
 WHERE permissions @> '["files.manage"]'::jsonb
   AND NOT permissions @> '["files.view"]'::jsonb;
