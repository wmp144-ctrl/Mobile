-- مرحله ۶: وضعیت‌های دستگاه قابل تعریف توسط مدیر
-- وضعیت‌های پیش‌فرض سامانه به فهرست گزینه‌ها منتقل می‌شوند تا برچسب آن‌ها یک منبع
-- واحد داشته باشد؛ مدیر می‌تواند وضعیت سفارشی جدید اضافه کند. اطلاعات دستگاه‌ها
-- با تغییر یا غیرفعال‌شدن یک وضعیت حذف نمی‌شود.

-- حذف محدودیت ثابت وضعیت‌ها؛ اعتبارسنجی در لایه سرویس انجام می‌شود.
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_status_valid;

INSERT INTO option_lists (category, value_key, label_fa, sort_order, is_active, is_system) VALUES
  ('device_status', 'received', 'دریافت شده', 10, true, true),
  ('device_status', 'pending_review', 'در انتظار بررسی', 20, true, true),
  ('device_status', 'reviewing', 'در حال بررسی', 30, true, true),
  ('device_status', 'awaiting_customer', 'در انتظار تأیید مشتری', 40, true, true),
  ('device_status', 'in_progress', 'در حال انجام', 50, true, true),
  ('device_status', 'awaiting_part', 'منتظر قطعه', 60, true, true),
  ('device_status', 'done', 'انجام شده', 70, true, true),
  ('device_status', 'failed', 'ناموفق', 80, true, true),
  ('device_status', 'unrepairable', 'غیرقابل تعمیر', 90, true, true),
  ('device_status', 'ready_delivery', 'آماده تحویل', 100, true, true),
  ('device_status', 'delivered', 'تحویل داده شده', 110, true, true),
  ('device_status', 'cancelled', 'انصراف مشتری', 120, true, true)
ON CONFLICT (category, value_key) DO NOTHING;

CREATE INDEX option_lists_device_status_idx
  ON option_lists (sort_order)
  WHERE category = 'device_status';
