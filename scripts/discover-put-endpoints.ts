import { chromium } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { LoginPage } from '../src/pages/loginPage';
import { getConfig } from '../src/config/env';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const config = getConfig();
const SITE_URL = config.siteUrl;

const PUT_CANDIDATES = [
  '/api/v2/users/current',
  '/api/v2/site',
  '/api/v2/settings',
  '/api/v2/theme',
  '/api/v2/navigation_links',
  '/api/v2/layouts/selected',
  '/api/v2/user_subscriptions',
  '/api/v2/signup_form_questions',
  '/api/v2/projects',
  '/api/v2/projects/47804',
  '/api/v2/projects/47804/publish',
  '/api/v2/projects/47804/archive',
  '/api/v2/projects/47804/settings',
  '/api/v2/home_page_revisions/current',
  '/api/v2/users/current/password',
  '/api/v2/users/current/notifications',
  '/api/v2/users/current/preferences',
  '/api/v2/permissions',
  '/api/v2/custom_css',
  '/api/v2/email_templates',
  '/api/v2/intercom',
  '/api/v2/recommendations',
  '/api/v2/features',
  '/api/v2/reporting/dashboard_filters',
  '/api/v2/sites/settings',
  '/api/v2/sites/branding',
  '/api/v2/sites/navigation',
  '/api/v2/sites/custom_domain',
  '/api/v2/sites/sso',
  '/admin/api/sites/settings',
  '/admin/api/sites/editors/home-page',
  '/admin/api/auth/heartbeat',
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  console.log(`Logging in to ${SITE_URL} as ${config.siteAdmin.username}...`);
  const loginPage = new LoginPage(page, config);
  await loginPage.loginAs(config.siteAdmin.username, config.siteAdmin.password);
  console.log('Logged in successfully.\n');

  // Also capture PUT/PATCH requests the SPA makes when navigating admin pages
  const networkPuts = new Set<string>();
  page.on('request', (req) => {
    const method = req.method();
    if (method === 'PUT' || method === 'PATCH') {
      const url = req.url();
      if (url.startsWith(SITE_URL)) {
        networkPuts.add(`${method} ${url.replace(SITE_URL, '')}`);
      }
    }
  });

  // Navigate a few admin pages that might trigger background PUT/PATCH
  for (const p of ['/adm', '/adm/settings', '/adm/site/settings', '/adm/branding']) {
    await page.goto(`${SITE_URL}${p}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  }

  console.log('=== Network-observed PUT/PATCH calls ===');
  for (const entry of networkPuts) console.log(`  ${entry}`);
  console.log(`  (${networkPuts.size} total)\n`);

  // Now probe PUT candidates with authenticated context
  console.log('=== Probing PUT endpoints (authenticated, empty body) ===\n');
  console.log('Status | Method | Path');
  console.log('-------|--------|-----');

  const results: { path: string; status: number; accepts: boolean }[] = [];

  for (const p of PUT_CANDIDATES) {
    const url = `${SITE_URL}${p}`;
    try {
      const resp = await context.request.fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        data: '{}',
      });
      const status = resp.status();
      const accepts = status !== 404 && status !== 405;
      results.push({ path: p, status, accepts });
      const mark = accepts ? '✓' : '✘';
      console.log(`  ${mark} ${status}  | PUT    | ${p}`);
    } catch (e) {
      console.log(`  ✘ ERR  | PUT    | ${p}`);
      results.push({ path: p, status: 0, accepts: false });
    }
  }

  // Also try PATCH on same endpoints
  console.log('\n=== Probing PATCH endpoints (authenticated, empty body) ===\n');
  console.log('Status | Method | Path');
  console.log('-------|--------|-----');

  for (const p of PUT_CANDIDATES) {
    const url = `${SITE_URL}${p}`;
    try {
      const resp = await context.request.fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        data: '{}',
      });
      const status = resp.status();
      const accepts = status !== 404 && status !== 405;
      if (accepts) {
        console.log(`  ✓ ${status}  | PATCH  | ${p}`);
      }
    } catch { /* skip */ }
  }

  await browser.close();

  console.log('\n=== PUT endpoints that accept the method (non-404/405) ===\n');
  const accepted = results.filter(r => r.accepts);
  for (const r of accepted) {
    console.log(`  ${r.status} PUT ${r.path}`);
  }
  console.log(`\n  Total: ${accepted.length} endpoints accept PUT`);
}

main().catch(console.error);
