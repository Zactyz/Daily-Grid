/**
 * POST /api/push/send  (also triggered by Cloudflare Cron)
 *
 * Sends push notifications to all subscribers.
 * Two notification types dispatched via cron expression:
 *   "0 8 * * *"  → Daily: "Today's puzzles are live!" (08:00 UTC = midnight PST)
 *   "59 3 * * *" → Streak reminder: "Complete your puzzles!" (03:59 UTC = 7:59 PM PST)
 *
 * wrangler.toml:
 *   [triggers]
 *   crons = ["0 8 * * *", "59 3 * * *"]
 *
 * Environment variables required (Cloudflare secrets):
 *   VAPID_PUBLIC_KEY   - base64url P-256 public key
 *   VAPID_PRIVATE_KEY  - base64url P-256 private key
 *   VAPID_SUBJECT      - mailto:you@example.com or https://dailygrid.app
 *   PUSH_SECRET        - shared secret to authorise manual POSTs
 */

import { handleOptions, methodNotAllowed, jsonOk, jsonError, internalError, validateEnv } from '../../_shared/api-helpers.js';
import { sendPushNotification } from '../../_shared/vapid.js';

const BATCH_SIZE = 100;

// All game score tables — used to detect whether a subscriber has played today.
const GAME_TABLES = [
  'snake_scores', 'pathways_scores', 'lattice_scores', 'bits_scores',
  'hashi_scores', 'shikaku_scores', 'conduit_scores', 'perimeter_scores', 'polyfit_scores',
];

/** Returns date in YYYY-MM-DD format in America/Los_Angeles time. */
function getPTDateYYYYMMDD(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  return `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}-${parts.find(p => p.type === 'day').value}`;
}

/** Returns YYYY-MM-DD for N days ago in PT. */
function getPTDateDaysAgo(daysAgo) {
  return getPTDateYYYYMMDD(new Date(Date.now() - (daysAgo * 24 * 60 * 60 * 1000)));
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') return methodNotAllowed('POST');

  // Guard with a shared secret so only trusted callers can trigger manually
  const secret = request.headers.get('x-push-secret');
  if (!env.PUSH_SECRET || secret !== env.PUSH_SECRET) {
    return jsonError('Unauthorized', 401);
  }

  try {
    validateEnv(env);

    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
      return jsonError('VAPID secrets not configured', 500);
    }

    // Allow manual triggering of either notification type for testing
    const body = await request.json().catch(() => ({}));
    const type = body.type || 'daily';

    if (type === 'streak') {
      const result = await triggerStreakReminder(env);
      return jsonOk(result);
    }

    if (type === 'winback') {
      const result = await triggerWinback(env);
      return jsonOk(result);
    }

    const result = await triggerPush(env);
    return jsonOk(result);
  } catch (err) {
    return internalError(err, 'Push send');
  }
}

// Cloudflare Cron trigger handler
// wrangler.toml:  [triggers]
//                 crons = ["0 8 * * *", "59 3 * * *"]
export async function scheduled(event, env, ctx) {
  // "59 3 * * *" = 03:59 UTC = 7:59 PM PST / 8:59 PM PDT  → streak reminder
  // "0 8 * * *"  = 08:00 UTC = midnight PST / 1 AM PDT     → daily notification
  if (event.cron === '59 3 * * *') {
    ctx.waitUntil(triggerStreakReminder(env));
  } else {
    ctx.waitUntil(triggerPush(env));
  }
}

// ─── Daily notification ───────────────────────────────────────────────────────

