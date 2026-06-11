# Run this in Cursor's integrated terminal (Terminal > New Terminal):
#   cd "c:\Users\zacht\Documents\Repos\Daily Grid"
#   .\scripts\resend-login.ps1
#
# Or with an API key from https://resend.com/api-keys:
#   .\scripts\resend-login.ps1 -ApiKey "re_YOUR_KEY"

param(
  [string]$ApiKey
)

$ResendBin = Join-Path $env:USERPROFILE ".resend\bin"
$ResendExe = Join-Path $ResendBin "resend.exe"

if (-not (Test-Path $ResendExe)) {
  Write-Host "Resend CLI not found. Installing..." -ForegroundColor Yellow
  irm https://resend.com/install.ps1 | iex
}

$env:Path = "$ResendBin;$env:Path"

Write-Host ""
Write-Host "=== Daily Grid: Resend Login ===" -ForegroundColor Cyan
Write-Host ""

if ($ApiKey) {
  & $ResendExe login --key $ApiKey
} else {
  Write-Host "Opening interactive login (browser may open)..." -ForegroundColor Gray
  & $ResendExe login
}

Write-Host ""
Write-Host "Verifying..." -ForegroundColor Gray
& $ResendExe whoami

Write-Host ""
Write-Host "Next: set Cloudflare Pages secrets:" -ForegroundColor Green
Write-Host '  .\scripts\resend-pages-secrets.ps1 -ApiKey "re_YOUR_KEY"' -ForegroundColor White
Write-Host ""
