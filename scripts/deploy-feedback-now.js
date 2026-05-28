#!/usr/bin/env node
/**
 * Deploy feedback Apps Script + Cloudflare secrets (requires clasp already logged in).
 *
 *   set APPS_SCRIPT_ID=your-script-id
 *   node scripts/deploy-feedback-now.js
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const claspBin = resolve(root, 'node_modules', '@google', 'clasp', 'build', 'src', 'index.js');
const wranglerBin = resolve(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const appsScriptDir = resolve(__dirname, 'feedback-apps-script');
const claspDir = resolve(__dirname, '.feedback-clasp');
const devVarsPath = resolve(root, '.dev.vars');

const scriptId = process.env.APPS_SCRIPT_ID;
if (!scriptId) {
  console.error('Set APPS_SCRIPT_ID environment variable.');
  process.exit(1);
}

function loadDevVars() {
  const vars = {};
  if (!existsSync(devVarsPath)) return vars;
  for (const line of readFileSync(devVarsPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) vars[m[1].trim()] = m[2].trim();
  }
  return vars;
}

function saveDevVars(vars) {
  writeFileSync(devVarsPath, Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
}

function run(args, opts = {}) {
  const res = spawnSync(process.execPath, args, { encoding: 'utf8', ...opts });
  if (res.status !== 0) {
    console.error(res.stderr || res.stdout);
    process.exit(res.status || 1);
  }
  return res.stdout || '';
}

const vars = loadDevVars();
const secret = vars.FEEDBACK_WEBHOOK_SECRET || randomBytes(24).toString('base64url');

mkdirSync(claspDir, { recursive: true });
let codeJs = readFileSync(resolve(appsScriptDir, 'Code.js'), 'utf8').replace('__FEEDBACK_WEBHOOK_SECRET__', secret);
writeFileSync(resolve(claspDir, 'Code.js'), codeJs);
writeFileSync(resolve(claspDir, 'appsscript.json'), readFileSync(resolve(appsScriptDir, 'appsscript.json'), 'utf8'));
writeFileSync(resolve(claspDir, '.clasp.json'), JSON.stringify({ scriptId, rootDir: '.' }, null, 2));

console.log('Pushing Apps Script…');
run([claspBin, 'push', '--force'], { cwd: claspDir, stdio: 'inherit' });

console.log('Deploying web app…');
const deployOut = run([claspBin, 'deploy', '--description', 'Daily Grid feedback'], { cwd: claspDir });
const urlMatch = deployOut.match(/https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec/);
const webhookUrl = urlMatch?.[0] || vars.GOOGLE_SHEETS_FEEDBACK_URL;
if (!webhookUrl) {
  console.error('Deploy OK but no /exec URL in output. Copy URL from Apps Script → Deploy → Manage deployments.');
  process.exit(1);
}

saveDevVars({
  ...vars,
  FEEDBACK_WEBHOOK_SECRET: secret,
  GOOGLE_SHEETS_FEEDBACK_URL: webhookUrl,
  APPS_SCRIPT_ID: scriptId
});

console.log('Setting Cloudflare Pages secrets…');
for (const [name, value] of [
  ['GOOGLE_SHEETS_FEEDBACK_URL', webhookUrl],
  ['FEEDBACK_WEBHOOK_SECRET', secret]
]) {
  const res = spawnSync(process.execPath, [wranglerBin, 'pages', 'secret', 'put', name, '--project-name', 'daily-grid'], {
    input: value,
    stdio: ['pipe', 'inherit', 'inherit']
  });
  if (res.status !== 0) process.exit(1);
  console.log(`  ${name} set`);
}

console.log('\nDone.');
console.log('Webhook:', webhookUrl);
console.log('Redeploy experiment/preview on Cloudflare to use new secrets.');
