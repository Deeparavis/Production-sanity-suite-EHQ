import { Browser, BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const storageStatePath = path.resolve(__dirname, '../../storage-state.json');

export async function newSanityContext(browser: Browser): Promise<BrowserContext> {
  if (fs.existsSync(storageStatePath)) {
    return browser.newContext({ storageState: storageStatePath });
  }
  return browser.newContext();
}
