import { test, expect } from '@playwright/test';
import { getBaseConfig } from '../src/config/env';
import { dismissCookieConsent } from '../src/helpers/cookieConsent';
import { L } from '../src/locators/login.locators';
import { LoginPage } from '../src/pages/loginPage';

const base = getBaseConfig();

test.describe('Login page', () => {
  test('login page loads with email, password, and sign-in controls', { tag: ['@prod-sanity'] }, async ({ page }) => {
    await page.goto(`${base.siteUrl}/login`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    await expect(page.locator(L.usernameInput).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(L.passwordInput).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(L.signInButton).first()).toBeVisible({ timeout: 30_000 });
  });

  test('anonymous homepage loads with header visible', { tag: ['@prod-sanity'] }, async ({ page }) => {
    await page.goto(base.siteUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await dismissCookieConsent(page);

    await expect(page.locator(L.header)).toBeVisible({ timeout: 30_000 });
  });

  test('invalid credentials show an error and remain on login', { tag: ['@prod-sanity'] }, async ({ page }) => {
    const loginPage = new LoginPage(page, base);

    await loginPage.gotoLogin();
    await loginPage.fillCredentials('invalid@example.com', 'wrongpassword123');
    await loginPage.submitLogin();

    await expect(page.locator(L.errorMsg).first()).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/login|sign_in/, { timeout: 15_000 });
  });
});
