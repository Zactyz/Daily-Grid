#!/usr/bin/env node
/** Verify feedback secrets on Cloudflare Pages (keys only, not values). */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '58f16335caa705944e98b17f67605842';
const projectName = 'daily-grid';
const KEYS = ['GOOGLE_SHEETS_FEEDBACK_URL', 'FEEDBACK_WEBHOOK_SECRET'];

function loadWranglerOAuth() {
  const paths = [
    resolve(homedir(), 'AppData', 'Roaming', 'xdg.config', '.wrangler', 'config', 'default.toml'),
    resolve(homedir(), '.config', '.wrangler', 'config', 'default.toml'),
  ];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(/oauth_token\s*=\s*"([^"]+)"/);
    if (m) return m[1];
  }
  return null;
}

const token = process.env.CLOUDFLARE_API_TOKEN || loadWranglerOAuth();
if (!token) {
  console.error('No token');
  process.exit(1);
}

const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}`;
const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
const project = (await res.json()).result;

for (const env of ['production', 'preview']) {
  const vars = project.deployment_configs?.[env]?.env_vars || {};
  console.log(`\n${env}:`);
  for (const k of KEYS) {
    const v = vars[k];
    if (!v) {
      console.log(`  MISSING ${k}`);
    } else {
      const hint =
        k === 'GOOGLE_SHEETS_FEEDBACK_URL' && v.value
          ? v.value.slice(0, 60) + '...'
          : '(secret set)';
      console.log(`  OK ${k} [${v.type}] ${hint}`);
    }
  }
  const all = Object.keys(vars).sort();
  console.log(`  All vars (${all.length}):`, all.join(', ') || '(none)');
}
