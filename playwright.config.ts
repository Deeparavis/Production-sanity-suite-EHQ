import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const storageStatePath = path.resolve(__dirname, 'storage-state.json');

export default defineConfig({
  globalSetup: require.resolve('./global-setup'),
  testDir: './tests',
  grep:
    process.env.ALLOW_PROD_WRITE_VALIDATION === 'true'
      ? /@prod-write-validation/
      : process.env.ALLOW_WRITE_TESTS === 'true'
        ? /@write-apis/
        : /@prod-sanity/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },

  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
    ['json', { outputFile: 'playwright-report/results.json' }],
  ],

  use: {
    headless: process.env.PW_HEADED !== 'true',
    storageState: fs.existsSync(storageStatePath) ? storageStatePath : undefined,
    viewport: { width: 1920, height: 1080 },
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  outputDir: 'test-results/',
});
