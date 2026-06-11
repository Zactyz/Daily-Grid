# Resend setup for Daily Grid auth emails

## 1. Resend CLI (local dev)

CLI is installed to `C:\Users\zacht\.resend\bin\resend.exe`.

In an **interactive** terminal (Cursor terminal or PowerShell):

```powershell
$env:Path = "C:\Users\zacht\.resend\bin;" + $env:Path
resend login
```

Or paste an API key directly:

```powershell
resend login --key re_YOUR_KEY_HERE
```

## 2. Resend dashboard

1. Sign in at https://resend.com
2. Add domain **dailygrid.app** and add DNS records in Cloudflare
3. Create an API key (Sending access)

## 3. Cloudflare Pages secrets (production)

```powershell
cd "c:\Users\zacht\Documents\Repos\Daily Grid"
node node_modules/wrangler/bin/wrangler.js pages secret put RESEND_API_KEY --project-name daily-grid
node node_modules/wrangler/bin/wrangler.js pages secret put AUTH_FROM_EMAIL --project-name daily-grid
node node_modules/wrangler/bin/wrangler.js pages secret put AUTH_SESSION_SECRET --project-name daily-grid
```

Suggested values:

- `AUTH_FROM_EMAIL` = `Daily Grid <noreply@dailygrid.app>` (production, after domain verify)
- For testing before domain verify: `Daily Grid <onboarding@resend.dev>`
- **Test sender limit:** `onboarding@resend.dev` only delivers to the **exact email on your Resend account** (not Gmail `+alias` addresses). Use `zachtyz@gmail.com` for preview tests until `dailygrid.app` is verified.
- `AUTH_SESSION_SECRET` = random 32+ char string (generate once, keep secret)

**Never commit your API key to the repo.** Use Pages secrets only. The app reads it via `env.RESEND_API_KEY` in [`functions/_shared/resend.js`](../functions/_shared/resend.js).

## 4. Apply auth D1 migration

```powershell
node node_modules/wrangler/bin/wrangler.js d1 execute daily-grid-db --remote --file=scripts/migrate-auth-tables.sql
node node_modules/wrangler/bin/wrangler.js d1 execute daily-grid-db --remote --file=scripts/migrate-auth-user-id-columns.sql
node node_modules/wrangler/bin/wrangler.js d1 execute daily-grid-db --remote --file=scripts/migrate-friendships.sql
```

Note: `migrate-auth-user-id-columns.sql` fails if columns already exist. Run once only.

### Preview environment (required for `*.pages.dev` testing)

Production secrets from `wrangler pages secret put` do **not** apply to Preview. Copy the same three auth secrets to Preview:

**Dashboard:** Workers & Pages → daily-grid → Settings → Environment variables → **Preview** (encrypt each)

**Or script** (uses wrangler OAuth or `CLOUDFLARE_API_TOKEN`):

```powershell
$env:RESEND_API_KEY = "re_YOUR_KEY"
$env:AUTH_FROM_EMAIL = "Daily Grid <onboarding@resend.dev>"
$env:AUTH_SESSION_SECRET = "your-session-secret-hex"
node scripts/add-preview-auth-secrets.js
```

Redeploy the preview branch after updating.

## 5. Smoke test

```powershell
resend emails send --from "Daily Grid <noreply@dailygrid.app>" --to YOUR_EMAIL --subject "Daily Grid OTP test" --text "123456"
```

## SMS OTP (not via Resend)

Resend is **email only**. It does not send SMS/text messages.

If you want phone OTP later, add a separate provider (e.g. **Twilio Verify**, **AWS SNS**, **Vonage**). Tradeoffs vs email:

| | Email (Resend) | SMS (Twilio, etc.) |
|--|----------------|---------------------|
| Cost at low volume | Free tier (100/day) | ~$0.01–0.05 per message |
| Setup | Domain DNS verify | Phone number + carrier rules |
| PII | Email address | Phone number (often more sensitive) |
| UX | Check inbox | Faster on mobile, no app switch |

Recommendation: ship **email OTP first** (already implemented). Add SMS only if users ask for it; it doubles auth code paths, rate limits, and compliance surface for modest UX gain in a casual puzzle app.
