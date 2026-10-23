# نصب برنامه کمکی بازکردن پوشه‌ها روی ویندوز (بدون نیاز به دسترسی مدیر)
# اجرا:
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -ServerUrl "http://192.168.1.10:3000"
param(
  [Parameter(Mandatory = $false)]
  [string]$ServerUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"

$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$targetDir = Join-Path $env:LOCALAPPDATA "RepairDeskHelper"
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

Copy-Item -Force (Join-Path $source "open-folder.ps1") (Join-Path $targetDir "open-folder.ps1")

$cleanServer = $ServerUrl.TrimEnd('/')
$config = [ordered]@{
  allowedServers = @($cleanServer)
  openWith       = "explorer.exe"
  logPath        = (Join-Path $targetDir "helper.log")
}
$config | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $targetDir "config.json")

$scriptPath = Join-Path $targetDir "open-folder.ps1"
$command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`" `"%1`""

$protocolRoot = "HKCU:\Software\Classes\repairdesk"
New-Item -Force -Path $protocolRoot | Out-Null
Set-ItemProperty -Path $protocolRoot -Name "(Default)" -Value "Repair Desk Open Folder"
Set-ItemProperty -Path $protocolRoot -Name "URL Protocol" -Value ""
New-Item -Force -Path "$protocolRoot\DefaultIcon" | Out-Null
Set-ItemProperty -Path "$protocolRoot\DefaultIcon" -Name "(Default)" -Value "$env:SystemRoot\System32\shell32.dll,3"
New-Item -Force -Path "$protocolRoot\shell\open\command" | Out-Null
Set-ItemProperty -Path "$protocolRoot\shell\open\command" -Name "(Default)" -Value $command

Write-Host "برنامه کمکی با موفقیت نصب شد." -ForegroundColor Green
Write-Host "سرور مجاز: $cleanServer"
Write-Host "مسیر نصب: $targetDir"
Write-Host "برای آزمایش، در سامانه روی «بازکردن پوشه» کلیک کنید."
