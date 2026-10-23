# برنامه کمکی بازکردن پوشه — Repair Desk Helper

این برنامه سبک روی هر رایانه ویندوزی کلاینت نصب می‌شود تا دکمه «بازکردن پوشه» در مرورگر، مسیر
مجاز شبکه را با Explorer باز کند. برنامه وب به‌تنهایی نمی‌تواند به فایل‌سیستم کلاینت دسترسی داشته
باشد؛ این برنامه فقط نقش پل امن بین مرورگر و ویندوز را دارد.

## پیش‌نیاز

- Windows 10 یا 11 با Windows PowerShell 5.1 یا PowerShell 7
- دسترسی کاربر عادی (نصب per-user است و به Administrator نیاز ندارد)
- دسترسی شبکه‌ای کلاینت به مسیر مشترک، مثلاً `\\REPAIR-SERVER\RepairStorage`
- نگاشت درایو در صورت تمایل، مثلاً `Z: → \\REPAIR-SERVER\RepairStorage`

## نصب

فایل‌های این پوشه را روی کلاینت کپی کنید و در PowerShell اجرا کنید:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -ServerUrl "http://192.168.1.10:3000"
```

نصب‌کننده:

1. اسکریپت اجرا را در `%LOCALAPPDATA%\RepairDeskHelper` کپی می‌کند.
2. فایل `config.json` را با فهرست سرورهای مجاز می‌سازد.
3. پروتکل `repairdesk://` را در `HKCU\Software\Classes` ثبت می‌کند.

پس از نصب، یک‌بار مرورگر را ببندید و باز کنید. اگر مرورگر هنوز پروتکل را نمی‌شناسد، در Chrome
گزینه «Always allow» را برای بازکردن `repairdesk` انتخاب کنید.

## جریان امنیتی

```
مرورگر ──(۱) درخواست بازکردن پوشه با نشست کاربر──► سرور
سرور   ──(۲) بررسی مجوز + ساخت بلیت ۶۰ ثانیه‌ای ──► مرورگر
مرورگر ──(۳) repairdesk://open?server=...&token=... ──► برنامه کمکی
برنامه ──(۴) POST /api/storage/open-tickets/:token/consume ──► سرور
سرور   ──(۵) مسیر مجاز snapshot‌شده ──► برنامه کمکی
برنامه ──(۶) Start-Process explorer.exe ──► ویندوز
```

- بلیت تصادفی ۳۲ بایتی است، فقط هش آن در پایگاه داده ذخیره می‌شود، یک‌بارمصرف است و پس از ۶۰ ثانیه
  منقضی می‌شود.
- برنامه کمکی هیچ مسیری را از کاربر یا آرگومان دلخواه نمی‌پذیرد؛ فقط مسیری را باز می‌کند که سرور
  در پاسخ مصرف بلیت برگرداند.
- دامنه سرور باید در `allowedServers` فایل `config.json` باشد؛ در غیر این صورت درخواست رد می‌شود.
- تمام درخواست‌ها در `%LOCALAPPDATA%\RepairDeskHelper\helper.log` ثبت می‌شوند.

نمونه `config.json` بعد از نصب:

```json
{
  "allowedServers": ["http://192.168.1.10:3000"],
  "openWith": "explorer.exe",
  "logPath": "C:\\Users\\user\\AppData\\Local\\RepairDeskHelper\\helper.log"
}
```

## عیب‌یابی

| مشکل | بررسی |
| --- | --- |
| مرورگر برنامه را باز نمی‌کند | ثبت `repairdesk` در `HKCU:\Software\Classes\repairdesk` و بسته‌بودن قبلی مرورگر |
| پیام «سرور مجاز نیست» | `-ServerUrl` نصب باید دقیقاً همان آدرسی باشد که در مرورگر باز است |
| مسیر پیدا نشد | دسترسی کلاینت به مسیر شبکه/درایو نگاشت‌شده و روشن بودن هارد |
| بلیت منقضی شد | دکمه را دوباره بزنید؛ بلیت فقط ۶۰ ثانیه اعتبار دارد |
| خطای HTTP 401/403 | کاربر باید در سامانه وارد شده و مجوز `files.view` داشته باشد |

## حذف

```powershell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\RepairDeskHelper"
Remove-Item -Recurse -Force "HKCU:\Software\Classes\repairdesk"
```

> این برنامه در محیط توسعه لینوکسی ساخته و منطق سروری آن تست شده است؛ اجرای نهایی فایل‌های
> PowerShell باید روی یک کلاینت ویندوزی انجام شود.
