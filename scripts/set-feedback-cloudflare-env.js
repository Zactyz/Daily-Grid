#!/usr/bin/env node
/**
 * Set GOOGLE_SHEETS_FEEDBACK_URL and FEEDBACK_WEBHOOK_SECRET on both
 * production and preview for the daily-grid Pages project.
 *
 * Uses CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN, or wrangler OAuth token
 * from ~/.config/.wrangler/config/default.toml (Windows: AppData/Roaming/xdg.config/.wrangler)
 *
 * Usage:
 *   node scripts/set-feedback-cloudflare-env.js
 *   node scripts/set-feedback-cloudflare-env.js <webhookUrl> <secret>
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const projectName = 'daily-grid';
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '58f16335caa705944e98b17f67605842';

const KEYS = ['GOOGLE_SHEETS_FEEDBACK_URL', 'FEEDBACK_WEBHOOK_SECRET'];

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

function loadFromDevVars() {
  const path = resolve(root, '.dev.vars');
  if (!existsSync(path)) return {};
  const vars = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) vars[m[1].trim()] = m[2].trim();
  }
  return vars;
}

function loadFromClaspDeploy() {
  const claspCode = resolve(__dirname, '.feedback-clasp', 'Code.js');
  if (!existsSync(claspCode)) return {};
  const code = readFileSync(claspCode, 'utf8');
  const secretM = code.match(/WEBHOOK_SECRET\s*=\s*'([^']+)'/);
  return { FEEDBACK_WEBHOOK_SECRET: secretM?.[1] };
}

async function main() {
  const token = process.env.CLOUDFLARE_API_TOKEN || loadWranglerOAuth();
  if (!token) {
    console.error('No Cloudflare API token. Set CLOUDFLARE_API_TOKEN or run: wrangler login');
    process.exit(1);
  }

  const dev = loadFromDevVars();
  const clasp = loadFromClaspDeploy();
  const webhookUrl = process.argv[2] || dev.GOOGLE_SHEETS_FEEDBACK_URL;
  const secret = process.argv[3] || dev.FEEDBACK_WEBHOOK_SECRET || clasp.FEEDBACK_WEBHOOK_SECRET;

  if (!webhookUrl || !secret) {
    console.error('Usage: node scripts/set-feedback-cloudflare-env.js <webhookUrl> <secret>');
    console.error('Or set values in .dev.vars');
    process.exit(1);
  }

  const envVars = {};
  for (const k of KEYS) {
    envVars[k] = {
      type: 'secret_text',
      value: k === 'GOOGLE_SHEETS_FEEDBACK_URL' ? webhookUrl : secret,
    };
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}`;
  const getRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!getRes.ok) {
    console.error('GET project failed:', getRes.status, await getRes.text());
    process.exit(1);
  }

  const project = (await getRes.json()).result;
  const configs = { ...(project.deployment_configs || {}) };

  for (const envName of ['production', 'preview']) {
    const prev = configs[envName] || { env_vars: {} };
    configs[envName] = {
      ...prev,
      env_vars: { ...(prev.env_vars || {}), ...envVars },
    };
  }

  const patchRes = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ deployment_configs: configs }),
  });

  if (!patchRes.ok) {
    console.error('PATCH failed:', patchRes.status, await patchRes.text());
    process.exit(1);
  }

  const names = KEYS.join(', ');
  console.log(`Updated production + preview secrets: ${names}`);
  console.log('GOOGLE_SHEETS_FEEDBACK_URL:', webhookUrl);
  console.log('FEEDBACK_WEBHOOK_SECRET: (set, hidden)');
  console.log('\nRedeploy experiment/preview (or push a commit) for preview to pick up secrets.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
