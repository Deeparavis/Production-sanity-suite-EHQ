import { chromium } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { LoginPage } from '../src/pages/loginPage';
import { getConfig } from '../src/config/env';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const config = getConfig();
const SITE_URL = config.siteUrl;
const PROJECT_SLUG = config.projectSlug;

const SEED_PAGES = [
  '/adm',
  '/adm/dashboard',
  '/adm/projects',
  '/adm/users',
  '/adm/settings',
  '/adm/reports',
  '/adm/moderation',
  '/adm/engagement',
  '/adm/analytics',
  '/adm/integrations',
  '/adm/emails',
  '/adm/themes',
  '/adm/permissions',
  '/adm/activity',
  '/adm/site',
  '/adm/site/settings',
  '/adm/branding',
  `/adm/projects/${PROJECT_SLUG}`,
  `/adm/projects/${PROJECT_SLUG}/settings`,
  `/admin/projects/${PROJECT_SLUG}`,
  '/',
  '/login',
  '/projects',
  `/${PROJECT_SLUG}`,
];

async function extractLinks(page: import('@playwright/test').Page, siteUrl: string): Promise<string[]> {
  // Wait for SPA content to render
  await page.waitForTimeout(3000);
  await page.waitForLoadState('networkidle').catch(() => {});

  return page.evaluate((su: string) => {
    const results = new Set<string>();

    // Standard anchor tags
    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') || '';
      if (href.startsWith('/')) results.add(href);
      else if (href.startsWith(su)) results.add(href.replace(su, ''));
    }

    // React router links and buttons with data attributes
    for (const el of document.querySelectorAll('[data-href], [data-to], [data-link]')) {
      for (const attr of ['data-href', 'data-to', 'data-link']) {
        const val = el.getAttribute(attr);
        if (val?.startsWith('/')) results.add(val);
      }
    }

    // Links rendered inside iframes (PFE admin)
    for (const iframe of document.querySelectorAll('iframe')) {
      try {
        const iframeDoc = iframe.contentDocument;
        if (!iframeDoc) continue;
        for (const a of iframeDoc.querySelectorAll('a[href]')) {
          const href = a.getAttribute('href') || '';
          if (href.startsWith('/')) results.add(href);
          else if (href.startsWith(su)) results.add(href.replace(su, ''));
        }
      } catch { /* cross-origin */ }
    }

    return [...results];
  }, siteUrl);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  // Intercept all navigation requests to capture API and page routes
  const networkUrls = new Set<string>();
  page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith(SITE_URL)) {
      const p = url.replace(SITE_URL, '').split('?')[0].split('#')[0];
      if (p && !p.includes('.') && !p.startsWith('/assets') && !p.startsWith('/packs')) {
        networkUrls.add(p.replace(/\/$/, '') || '/');
      }
    }
  });

  console.log(`Logging in to ${SITE_URL} as ${config.siteAdmin.username}...`);
  const loginPage = new LoginPage(page, config);
  await loginPage.loginAs(config.siteAdmin.username, config.siteAdmin.password);
  console.log('Logged in successfully.\n');

  const discoveredLinks = new Set<string>();

  for (const seedPath of SEED_PAGES) {
    const url = `${SITE_URL}${seedPath}`;
    process.stdout.write(`Crawling ${seedPath}...`);
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      if (!resp || resp.status() >= 400) {
        console.log(` SKIP (${resp?.status() ?? 'no response'})`);
        continue;
      }

      const links = await extractLinks(page, SITE_URL);
      let newCount = 0;
      for (const link of links) {
        const clean = link.split('?')[0].split('#')[0].replace(/\/$/, '') || '/';
        if (!discoveredLinks.has(clean)) {
          discoveredLinks.add(clean);
          newCount++;
        }
      }
      console.log(` ${links.length} links, ${newCount} new`);
    } catch (e) {
      console.log(` ERROR`);
    }
  }

  // Add network-discovered routes
  for (const p of networkUrls) {
    discoveredLinks.add(p);
  }

  await browser.close();

  const sorted = [...discoveredLinks]
    .filter((p) => !p.startsWith('/cable') && !p.startsWith('/auth'))
    .sort();

  const adminPaths = sorted.filter((p) => p.startsWith('/adm') || p.startsWith('/admin'));
  const publicPaths = sorted.filter((p) => !p.startsWith('/adm') && !p.startsWith('/admin'));

  console.log('\n========================================');
  console.log('   DISCOVERED ADMIN ENDPOINTS');
  console.log('========================================');
  for (const p of adminPaths) console.log(`  ${p}`);
  console.log(`\n  Total: ${adminPaths.length} admin endpoints\n`);

  console.log('========================================');
  console.log('   DISCOVERED PUBLIC ENDPOINTS');
  console.log('========================================');
  for (const p of publicPaths) console.log(`  ${p}`);
  console.log(`\n  Total: ${publicPaths.length} public endpoints\n`);

  console.log(`Grand total: ${sorted.length} unique endpoints discovered`);

  // Now HTTP-check all discovered endpoints to see which respond 200
  console.log('\n========================================');
  console.log('   VERIFYING ENDPOINT STATUS CODES');
  console.log('========================================\n');

  const verifyBrowser = await chromium.launch({ headless: true });
  const verifyCtx = await verifyBrowser.newContext({ ignoreHTTPSErrors: true });
  const verifyPage = await verifyCtx.newPage();
  const verifyLogin = new LoginPage(verifyPage, config);
  await verifyLogin.loginAs(config.siteAdmin.username, config.siteAdmin.password);

  const results: { path: string; status: number }[] = [];
  for (const p of sorted) {
    try {
      const resp = await verifyCtx.request.fetch(`${SITE_URL}${p}`, { method: 'GET' });
      results.push({ path: p, status: resp.status() });
      const mark = resp.status() === 200 ? '✓' : '✘';
      console.log(`  ${mark} ${resp.status()} ${p}`);
    } catch {
      results.push({ path: p, status: 0 });
      console.log(`  ✘ ERR ${p}`);
    }
  }

  await verifyBrowser.close();

  const passing = results.filter((r) => r.status === 200);
  const failing = results.filter((r) => r.status !== 200);
  console.log(`\n${passing.length} passed (200), ${failing.length} non-200`);
}

main().catch(console.error);
