import { Page } from '@playwright/test';

/** Dismiss cookie consent modal if it blocks interactions. */
export async function dismissCookieConsent(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const acceptAll = page.getByRole('button', { name: 'Accept All' });
    if (!(await acceptAll.isVisible({ timeout: 2_000 }).catch(() => false))) {
      break;
    }
    await acceptAll.click();
    await page.waitForTimeout(500);
  }
}
