#!/usr/bin/env node
/**
 * Interactive setup: Google Apps Script (clasp) + Cloudflare Pages secrets for feedback.
 *
 * Prerequisites:
 *   - Google Sheet "Daily Grid Feedback" with row-1 headers (timestamp, anon_id, …)
 *   - Extensions → Apps Script opened once on that sheet (creates bound script project)
 *
 * Usage:
 *   node scripts/setup-feedback-integration.js
 *
 * Optional env (skip prompts):
 *   APPS_SCRIPT_ID=...           from Apps Script → Project settings → Script ID
 *   CLOUDFLARE_ACCOUNT_ID=...
 *   CLOUDFLARE_API_TOKEN=...     Pages Edit permission
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { randomBytes } from 'crypto';
import { mkdirSync } from 'fs';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const claspBin = resolve(root, 'node_modules', '@google', 'clasp', 'build', 'src', 'index.js');
const wranglerBin = resolve(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const appsScriptDir = resolve(__dirname, 'feedback-apps-script');
const claspDir = resolve(__dirname, '.feedback-clasp');
const devVarsPath = resolve(root, '.dev.vars');
const exampleVarsPath = resolve(root, '.dev.vars.feedback.example');

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolveAnswer) => {
    rl.question(question, (answer) => {
      rl.close();
      resolveAnswer(answer.trim());
    });
  });
}

function runNode(script, args, opts = {}) {
  const res = spawnSync(process.execPath, [script, ...args], {
    cwd: opts.cwd || root,
    stdio: opts.stdio || 'inherit',
    env: { ...process.env, ...opts.env },
    shell: false
  });
  return res.status ?? 1;
}

function generateSecret() {
  return randomBytes(24).toString('base64url');
}

function loadDevVars() {
  const vars = {};
  if (!existsSync(devVarsPath)) return vars;
  const content = readFileSync(devVarsPath, 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) vars[m[1].trim()] = m[2].trim();
  }
  return vars;
}

function saveDevVars(vars) {
  const lines = Object.entries(vars).map(([k, v]) => `${k}=${v}`);
  writeFileSync(devVarsPath, `${lines.join('\n')}\n`, 'utf8');
  console.log(`\nWrote ${devVarsPath} (gitignored)`);
}

function mergeDevVars(updates) {
  const vars = loadDevVars();
  Object.assign(vars, updates);
  saveDevVars(vars);
  return vars;
}

async function ensureClaspLogin() {
  console.log('\n--- Google (clasp) login ---');
  console.log('A browser window should open. Sign in and allow access.\n');
  const code = runNode(claspBin, ['login'], { stdio: 'inherit' });
  if (code !== 0) {
    console.error('clasp login failed. Try: node node_modules/@google/clasp/build/src/index.js login');
    process.exit(1);
  }
}

async function deployAppsScript(scriptId, secret) {
  const workDir = claspDir;
  mkdirSync(workDir, { recursive: true });

  let codeJs = readFileSync(resolve(appsScriptDir, 'Code.js'), 'utf8');
  codeJs = codeJs.replace('__FEEDBACK_WEBHOOK_SECRET__', secret);
  writeFileSync(resolve(workDir, 'Code.js'), codeJs, 'utf8');
  writeFileSync(resolve(workDir, 'appsscript.json'), readFileSync(resolve(appsScriptDir, 'appsscript.json'), 'utf8'));

  const claspJson = { scriptId, rootDir: '.' };
  writeFileSync(resolve(workDir, '.clasp.json'), JSON.stringify(claspJson, null, 2));

  console.log('\nPushing Apps Script to Google…');
  if (runNode(claspBin, ['push', '--force'], { cwd: workDir }) !== 0) {
    process.exit(1);
  }

  console.log('Deploying web app (Anyone can access)…');
  const deployRes = spawnSync(process.execPath, [claspBin, 'deploy', '--description', 'Daily Grid feedback webhook'], {
    cwd: workDir,
    encoding: 'utf8'
  });
  if (deployRes.status !== 0) {
    console.error(deployRes.stderr || deployRes.stdout);
    process.exit(1);
  }

  const out = `${deployRes.stdout || ''}${deployRes.stderr || ''}`;
  const urlMatch = out.match(/https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec/);
  if (urlMatch) return urlMatch[0];

  console.log('\nDeploy finished. Get the web app URL from:');
  console.log('  Apps Script → Deploy → Manage deployments → copy URL ending in /exec');
  const manual = await prompt('\nPaste deployment URL (or Enter to skip): ');
  return manual || '';
}

async function putCloudflareSecrets(webhookUrl, secret) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const projectName = 'daily-grid';

  if (accountId && apiToken) {
    console.log('\n--- Cloudflare secrets (API) ---');
    const envVars = {
      GOOGLE_SHEETS_FEEDBACK_URL: { type: 'secret_text', value: webhookUrl },
      FEEDBACK_WEBHOOK_SECRET: { type: 'secret_text', value: secret }
    };
    for (const envName of ['production', 'preview']) {
      const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}`;
      const getRes = await fetch(url, { headers: { Authorization: `Bearer ${apiToken}` } });
      if (!getRes.ok) {
        console.error(`Failed to fetch project (${envName}):`, await getRes.text());
        continue;
      }
      const project = (await getRes.json()).result;
      const deploymentConfigs = { ...(project.deployment_configs || {}) };
      deploymentConfigs[envName] = {
        ...(deploymentConfigs[envName] || {}),
        env_vars: { ...(deploymentConfigs[envName]?.env_vars || {}), ...envVars }
      };
      const patchRes = await fetch(url, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ deployment_configs: deploymentConfigs })
      });
      if (!patchRes.ok) {
        console.error(`Failed to patch ${envName}:`, await patchRes.text());
      } else {
        console.log(`Updated ${envName} environment variables.`);
      }
    }
    return;
  }

  console.log('\n--- Cloudflare secrets (wrangler CLI) ---');
  console.log('Wrangler will prompt for each secret value.\n');
  console.log('When prompted, paste EXACTLY:\n');
  console.log(`GOOGLE_SHEETS_FEEDBACK_URL:\n  ${webhookUrl}\n`);
  console.log(`FEEDBACK_WEBHOOK_SECRET:\n  ${secret}\n`);

  const ok = await prompt('Run wrangler pages secret put now? [Y/n]: ');
  if (ok && ok.toLowerCase() === 'n') return;

  if (!existsSync(wranglerBin)) {
    console.error('wrangler not found. Run: npm install');
    return;
  }

  console.log('\nLog in to Cloudflare if asked…');
  runNode(wranglerBin, ['login'], { stdio: 'inherit' });

  for (const [name, value] of [
    ['GOOGLE_SHEETS_FEEDBACK_URL', webhookUrl],
    ['FEEDBACK_WEBHOOK_SECRET', secret]
  ]) {
    console.log(`\nSetting ${name}…`);
    const res = spawnSync(process.execPath, [wranglerBin, 'pages', 'secret', 'put', name, '--project-name', projectName], {
      input: value,
      encoding: 'utf8',
      stdio: ['pipe', 'inherit', 'inherit']
    });
    if (res.status !== 0) {
      console.error(`Failed to set ${name}`);
    }
  }
}

async function main() {
  console.log('Daily Grid — Feedback integration setup\n');

  if (!existsSync(claspBin)) {
    console.error('Run: npm install (needs @google/clasp)');
    process.exit(1);
  }

  let scriptId = process.env.APPS_SCRIPT_ID || '';
  if (!scriptId) {
    console.log('Open your Google Sheet → Extensions → Apps Script');
    console.log('Project settings (gear) → copy Script ID\n');
    scriptId = await prompt('Apps Script ID: ');
  }
  if (!scriptId) {
    console.error('Script ID is required.');
    process.exit(1);
  }

  const devVars = loadDevVars();
  let secret = devVars.FEEDBACK_WEBHOOK_SECRET || generateSecret();

  await ensureClaspLogin();

  const webhookUrl = await deployAppsScript(scriptId, secret);
  if (!webhookUrl) {
    console.error('Could not determine web app URL. Finish deploy in Apps Script UI, then re-run with URL in .dev.vars');
    mergeDevVars({ FEEDBACK_WEBHOOK_SECRET: secret, APPS_SCRIPT_ID: scriptId });
    process.exit(1);
  }

  mergeDevVars({
    FEEDBACK_WEBHOOK_SECRET: secret,
    GOOGLE_SHEETS_FEEDBACK_URL: webhookUrl,
    APPS_SCRIPT_ID: scriptId
  });

  if (!existsSync(exampleVarsPath)) {
    writeFileSync(exampleVarsPath, [
      '# Copy to .dev.vars (gitignored) for local feedback testing',
      'FEEDBACK_WEBHOOK_SECRET=',
      'GOOGLE_SHEETS_FEEDBACK_URL=',
      'APPS_SCRIPT_ID=',
      ''
    ].join('\n'));
  }

  await putCloudflareSecrets(webhookUrl, secret);

  console.log('\n--- Done ---');
  console.log('Webhook URL:', webhookUrl);
  console.log('Secret saved in .dev.vars');
  console.log('Redeploy experiment/preview on Cloudflare Pages to pick up new secrets.');
  console.log('\nTest: submit feedback from /games/feedback/ on your preview deployment.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
