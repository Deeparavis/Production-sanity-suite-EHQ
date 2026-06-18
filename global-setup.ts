import { chromium, FullConfig } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

async function globalSetup(config: FullConfig): Promise<void> {
  const siteUrl = process.env.EHQ_PROD_SITE_URL?.replace(/\/$/, '');
  if (!siteUrl) {
    return;
  }

  const storagePath = path.resolve(__dirname, 'storage-state.json');
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(siteUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const acceptAll = page.getByRole('button', { name: 'Accept All' });
  if (await acceptAll.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await acceptAll.click();
    await page.waitForTimeout(1_000);
  }

  await page.context().storageState({ path: storagePath });
  await browser.close();
}

export default globalSetup;
