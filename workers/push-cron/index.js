/**
 * push-cron Worker
 *
 * Fires on two schedules and POSTs to the Daily Grid Pages Function
 * to trigger push notifications.
 *
 * Cron schedules (wrangler.toml):
 *   "0 8 * * *"  → daily puzzle notification  (08:00 UTC = midnight PST)
 *   "59 3 * * *" → streak reminder             (03:59 UTC = 7:59 PM PST)
 *
 * Required secrets (set via: wrangler secret put <NAME>):
 *   PUSH_SECRET  — shared secret that authorises the POST request
 */

export default {
  async scheduled(event, env, ctx) {
    const isStreak = event.cron === '59 3 * * *';
    const type = isStreak ? 'streak' : 'daily';

    const url = `${env.SITE_URL}/api/push/send`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-push-secret': env.PUSH_SECRET,
        },
        body: JSON.stringify({ type }),
      });

      const body = await res.text();
      console.log(`[push-cron] type=${type} status=${res.status} body=${body}`);
    } catch (err) {
      console.error(`[push-cron] type=${type} error=${err.message}`);
    }
  },
};
