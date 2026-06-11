# Sets Cloudflare Pages secrets for auth email OTP.
# Run from repo root after Resend login:
#   .\scripts\resend-pages-secrets.ps1 -ApiKey "re_YOUR_KEY" -TestEmail "you@example.com"

param(
  [Parameter(Mandatory = $true)]
  [string]$ApiKey,

  [string]$FromEmail = 'Daily Grid <noreply@dailygrid.app>',

  [string]$SessionSecret = '',

  [string]$TestEmail = '',

  [string]$ProjectName = 'daily-grid'
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $RepoRoot

$Wrangler = Join-Path $RepoRoot 'node_modules\wrangler\bin\wrangler.js'
if (-not (Test-Path $Wrangler)) {
  throw "Wrangler not found. Run npm install in the repo root."
}

if (-not $SessionSecret) {
  $SessionSecret = -join ((48..57) + (97..102) | Get-Random -Count 64 | ForEach-Object { [char]$_ })
  # Use crypto-grade secret via node if available
  try {
    $SessionSecret = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  } catch { /* keep random fallback */ }
}

Write-Host ""
Write-Host "=== Cloudflare Pages secrets ===" -ForegroundColor Cyan
Write-Host "Project: $ProjectName"
Write-Host ""

function Set-PagesSecret($Name, $Value) {
  Write-Host "Setting $Name..." -ForegroundColor Gray
  $Value | node $Wrangler pages secret put $Name --project-name $ProjectName
}

Set-PagesSecret 'RESEND_API_KEY' $ApiKey
Set-PagesSecret 'AUTH_FROM_EMAIL' $FromEmail
Set-PagesSecret 'AUTH_SESSION_SECRET' $SessionSecret

Write-Host ""
Write-Host "Secrets set. AUTH_SESSION_SECRET was generated for this run." -ForegroundColor Green
Write-Host "(Save it somewhere safe if you need to rotate manually later.)" -ForegroundColor DarkGray
Write-Host ""

# Also store locally for CLI smoke test
$ResendExe = Join-Path $env:USERPROFILE '.resend\bin\resend.exe'
if (Test-Path $ResendExe) {
  & $ResendExe login --key $ApiKey | Out-Null
  Write-Host "Resend CLI configured." -ForegroundColor Green
}

if ($TestEmail) {
  Write-Host "Sending smoke-test email to $TestEmail..." -ForegroundColor Gray
  $env:RESEND_API_KEY = $ApiKey
  & $ResendExe emails send `
    --from $FromEmail `
    --to $TestEmail `
    --subject 'Daily Grid OTP test' `
    --text '123456 is your test code.'
  Write-Host "Smoke test sent." -ForegroundColor Green
}

Write-Host ""
Write-Host "Done. Deploy preview/main for /api/auth/* to return configured:true." -ForegroundColor Green
Write-Host ""
