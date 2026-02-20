/**
 * Minimal VAPID + Web Push encryption for Cloudflare Workers.
 *
 * Uses the Web Crypto API (available in all Workers/browsers).
 * Implements RFC 8291 (Message Encryption for Web Push) and
 * RFC 8292 (VAPID for Web Push) using ES256 JWTs.
 *
 * Required environment variables (set as Cloudflare secrets):
 *   VAPID_PUBLIC_KEY   - Base64url-encoded uncompressed P-256 public key (65 bytes)
 *   VAPID_PRIVATE_KEY  - Base64url-encoded P-256 private key (32 bytes)
 *   VAPID_SUBJECT      - mailto: or https: subject URI
 *
 * Generate keys with:
 *   node -e "
 *     const {generateKeyPairSync} = require('crypto');
 *     const {privateKey, publicKey} = generateKeyPairSync('ec', {namedCurve:'P-256'});
 *     console.log('PUBLIC:', publicKey.export({type:'spki',format:'der'}).slice(-65).toString('base64url'));
 *     console.log('PRIVATE:', privateKey.export({type:'pkcs8',format:'der'}).slice(-32).toString('base64url'));
 *   "
 * Or use: https://vapidkeys.com
 */

// ─── Base64url helpers ────────────────────────────────────────────────────────
function b64uEncode(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function b64uDecode(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

// ─── VAPID JWT ────────────────────────────────────────────────────────────────

/**
 * Create a signed VAPID authorization header value.
 * @param {string} audience - The push service origin (e.g. "https://fcm.googleapis.com")
 * @param {string} subject  - VAPID_SUBJECT env var
 * @param {string} pubKeyB64u - VAPID_PUBLIC_KEY env var
 * @param {string} privKeyB64u - VAPID_PRIVATE_KEY env var
 * @returns {Promise<{authorization: string, vapidPublicKey: string}>}
 */
export async function buildVapidHeaders(audience, subject, pubKeyB64u, privKeyB64u) {
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;

  const header = { alg: 'ES256', typ: 'JWT' };
  const payload = { aud: audience, exp, sub: subject };

  const headerB64 = b64uEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = b64uEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  // Import private key
  const privRaw = b64uDecode(privKeyB64u);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', privRaw,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  ).catch(async () => {
    // If raw import fails, try pkcs8
    const pkcs8 = buildPKCS8(privRaw);
    return crypto.subtle.importKey(
      'pkcs8', pkcs8,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false, ['sign']
    );
  });

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${b64uEncode(sig)}`;
  return {
    authorization: `vapid t=${jwt},k=${pubKeyB64u}`,
    vapidPublicKey: pubKeyB64u,
  };
}

// Wrap a raw 32-byte P-256 private key in a minimal PKCS#8 DER envelope
function buildPKCS8(rawKey32) {
  // PKCS#8 DER for a P-256 key
  const prefix = new Uint8Array([
    0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48,
    0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03,
    0x01, 0x07, 0x04, 0x27, 0x30, 0x25, 0x02, 0x01, 0x01, 0x04, 0x20,
  ]);
  const out = new Uint8Array(prefix.length + 32);
  out.set(prefix);
  out.set(rawKey32, prefix.length);
  return out.buffer;
}

// ─── Web Push encryption (RFC 8291 / AES-128-GCM) ────────────────────────────

/**
 * Encrypt a Web Push payload.
 * @param {string} payloadStr - The notification body JSON string
 * @param {string} p256dhB64u - Subscriber's p256dh key (base64url)
 * @param {string} authB64u   - Subscriber's auth secret (base64url)
 * @returns {Promise<{ciphertext: ArrayBuffer, salt: Uint8Array, serverPublicKey: Uint8Array}>}
 */
export async function encryptPayload(payloadStr, p256dhB64u, authB64u) {
  const plaintext = new TextEncoder().encode(payloadStr);
  const subscriberKey = b64uDecode(p256dhB64u);
  const authSecret = b64uDecode(authB64u);

  // Generate ephemeral server key pair
  const serverPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, ['deriveKey', 'deriveBits']
  );
  const serverPubRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverPair.publicKey)
  );

  // Import subscriber's public key
  const subPub = await crypto.subtle.importKey(
    'raw', subscriberKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, []
  );

  // ECDH shared secret
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: subPub },
    serverPair.privateKey, 256
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));

  // PRK via HKDF-SHA256
  const prk = await hkdf(
    authSecret,
    new Uint8Array(sharedBits),
    buildInfo('WebPush: info', subscriberKey, serverPubRaw),
    32
  );

  // Content encryption key (CEK)
  const cek = await hkdf(salt, prk, buildInfoSimple('Content-Encoding: aes128gcm'), 16);
  const nonce = await hkdf(salt, prk, buildInfoSimple('Content-Encoding: nonce'), 12);

  // Encrypt
  const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 },
    cekKey,
    addPadding(plaintext)
  );

  return { ciphertext, salt, serverPublicKey: serverPubRaw };
}

function buildInfo(prefix, clientKey, serverKey) {
  const enc = new TextEncoder();
  const p = enc.encode(prefix + '\0');
  const out = new Uint8Array(p.length + 1 + 2 + clientKey.length + 2 + serverKey.length);
  let o = 0;
  out.set(p, o); o += p.length;
  out[o++] = 0x41; // uncompressed point marker for P-256
  out[o++] = (clientKey.length >> 8) & 0xff;
  out[o++] = clientKey.length & 0xff;
  out.set(clientKey, o); o += clientKey.length;
  out[o++] = (serverKey.length >> 8) & 0xff;
  out[o++] = serverKey.length & 0xff;
  out.set(serverKey, o);
  return out;
}

function buildInfoSimple(label) {
  const enc = new TextEncoder();
  const l = enc.encode(label);
  const out = new Uint8Array(l.length + 1);
  out.set(l);
  out[l.length] = 0; // null terminator
  return out;
}

async function hkdf(salt, ikm, info, len) {
  const saltKey = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const prk = new Uint8Array(await crypto.subtle.sign('HMAC', saltKey, ikm));
  const prkKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const t1input = new Uint8Array(info.length + 1);
  t1input.set(info);
  t1input[info.length] = 0x01;
  const t1 = new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, t1input));
  return t1.slice(0, len);
}

function addPadding(data) {
  // Delimiter byte 0x02 + no extra padding
  const out = new Uint8Array(data.length + 1);
  out.set(data);
  out[data.length] = 0x02;
  return out;
}

/**
 * Send a Web Push notification to a single subscriber.
 * @param {Object} sub - { endpoint, p256dh, auth }
 * @param {Object} payload - { title, body, icon, url }
 * @param {Object} vapid - { publicKey, privateKey, subject }
 */
export async function sendPushNotification(sub, payload, vapid) {
  const { ciphertext, salt, serverPublicKey } = await encryptPayload(
    JSON.stringify(payload), sub.p256dh, sub.auth
  );

  const origin = new URL(sub.endpoint).origin;
  const { authorization } = await buildVapidHeaders(
    origin, vapid.subject, vapid.publicKey, vapid.privateKey
  );

  // Build the encrypted body: salt(16) + record size(4) + keyLen(1) + serverKey(65) + ciphertext
  const recordSize = ciphertext.byteLength + 16 + 1 + serverPublicKey.length + 4 + 16;
  const body = new Uint8Array(16 + 4 + 1 + serverPublicKey.length + ciphertext.byteLength);
  let offset = 0;
  body.set(salt, offset); offset += 16;
  const view = new DataView(body.buffer);
  view.setUint32(offset, recordSize, false); offset += 4;
  body[offset++] = serverPublicKey.length;
  body.set(serverPublicKey, offset); offset += serverPublicKey.length;
  body.set(new Uint8Array(ciphertext), offset);

  const response = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': authorization,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
    },
    body: body,
  });

  return response.status;
}
