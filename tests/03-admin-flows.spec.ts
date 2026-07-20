import { test, expect } from '@playwright/test';
import { getConfig } from '../src/config/env';
import { newSanityContext } from '../src/helpers/testContext';
import { L } from '../src/locators/login.locators';
import { LoginPage } from '../src/pages/loginPage';

const config = getConfig();

test.describe('Admin flows', () => {
  test('unauthenticated visitor cannot access the admin dashboard', { tag: ['@prod-sanity'] }, async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto(`${config.siteUrl}/adm`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    await expect
      .poll(
        async () =>
          /login|sign_in/.test(new URL(page.url()).pathname) ||
          page.locator(L.usernameInput).first().isVisible().catch(() => false),
        {
          message: 'Unauthenticated admin SPA did not redirect to or render login',
          timeout: 30_000,
        }
      )
      .toBe(true);

    await ctx.close();
  });

  test('site admin can login and reach dashboard', { tag: ['@prod-sanity'] }, async ({ browser }) => {
    const ctx = await newSanityContext(browser);
    const page = await ctx.newPage();
    const loginPage = new LoginPage(page, config);

    await loginPage.loginAs(config.siteAdmin.username, config.siteAdmin.password);

    const dashboardEl = page.locator(L.projectsNav).first();
    await expect(dashboardEl).toBeVisible({ timeout: 30_000 });

    await ctx.close();
  });

  test('site admin can open existing project admin page read-only', { tag: ['@prod-sanity'] }, async ({ browser }) => {
    const ctx = await newSanityContext(browser);
    const page = await ctx.newPage();
    const loginPage = new LoginPage(page, config);

    await loginPage.loginAs(config.siteAdmin.username, config.siteAdmin.password);

    await page.goto(`${config.siteUrl}/admin/projects/${config.projectSlug}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    await expect(page).not.toHaveURL(/login|sign_in/, { timeout: 15_000 });
    await expect(page.locator('header, nav, main, [data-testid]').first()).toBeVisible({ timeout: 30_000 });

    await ctx.close();
  });

  test('site admin navigates to dashboard without PFE profile redirect', { tag: ['@prod-sanity'] }, async ({ browser }) => {
    const ctx = await newSanityContext(browser);
    const page = await ctx.newPage();
    const loginPage = new LoginPage(page, config);

    await loginPage.loginAs(config.siteAdmin.username, config.siteAdmin.password);

    await page.goto(`${config.siteUrl}/adm`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    await expect(page.locator(L.projectsNav).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("h1:text-is('My Profile')")).not.toBeVisible({ timeout: 5_000 });

    await ctx.close();
  });
});
