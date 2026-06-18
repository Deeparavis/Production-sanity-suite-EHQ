import { test, expect } from '@playwright/test';
import { getBaseConfig, getConfig } from '../src/config/env';
import { dismissCookieConsent } from '../src/helpers/cookieConsent';
import { L } from '../src/locators/login.locators';

const base = getBaseConfig();

test.describe('Public site', () => {
  test('anonymous homepage loads successfully', { tag: ['@prod-sanity'] }, async ({ page }) => {
    const response = await page.goto(base.siteUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    expect(response?.ok()).toBeTruthy();
    await dismissCookieConsent(page);
    await expect(page.locator(L.header)).toBeVisible({ timeout: 30_000 });
  });

  test('published project page loads for anonymous user', { tag: ['@prod-sanity'] }, async ({ page }) => {
    const config = getConfig();
    const response = await page.goto(`${base.siteUrl}/${config.projectSlug}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    expect(response?.ok()).toBeTruthy();
    await dismissCookieConsent(page);
    await expect(page.locator(L.header)).toBeVisible({ timeout: 30_000 });
    await expect(page).not.toHaveURL(/login|sign_in/, { timeout: 5_000 });
  });
});
