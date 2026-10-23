-- مرحله ۴: داشبورد تحلیلی، گزارش‌گیری پیشرفته و قالب‌های ذخیره‌شده
-- توابع تبدیل تقویم شمسی در پایگاه داده، گروه‌بندی ماهانه/سالانه را بدون وابستگی
-- به منطقه زمانی کلاینت و بدون انتقال ردیف‌های خام به مرورگر انجام می‌دهند.

CREATE OR REPLACE FUNCTION ir_jalali_from_gregorian(gy integer, gm integer, gd integer)
RETURNS TABLE (jy integer, jm integer, jd integer)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  g_d_m integer[] := ARRAY[0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  gy2 integer;
  days integer;
  out_jy integer;
  out_jm integer;
  out_jd integer;
BEGIN
  gy2 := CASE WHEN gm > 2 THEN gy + 1 ELSE gy END;
  days := 355666 + (365 * gy) + ((gy2 + 3) / 4) - ((gy2 + 99) / 100)
          + ((gy2 + 399) / 400) + gd + g_d_m[gm];
  out_jy := -1595 + (33 * ((days + 3) / 12053));
  days := (days + 3) % 12053;
  out_jy := out_jy + (4 * (days / 1461));
  days := days % 1461;
  IF days > 365 THEN
    out_jy := out_jy + ((days - 1) / 365);
    days := (days - 1) % 365;
  END IF;
  IF days < 186 THEN
    out_jm := 1 + (days / 31);
    out_jd := 1 + (days % 31);
  ELSE
    out_jm := 7 + ((days - 186) / 30);
    out_jd := 1 + ((days - 186) % 30);
  END IF;
  RETURN QUERY SELECT out_jy, out_jm, out_jd;
END;
$$;

CREATE OR REPLACE FUNCTION ir_jalali_year(ts timestamptz)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT jy FROM ir_jalali_from_gregorian(
    EXTRACT(YEAR FROM ts AT TIME ZONE 'Asia/Tehran')::integer,
    EXTRACT(MONTH FROM ts AT TIME ZONE 'Asia/Tehran')::integer,
    EXTRACT(DAY FROM ts AT TIME ZONE 'Asia/Tehran')::integer
  );
$$;

CREATE OR REPLACE FUNCTION ir_jalali_month(ts timestamptz)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT jm FROM ir_jalali_from_gregorian(
    EXTRACT(YEAR FROM ts AT TIME ZONE 'Asia/Tehran')::integer,
    EXTRACT(MONTH FROM ts AT TIME ZONE 'Asia/Tehran')::integer,
    EXTRACT(DAY FROM ts AT TIME ZONE 'Asia/Tehran')::integer
  );
$$;

CREATE OR REPLACE FUNCTION ir_jalali_day(ts timestamptz)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT jd FROM ir_jalali_from_gregorian(
    EXTRACT(YEAR FROM ts AT TIME ZONE 'Asia/Tehran')::integer,
    EXTRACT(MONTH FROM ts AT TIME ZONE 'Asia/Tehran')::integer,
    EXTRACT(DAY FROM ts AT TIME ZONE 'Asia/Tehran')::integer
  );
$$;

CREATE OR REPLACE FUNCTION ir_jalali_ym(ts timestamptz)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT lpad(ir_jalali_year(ts)::text, 4, '0') || '-' || lpad(ir_jalali_month(ts)::text, 2, '0');
$$;

-- قالب‌های گزارش ذخیره‌شده (فیلترها، نمودارها، ستون‌ها و ترتیب نمایش)
CREATE TABLE saved_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  config jsonb NOT NULL,
  is_shared boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT saved_reports_name_not_empty CHECK (length(btrim(name)) > 0),
  CONSTRAINT saved_reports_config_is_object CHECK (jsonb_typeof(config) = 'object')
);
CREATE INDEX saved_reports_active_idx ON saved_reports (updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX saved_reports_owner_idx ON saved_reports (created_by) WHERE deleted_at IS NULL;

-- مجوز مدیریت گزارش‌های ذخیره‌شده برای نقش‌هایی که گزارش‌گیری دارند
UPDATE roles
   SET permissions = permissions || '["reports.manage"]'::jsonb,
       updated_at = now(),
       version = version + 1
 WHERE permissions @> '["reports.view"]'::jsonb
   AND NOT permissions @> '["reports.manage"]'::jsonb
   AND NOT permissions @> '["*"]'::jsonb;