async function triggerPush(env) {
  try {
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
      console.error('[triggerPush] VAPID secrets not configured');
      return { sent: 0, failed: 0, expired: 0 };
    }

    const vapid = {
      publicKey:  env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
      subject:    env.VAPID_SUBJECT,
    };

    const notification = {
      title: 'Daily Grid',
      body:  "Today's puzzles are live!",
      icon:  '/games/assets/dg-games-192.png',
      badge: '/games/assets/dg-games-192.png',
      tag:   'daily-grid-daily',
      url:   '/games/',
    };

    let sent = 0, failed = 0, expired = 0, offset = 0;

    while (true) {
      const result = await env.DB.prepare(
        `SELECT endpoint, p256dh, auth FROM push_subscriptions LIMIT ?1 OFFSET ?2`
      ).bind(BATCH_SIZE, offset).all();

      const rows = result.results || [];
      if (rows.length === 0) break;

      await Promise.all(rows.map(async (row) => {
        try {
          const status = await sendPushNotification(
            { endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth },
            notification, vapid
          );
          if (status === 201 || status === 200) {
            sent++;
          } else if (status === 410 || status === 404) {
            expired++;
            await env.DB.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?1`)
              .bind(row.endpoint).run()
              .catch(e => console.error('[triggerPush] Delete failed:', e));
          } else {
            failed++;
            console.warn(`[triggerPush] Unexpected status ${status}`);
          }
        } catch (err) {
          failed++;
          console.error('[triggerPush] Send error:', err.message);
        }
      }));

      offset += BATCH_SIZE;
      if (rows.length < BATCH_SIZE) break;
    }

    console.log(`[triggerPush] Daily done — sent=${sent} failed=${failed} expired=${expired}`);
    return { sent, failed, expired };
  } catch (err) {
    console.error('[triggerPush] Fatal error:', err);
    return { sent: 0, failed: 0, expired: 0, error: err.message };
  }
}

// ─── Streak reminder ──────────────────────────────────────────────────────────

async function triggerStreakReminder(env) {
  try {
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
      console.error('[triggerStreakReminder] VAPID secrets not configured');
      return { sent: 0, failed: 0, expired: 0, skipped: 0 };
    }

    const today = getPTDateYYYYMMDD();

    // Build a UNION query to find all anon_ids that completed any puzzle today.
    const unionSql = GAME_TABLES.map(t => `SELECT anon_id FROM ${t} WHERE puzzle_id = ?`).join(' UNION ALL ');
    const completedResult = await env.DB.prepare(
      `SELECT DISTINCT anon_id FROM (${unionSql})`
    ).bind(...GAME_TABLES.map(() => today)).all();

    const completedToday = new Set((completedResult.results || []).map(r => r.anon_id));

    const vapid = {
      publicKey:  env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
      subject:    env.VAPID_SUBJECT,
    };

    const notification = {
      title: 'Daily Grid',
      body:  "Complete your puzzles to keep your streak alive! 🎯",
      icon:  '/games/assets/dg-games-192.png',
      badge: '/games/assets/dg-games-192.png',
      tag:   'daily-grid-streak',
      url:   '/games/',
    };

    let sent = 0, failed = 0, expired = 0, skipped = 0, offset = 0;

    while (true) {
      const result = await env.DB.prepare(
        `SELECT endpoint, p256dh, auth, anon_id FROM push_subscriptions LIMIT ?1 OFFSET ?2`
      ).bind(BATCH_SIZE, offset).all();

      const rows = result.results || [];
      if (rows.length === 0) break;

      await Promise.all(rows.map(async (row) => {
        // Skip subscribers who already completed at least one puzzle today
        if (completedToday.has(row.anon_id)) {
          skipped++;
          return;
        }

        try {
          const status = await sendPushNotification(
            { endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth },
            notification, vapid
          );
          if (status === 201 || status === 200) {
            sent++;
          } else if (status === 410 || status === 404) {
            expired++;
            await env.DB.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?1`)
              .bind(row.endpoint).run()
              .catch(e => console.error('[triggerStreakReminder] Delete failed:', e));
          } else {
            failed++;
            console.warn(`[triggerStreakReminder] Unexpected status ${status}`);
          }
        } catch (err) {
          failed++;
          console.error('[triggerStreakReminder] Send error:', err.message);
        }
      }));

      offset += BATCH_SIZE;
      if (rows.length < BATCH_SIZE) break;
    }

    console.log(`[triggerStreakReminder] done — sent=${sent} failed=${failed} expired=${expired} skipped=${skipped}`);
    return { sent, failed, expired, skipped };
  } catch (err) {
    console.error('[triggerStreakReminder] Fatal error:', err);
    return { sent: 0, failed: 0, expired: 0, skipped: 0, error: err.message };
  }
}

