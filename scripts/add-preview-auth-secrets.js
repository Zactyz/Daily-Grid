#!/usr/bin/env node
/**
 * Add auth email OTP secrets to Cloudflare Pages Preview environment.
 * Production secrets are set via `wrangler pages secret put`; preview needs the API.
 *
 * Usage:
 *   RESEND_API_KEY=re_... AUTH_FROM_EMAIL="Daily Grid <onboarding@resend.dev>" AUTH_SESSION_SECRET=... node scripts/add-preview-auth-secrets.js
 *
 * Or pass as args:
 *   node scripts/add-preview-auth-secrets.js <resendKey> "<fromEmail>" <sessionSecret>
 *
 * Auth: CLOUDFLARE_API_TOKEN or wrangler OAuth from ~/.wrangler config
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectName = 'daily-grid';
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '58f16335caa705944e98b17f67605842';

const KEYS = ['RESEND_API_KEY', 'AUTH_FROM_EMAIL', 'AUTH_SESSION_SECRET'];

function loadWranglerOAuth() {
  const paths = [
    resolve(homedir(), 'AppData', 'Roaming', 'xdg.config', '.wrangler', 'config', 'default.toml'),
    resolve(homedir(), '.config', '.wrangler', 'config', 'default.toml'),
  ];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const toml = readFileSync(p, 'utf8');
    const m = toml.match(/oauth_token\s*=\s*"([^"]+)"/);
    if (m) return m[1];
  }
  return null;
}

async function main() {
  const token = process.env.CLOUDFLARE_API_TOKEN || loadWranglerOAuth();
  if (!token) {
    console.error('No Cloudflare API token. Set CLOUDFLARE_API_TOKEN or run: wrangler login');
    process.exit(1);
  }

  const resendKey = process.argv[2] || process.env.RESEND_API_KEY;
  const fromEmail = process.argv[3] || process.env.AUTH_FROM_EMAIL;
  const sessionSecret = process.argv[4] || process.env.AUTH_SESSION_SECRET;

  if (!resendKey || !fromEmail || !sessionSecret) {
    console.error('Missing values. Set env vars or:');
    console.error('  node scripts/add-preview-auth-secrets.js <resendKey> "<fromEmail>" <sessionSecret>');
    process.exit(1);
  }

  const values = {
    RESEND_API_KEY: resendKey,
    AUTH_FROM_EMAIL: fromEmail,
    AUTH_SESSION_SECRET: sessionSecret,
  };

  const envVars = {};
  for (const k of KEYS) {
    envVars[k] = { type: 'secret_text', value: values[k] };
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}`;
  const getRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!getRes.ok) {
    console.error('GET project failed:', getRes.status, await getRes.text());
    process.exit(1);
  }

  const project = (await getRes.json()).result;
  const configs = project.deployment_configs || {};
  const previewConfig = configs.preview || { env_vars: {} };
  const previewEnvVars = { ...(previewConfig.env_vars || {}), ...envVars };

  const patchBody = {
    deployment_configs: {
      ...configs,
      preview: {
        ...previewConfig,
        env_vars: previewEnvVars,
      },
    },
  };

  const patchRes = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patchBody),
  });

  if (!patchRes.ok) {
    console.error('PATCH failed:', patchRes.status, await patchRes.text());
    process.exit(1);
  }

  console.log('Preview auth secrets updated:', KEYS.join(', '));
  console.log('AUTH_FROM_EMAIL:', fromEmail);
  console.log('Redeploy the preview branch for changes to take effect.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
