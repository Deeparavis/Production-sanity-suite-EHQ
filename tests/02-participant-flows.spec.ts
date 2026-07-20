import { test, expect } from '@playwright/test';
import { getConfig } from '../src/config/env';
import { dismissCookieConsent } from '../src/helpers/cookieConsent';
import { newSanityContext } from '../src/helpers/testContext';
import { L } from '../src/locators/login.locators';
import { LoginPage } from '../src/pages/loginPage';

const config = getConfig();

test.describe('Participant flows', () => {
  test('registered participant can login and land on home page', { tag: ['@prod-sanity'] }, async ({ browser }) => {
    const ctx = await newSanityContext(browser);
    const page = await ctx.newPage();
    const loginPage = new LoginPage(page, config);

    await loginPage.loginAs(config.participant.username, config.participant.password);

    await expect(page).not.toHaveURL(/login|sign_in/, { timeout: 15_000 });

    if (!(await page.locator(L.header).isVisible().catch(() => false))) {
      await page.goto(config.siteUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    }
    await expect(page.locator(L.header)).toBeVisible({ timeout: 15_000 });

    await ctx.close();
  });

  test('logged in participant can logout successfully', { tag: ['@prod-sanity'] }, async ({ browser }) => {
    const ctx = await newSanityContext(browser);
    const page = await ctx.newPage();
    const loginPage = new LoginPage(page, config);

    await loginPage.loginAs(config.participant.username, config.participant.password);

    if (!(await page.locator(L.header).isVisible().catch(() => false))) {
      await page.goto(config.siteUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    }
    await dismissCookieConsent(page);
    await loginPage.logout();

    const loginLink = page.locator(L.signInLink).first();
    const onLoginPage = page.url().includes('login') || page.url().includes('sign_in');
    const loginVisible = await loginLink.isVisible({ timeout: 10_000 }).catch(() => false);
    expect(onLoginPage || loginVisible).toBeTruthy();

    await ctx.close();
  });

  test('participant can access enabled engagement tools and an action form', { tag: ['@prod-sanity'] }, async ({ browser }) => {
    const ctx = await newSanityContext(browser);
    const page = await ctx.newPage();
    const loginPage = new LoginPage(page, config);
    const toolPaths = [
      'surveys',
      'forums',
      'stories',
      'maps',
      'ideas',
      'polls',
      'qanda',
      'guestbook',
      'newsfeed',
      'key_dates',
    ];

    await loginPage.loginAs(config.participant.username, config.participant.password);

    const enabledTools: string[] = [];
    const actionForms: string[] = [];
    for (const toolPath of toolPaths) {
      const response = await page.goto(
        `${config.siteUrl}/${config.projectSlug}/${toolPath}`,
        { waitUntil: 'domcontentloaded', timeout: 60_000 }
      );
      if (response?.status() !== 200 || new URL(page.url()).pathname === '/404') {
        continue;
      }

      enabledTools.push(toolPath);
      const sameSitePostActions = await page.locator('form').evaluateAll(
        (forms, siteUrl) =>
          forms
            .map((form) => form as HTMLFormElement)
            .filter(
              (form) =>
                form.method.toUpperCase() === 'POST' &&
                form.action.startsWith(siteUrl as string)
            )
            .map((form) => form.action),
        config.siteUrl
      );
      actionForms.push(...sameSitePostActions);
    }

    expect(enabledTools, 'No engagement tool is enabled for the configured project').not.toHaveLength(0);
    expect(
      actionForms,
      `Enabled tools (${enabledTools.join(', ')}) expose no participant action form`
    ).not.toHaveLength(0);

    await ctx.close();
  });
});