// ─── Win-back reminder (inactive users) ─────────────────────────────────────

/**
 * Sends a gentle reminder to users who have played before but not recently.
 * Defaults:
 *   - inactiveDays: users whose last play date is >= 3 days ago
 *   - cooldownDays: max 1 win-back message every 7 days per subscriber
 */
async function triggerWinback(env, { inactiveDays = 3, cooldownDays = 7 } = {}) {
  try {
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
      console.error('[triggerWinback] VAPID secrets not configured');
      return { sent: 0, failed: 0, expired: 0, skipped: 0, eligible: 0 };
    }

    const cutoffDate = getPTDateDaysAgo(inactiveDays);

    // Build a map anon_id -> last played puzzle date (YYYY-MM-DD).
    const unionSql = GAME_TABLES.map(t => `SELECT anon_id, puzzle_id FROM ${t}`).join(' UNION ALL ');
    const lastPlayedResult = await env.DB.prepare(
      `SELECT anon_id, MAX(puzzle_id) AS last_played
       FROM (${unionSql})
       GROUP BY anon_id`
    ).all();

    const lastPlayedByAnon = new Map((lastPlayedResult.results || []).map(r => [r.anon_id, r.last_played]));

    const vapid = {
      publicKey:  env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
      subject:    env.VAPID_SUBJECT,
    };

    const notification = {
      title: 'Daily Grid',
      body:  'New puzzles are waiting whenever you are. Ready for a quick round? 🧩',
      icon:  '/games/assets/dg-games-192.png',
      badge: '/games/assets/dg-games-192.png',
      tag:   'daily-grid-winback',
      url:   '/games/',
    };

    let sent = 0, failed = 0, expired = 0, skipped = 0, eligible = 0, offset = 0;

    while (true) {
      const result = await env.DB.prepare(
        `SELECT endpoint, p256dh, auth, anon_id, winback_last_sent_at
         FROM push_subscriptions
         LIMIT ?1 OFFSET ?2`
      ).bind(BATCH_SIZE, offset).all();

      const rows = result.results || [];
      if (rows.length === 0) break;

      await Promise.all(rows.map(async (row) => {
        const lastPlayed = lastPlayedByAnon.get(row.anon_id);

        // Must have played before and be inactive for at least N days.
        if (!lastPlayed || lastPlayed > cutoffDate) {
          skipped++;
          return;
        }

        // Cooldown: max 1 win-back push every cooldownDays per subscriber.
        if (row.winback_last_sent_at) {
          const cool = await env.DB.prepare(
            `SELECT CASE WHEN julianday('now') - julianday(?1) >= ?2 THEN 1 ELSE 0 END AS ready`
          ).bind(row.winback_last_sent_at, cooldownDays).first();
          if (!cool?.ready) {
            skipped++;
            return;
          }
        }

        eligible++;

        try {
          const status = await sendPushNotification(
            { endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth },
            notification, vapid
          );
          if (status === 201 || status === 200) {
            sent++;
            await env.DB.prepare(
              `UPDATE push_subscriptions
               SET winback_last_sent_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
               WHERE endpoint = ?1`
            ).bind(row.endpoint).run();
          } else if (status === 410 || status === 404) {
            expired++;
            await env.DB.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?1`)
              .bind(row.endpoint).run()
              .catch(e => console.error('[triggerWinback] Delete failed:', e));
          } else {
            failed++;
            console.warn(`[triggerWinback] Unexpected status ${status}`);
          }
        } catch (err) {
          failed++;
          console.error('[triggerWinback] Send error:', err.message);
        }
      }));

      offset += BATCH_SIZE;
      if (rows.length < BATCH_SIZE) break;
    }

    console.log(`[triggerWinback] done — sent=${sent} failed=${failed} expired=${expired} skipped=${skipped} eligible=${eligible} cutoff=${cutoffDate}`);
    return { sent, failed, expired, skipped, eligible, cutoffDate, inactiveDays, cooldownDays };
  } catch (err) {
    console.error('[triggerWinback] Fatal error:', err);
    return { sent: 0, failed: 0, expired: 0, skipped: 0, eligible: 0, error: err.message };
  }
}
