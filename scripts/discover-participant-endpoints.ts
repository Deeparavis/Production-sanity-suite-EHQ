import { chromium } from '@playwright/test';
import { getConfig } from '../src/config/env';
import { LoginPage } from '../src/pages/loginPage';

const routeTemplates = [
  '/',
  '/{projectSlug}',
  '/{projectSlug}/documents',
  '/{projectSlug}/faqs',
  '/{projectSlug}/photos',
  '/{projectSlug}/videos',
  '/{projectSlug}/surveys',
  '/{projectSlug}/forums',
  '/{projectSlug}/stories',
  '/{projectSlug}/maps',
  '/{projectSlug}/ideas',
  '/{projectSlug}/polls',
  '/{projectSlug}/qanda',
  '/{projectSlug}/guestbook',
  '/{projectSlug}/newsfeed',
  '/{projectSlug}/key_dates',
  '/profile',
  '/users/edit',
  '/account',
  '/session_info',
  '/token',
  '/api/v2/users/current',
  '/api/v2/user_subscriptions',
  '/api/v2/recommendations',
  '/api/v2/projects/{projectSlug}',
];

async function main(): Promise<void> {
  const config = getConfig();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await new LoginPage(page, config).loginAs(
    config.participant.username,
    config.participant.password
  );

  console.log('Status\tFinal path\tRequested path\tForms\tAction controls');
  for (const template of routeTemplates) {
    const route = template.replace('{projectSlug}', config.projectSlug);
    const response = await page.goto(`${config.siteUrl}${route}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    const finalPath = new URL(page.url()).pathname;
    const forms = await page.locator('form').evaluateAll((nodes) =>
      nodes.map((node) => {
        const form = node as HTMLFormElement;
        return `${(form.method || 'get').toUpperCase()} ${form.action || '-'}`;
      })
    );
    const actionControls = await page
      .locator('button:visible, a:visible')
      .allTextContents()
      .then((labels) =>
        labels
          .map((label) => label.trim().replace(/\s+/g, ' '))
          .filter((label) => /comment|submit|story|question|answer|vote|idea|follow/i.test(label))
          .slice(0, 10)
      );
    console.log(
      `${response?.status() ?? 0}\t${finalPath}\t${template}\t${forms.join(' | ') || '-'}\t${actionControls.join(' | ') || '-'}`
    );
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
