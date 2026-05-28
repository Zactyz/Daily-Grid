# Feedback → Google Sheets setup

Daily Grid sends feedback through `POST /api/feedback/submit`, which forwards to a Google Apps Script web app that appends rows to a spreadsheet.

## 1. Create the spreadsheet

1. Open [Google Sheets](https://sheets.google.com) and create a new sheet named **Daily Grid Feedback**.
2. Row 1 headers:

   `timestamp` | `anon_id` | `message` | `page` | `user_agent` | `pwa_mode`

## 2. Apps Script web app

1. In the sheet: **Extensions → Apps Script**.
2. Replace `Code.gs` with:

```javascript
const WEBHOOK_SECRET = 'REPLACE_WITH_A_LONG_RANDOM_SECRET';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.secret !== WEBHOOK_SECRET) {
      return jsonOut({ error: 'unauthorized' }, 401);
    }
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    sheet.appendRow([
      data.timestamp || new Date().toISOString(),
      data.anonId || '',
      data.message || '',
      data.page || '',
      data.userAgent || '',
      data.pwaMode || ''
    ]);
    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ error: String(err) }, 500);
  }
}

function jsonOut(obj, code) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. Set `WEBHOOK_SECRET` to a long random string (save it for Cloudflare).
4. **Deploy → New deployment → Web app**
   - Execute as: Me
   - Who has access: **Anyone**
5. Copy the deployment URL (ends with `/exec`).

## 3. Cloudflare Pages secrets

In Cloudflare Dashboard → Pages → **Daily Grid** → Settings → Environment variables (Production and Preview):

| Name | Value |
|------|--------|
| `GOOGLE_SHEETS_FEEDBACK_URL` | Apps Script web app URL |
| `FEEDBACK_WEBHOOK_SECRET` | Same as `WEBHOOK_SECRET` in Apps Script |

Or via CLI (preview example):

```powershell
npx wrangler pages secret put GOOGLE_SHEETS_FEEDBACK_URL --project-name daily-grid
npx wrangler pages secret put FEEDBACK_WEBHOOK_SECRET --project-name daily-grid
```

Redeploy the preview branch after secrets are set.

## 4. Test

```powershell
curl -X POST https://YOUR-PREVIEW.pages.dev/api/feedback/submit `
  -H "Content-Type: application/json" `
  -d '{"message":"Test from setup doc","anonId":"00000000-0000-4000-8000-000000000001","page":"/games/feedback/"}'
```

A new row should appear in the sheet.
