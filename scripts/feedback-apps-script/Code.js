/**
 * Daily Grid feedback webhook — bound to your "Daily Grid Feedback" spreadsheet.
 * WEBHOOK_SECRET is replaced by scripts/setup-feedback-integration.js before push.
 */
const WEBHOOK_SECRET = '__FEEDBACK_WEBHOOK_SECRET__';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.secret !== WEBHOOK_SECRET) {
      return jsonOut({ error: 'unauthorized' });
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
    return jsonOut({ error: String(err) });
  }
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
