import { APIRequestContext, Browser } from '@playwright/test';
import { BaseConfig } from '../config/env';
import { LoginPage } from '../pages/loginPage';

export async function createAuthenticatedRequest(
  browser: Browser,
  cfg: BaseConfig,
  username: string,
  password: string
): Promise<APIRequestContext> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const loginPage = new LoginPage(page, cfg);

  await loginPage.loginAs(username, password);
  await page.close();

  return context.request;
}
