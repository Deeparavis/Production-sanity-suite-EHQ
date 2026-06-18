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
});
