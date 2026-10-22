-- نقش‌های سیستمی و مجوزهای پیش‌فرض
INSERT INTO roles (key, name_fa, description, permissions, is_system) VALUES
  ('admin', 'مدیر کل', 'دسترسی کامل به تمام بخش‌های برنامه', '["*"]'::jsonb, true),
  ('supervisor', 'سرپرست تعمیرات', 'نظارت بر تعمیرات، مشتریان، انبار و گزارش‌ها',
   '["dashboard.view","users.view","roles.view","settings.view","audit.view","customers.view","customers.manage","repairs.view","repairs.manage","inventory.view","inventory.manage","invoices.view","invoices.manage","reports.view","files.manage"]'::jsonb, true),
  ('technician', 'تکنسین', 'ثبت و پیگیری تعمیرات دستگاه‌ها',
   '["dashboard.view","customers.view","repairs.view","repairs.manage","inventory.view","files.manage"]'::jsonb, true),
  ('receptionist', 'پذیرش', 'پذیرش دستگاه و مشتری و صدور فاکتور',
   '["dashboard.view","customers.view","customers.manage","repairs.view","repairs.manage","invoices.view","invoices.manage","files.manage"]'::jsonb, true),
  ('warehouse', 'انباردار', 'مدیریت قطعات و موجودی انبار',
   '["dashboard.view","inventory.view","inventory.manage","repairs.view"]'::jsonb, true)
ON CONFLICT (key) DO NOTHING;
