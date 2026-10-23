# دریافت لینک repairdesk://open?... از مرورگر، مصرف بلیت یک‌بارمصرف از سرور و بازکردن پوشه.
# این اسکریپت فقط مسیری را باز می‌کند که سرور پس از بررسی مجوز کاربر برگرداند.
param(
  [Parameter(Mandatory = $true)]
  [string]$Url
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$logPath = Join-Path $root "helper.log"

function Write-HelperLog([string]$message) {
  try {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`t$message"
    Add-Content -Path $logPath -Value $line -Encoding UTF8
  } catch {
    # ثبت خطا نباید مانع ادامه کار شود
  }
}

try {
  $configPath = Join-Path $root "config.json"
  if (-not (Test-Path -LiteralPath $configPath)) {
    throw "فایل config.json پیدا نشد. ابتدا install.ps1 را اجرا کنید."
  }
  $config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json

  $uri = [System.Uri]$Url
  if ($uri.Scheme -ne "repairdesk" -or $uri.Host -ne "open") {
    throw "لینک برنامه کمکی معتبر نیست."
  }

  $query = @{}
  foreach ($pair in $uri.Query.TrimStart("?").Split("&")) {
    if ([string]::IsNullOrWhiteSpace($pair)) { continue }
    $parts = $pair.Split("=", 2)
    $key = [System.Uri]::UnescapeDataString($parts[0])
    $value = if ($parts.Length -gt 1) { [System.Uri]::UnescapeDataString($parts[1]) } else { "" }
    $query[$key] = $value
  }

  $server = if ($query.ContainsKey("server")) { [string]$query["server"] } else { "" }
  $server = $server.TrimEnd("/")
  $token = if ($query.ContainsKey("token")) { [string]$query["token"] } else { "" }
  $allowed = @($config.allowedServers | ForEach-Object { $_.TrimEnd("/") })
  if ([string]::IsNullOrWhiteSpace($server) -or ($allowed -notcontains $server)) {
    throw "سرور درخواست‌دهنده در فهرست سرورهای مجاز برنامه کمکی نیست."
  }
  if ($token.Length -lt 20) {
    throw "بلیت بازکردن پوشه معتبر نیست."
  }

  $endpoint = "$server/api/storage/open-tickets/$([System.Uri]::EscapeDataString($token))/consume"
  $response = Invoke-RestMethod -Method Post -Uri $endpoint -ContentType "application/json" -TimeoutSec 15
  $target = [string]$response.preferredPath
  if ([string]::IsNullOrWhiteSpace($target)) {
    throw "سرور مسیری برای بازکردن برنگرداند."
  }
  if (-not (Test-Path -LiteralPath $target)) {
    throw "مسیر روی این رایانه در دسترس نیست: $target"
  }

  $openWith = if ($config.openWith) { [string]$config.openWith } else { "explorer.exe" }
  if (Test-Path -LiteralPath $target -PathType Container) {
    Start-Process -FilePath $openWith -ArgumentList "`"$target`""
  } else {
    Start-Process -FilePath $openWith -ArgumentList "/select,`"$target`""
  }
  Write-HelperLog "OPENED`t$target"
} catch {
  Write-HelperLog "ERROR`t$($_.Exception.Message)"
  # نمایش پیام کوتاه به کاربر؛ بازکردن پوشه انجام نمی‌شود.
  Add-Type -AssemblyName PresentationFramework -ErrorAction SilentlyContinue
  [System.Windows.MessageBox]::Show($_.Exception.Message, "Repair Desk Helper") | Out-Null
  exit 1
}
