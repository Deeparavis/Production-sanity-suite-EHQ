import { Page } from '@playwright/test';
import { BaseConfig } from '../config/env';
import { dismissCookieConsent } from '../helpers/cookieConsent';
import { L } from '../locators/login.locators';

export class LoginPage {
  constructor(
    private readonly page: Page,
    private readonly cfg: BaseConfig
  ) {}

  async gotoLogin(): Promise<void> {
    await this.page.goto(`${this.cfg.siteUrl}/login`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await dismissCookieConsent(this.page);
    await this.page.locator(L.usernameInput).first().waitFor({ state: 'visible', timeout: 30_000 });
    await dismissCookieConsent(this.page);
  }

  async fillCredentials(username: string, password: string): Promise<void> {
    const emailInput = this.page.locator(L.usernameInput).first();
    await emailInput.waitFor({ state: 'visible', timeout: 30_000 });
    await emailInput.fill(username);

    const passwordInput = this.page.locator(L.passwordInput).first();
    await passwordInput.fill(password);
  }

  async submitLogin(): Promise<void> {
    await dismissCookieConsent(this.page);
    const signIn = this.page.locator("[data-testid='signIn'], button[type='submit']").first();
    await signIn.waitFor({ state: 'visible', timeout: 15_000 });
    await dismissCookieConsent(this.page);
    await signIn.click();
  }

  async loginAs(username: string, password: string): Promise<void> {
    await this.gotoLogin();
    await this.fillCredentials(username, password);
    await this.submitLogin();
    await this.page.waitForURL(
      (url) => !url.pathname.includes('/login') && !url.pathname.includes('sign_in'),
      { timeout: 30_000 }
    );
  }

  async logout(): Promise<void> {
    await dismissCookieConsent(this.page);

    const userMenu = this.page.locator(L.userMenu).first();
    await userMenu.waitFor({ state: 'visible', timeout: 10_000 });
    await userMenu.click();
    await this.page.waitForTimeout(1_000);

    const logoutLink = this.page.getByRole('link', { name: 'Logout', exact: true });
    if (!(await logoutLink.isVisible({ timeout: 3_000 }).catch(() => false))) {
      await dismissCookieConsent(this.page);
      await userMenu.click();
      await this.page.waitForTimeout(1_000);
    }

    await logoutLink.waitFor({ state: 'visible', timeout: 10_000 });
    await logoutLink.click();
    await this.page.waitForLoadState('domcontentloaded', { timeout: 15_000 });
  }
}
