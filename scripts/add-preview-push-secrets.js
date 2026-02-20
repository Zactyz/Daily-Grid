#!/usr/bin/env node
/**
 * Add push notification secrets to Cloudflare Pages Preview environment.
 *
 * Production already has these secrets (set via wrangler pages secret put).
 * Preview deployments (e.g. 3352902e.daily-grid.pages.dev) use a separate
 * environment and need the same secrets added via the Cloudflare API.
 *
 * Prerequisites:
 *   1. Create an API token: https://dash.cloudflare.com/profile/api-tokens
 *      Use "Edit Cloudflare Workers" template or create custom with "Pages Edit"
 *   2. Set env vars: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
 *
 * Usage:
 *   CLOUDFLARE_ACCOUNT_ID=xxx CLOUDFLARE_API_TOKEN=xxx node scripts/add-preview-push-secrets.js
 *
 * Values are read from .dev.vars (same keys as local dev).
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const projectName = 'daily-grid';

if (!accountId || !apiToken) {
  console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN');
  process.exit(1);
}

// Parse .dev.vars
const devVars = {};
try {
  const content = readFileSync(resolve(root, '.dev.vars'), 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) devVars[m[1].trim()] = m[2].trim();
  }
} catch (e) {
  console.error('Could not read .dev.vars:', e.message);
  process.exit(1);
}

const required = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'PUSH_SECRET'];
for (const k of required) {
  if (!devVars[k]) {
    console.error(`Missing ${k} in .dev.vars`);
    process.exit(1);
  }
}

// Cloudflare API matches wrangler pages secret put format:
// type: "secret_text", wrangler_config_hash required

const envVars = {};
for (const k of required) {
  envVars[k] = { type: 'secret_text', value: devVars[k] };
}

async function run() {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  if (!res.ok) {
    console.error('Failed to fetch project:', res.status, await res.text());
    process.exit(1);
  }
  const project = (await res.json()).result;
  if (!project) {
    console.error('Project not found');
    process.exit(1);
  }

  // Match wrangler pages secret put: only send preview with env_vars + wrangler_config_hash
  const configs = project.deployment_configs || {};
  const previewConfig = configs.preview || { env_vars: {} };
  const previewEnvVars = { ...(previewConfig.env_vars || {}), ...envVars };
  const wranglerConfigHash = previewConfig.wrangler_config_hash || null;

  const patchBody = {
    deployment_configs: {
      preview: {
        env_vars: previewEnvVars,
        wrangler_config_hash: wranglerConfigHash,
      },
    },
  };

  const patchRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patchBody),
    }
  );

  if (!patchRes.ok) {
    const text = await patchRes.text();
    console.error('Failed to update project:', patchRes.status, text);
    console.error('\nManual fix: Cloudflare Dashboard > Workers & Pages > daily-grid');
    console.error('> Settings > Environment variables > Preview > Add variable (Encrypt)');
    console.error('Add: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_SECRET');
    process.exit(1);
  }

  console.log('Preview environment secrets updated successfully.');
  console.log('Redeploy the preview branch for changes to take effect.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
