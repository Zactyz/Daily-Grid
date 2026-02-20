/**
 * POST /api/push/send  (also triggered by Cloudflare Cron)
 *
 * Sends the daily "New puzzles are live!" push notification to all subscribers.
 *
 * Cron schedule (add to wrangler.toml):
 *   [[triggers.crons]]
 *   crons = ["0 8 * * *"]   # 08:00 UTC = midnight PT (PST). Adjust for PDT (07:00 UTC).
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

    const vapid = {
      publicKey:  env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
      subject:    env.VAPID_SUBJECT,
    };

    const notification = {
      title: 'Daily Grid',
      body:  "Today's puzzles are live! Come solve them.",
      icon:  '/games/assets/dg-games-192.png',
      badge: '/games/assets/dg-games-192.png',
      url:   '/games/',
    };

    let sent = 0;
    let failed = 0;
    let expired = 0;
    let offset = 0;

    // Process in batches to avoid Worker CPU limits
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
            notification,
            vapid
          );

          if (status === 201 || status === 200) {
            sent++;
          } else if (status === 410 || status === 404) {
            // Subscription expired — clean up
            expired++;
            await env.DB.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?1`)
              .bind(row.endpoint).run();
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }));

      offset += BATCH_SIZE;
      if (rows.length < BATCH_SIZE) break;
    }

    return jsonOk({ sent, failed, expired });
  } catch (err) {
    return internalError(err, 'Push send');
  }
}

// Cloudflare Cron trigger handler (wrangler.toml: [triggers] crons = ["0 8 * * *"])
export async function scheduled(event, env, ctx) {
  ctx.waitUntil(triggerPush(env));
}

async function triggerPush(env) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return;

  const vapid = {
    publicKey:  env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject:    env.VAPID_SUBJECT,
  };

  const notification = {
    title: 'Daily Grid',
    body:  "Today's puzzles are live!",
    icon:  '/games/assets/dg-games-192.png',
    url:   '/games/',
  };

  let offset = 0;
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
        if (status === 410 || status === 404) {
          await env.DB.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?1`)
            .bind(row.endpoint).run();
        }
      } catch { /* ignore individual failures */ }
    }));

    offset += BATCH_SIZE;
    if (rows.length < BATCH_SIZE) break;
  }
}
