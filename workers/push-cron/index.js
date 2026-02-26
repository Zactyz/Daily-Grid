/**
 * push-cron Worker
 *
 * Fires on schedules and POSTs to Daily Grid Pages Functions.
 *
 * Cron schedules (wrangler.toml):
 *   "0 8 * * *"      → daily puzzle notification   (08:00 UTC)
 *   "59 3 * * *"     → streak reminder              (03:59 UTC)
 *   "0 18 * * SUN"   → weekly win-back reminder     (18:00 UTC Sunday)
 *   "30 18 * * SUN"  → weekly telemetry cleanup      (18:30 UTC Sunday)
 *
 * Required secrets (set via: wrangler secret put <NAME>):
 *   PUSH_SECRET  — shared secret that authorises the POST request
 */

export default {
  async scheduled(event, env, ctx) {
    let type = 'daily';
    let endpoint = '/api/push/send';
    let body = { type: 'daily' };

    if (event.cron === '59 3 * * *') {
      type = 'streak';
      body = { type: 'streak' };
    } else if (event.cron === '0 18 * * SUN') {
      type = 'winback';
      body = { type: 'winback' };
    } else if (event.cron === '30 18 * * SUN') {
      type = 'cleanup';
      endpoint = '/api/push/cleanup';
      body = { days: 90, source: 'cron' };
    }

    const url = `${env.SITE_URL}${endpoint}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-push-secret': env.PUSH_SECRET,
        },
        body: JSON.stringify(body),
      });

      const text = await res.text();
      console.log(`[push-cron] type=${type} endpoint=${endpoint} status=${res.status} body=${text}`);
    } catch (err) {
      console.error(`[push-cron] type=${type} endpoint=${endpoint} error=${err.message}`);
    }
  },
};
