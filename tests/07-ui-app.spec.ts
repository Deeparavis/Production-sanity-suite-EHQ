import { test, expect } from '@playwright/test';
import * as path from 'path';

const uiPageUrl = `file://${path.resolve(__dirname, '../ui/index.html')}`;

test.describe('UI app behaviors', () => {
  test('duration and validation helpers parse expected values @prod-sanity', async ({ page }) => {
    await page.goto(uiPageUrl);

    const result = await page.evaluate(() => {
      const short = (window as any).formatDuration(550);
      const mid = (window as any).formatDuration(1500);
      const long = (window as any).formatDuration(65000);
      const parsed = (window as any).parseValidation('[Homepage] GET / → validates: status=200, perf<5000ms, no-redirect');
      return { short, mid, long, parsed };
    });

    expect(result.short).toBe('550ms');
    expect(result.mid).toBe('1.5s');
    expect(result.long).toBe('1m 5s');
    expect(result.parsed.name).toBe('Homepage');
    expect(result.parsed.badges).toContain('v-status');
    expect(result.parsed.badges).toContain('v-perf');
    expect(result.parsed.badges).toContain('v-redirect');
  });

  test('run form shows required-fields error when inputs are empty @prod-sanity', async ({ page }) => {
    await page.goto(uiPageUrl);

    await page.evaluate(async () => {
      (document.getElementById('siteUrl') as HTMLInputElement).value = '';
      (document.getElementById('username') as HTMLInputElement).value = '';
      (document.getElementById('password') as HTMLInputElement).value = '';
      (document.getElementById('projectSlug') as HTMLInputElement).value = '';
      await (window as any).handleRun();
    });

    await expect(page.locator('#runHint')).toHaveText('All fields are required');
    await expect(page.locator('#runHint')).toHaveClass(/form-error/);
  });

  test('global status badge hides for ready and shows for running @prod-sanity', async ({ page }) => {
    await page.goto(uiPageUrl);

    const states = await page.evaluate(() => {
      (window as any).setGlobalStatus('', 'Ready');
      const hiddenDisplay = getComputedStyle(document.getElementById('globalStatus') as HTMLElement).display;

      (window as any).setGlobalStatus('running', 'Running');
      const badge = document.getElementById('globalStatus') as HTMLElement;
      return {
        hiddenDisplay,
        shownDisplay: getComputedStyle(badge).display,
        shownText: badge.textContent || '',
        shownClass: badge.className,
      };
    });

    expect(states.hiddenDisplay).toBe('none');
    expect(states.shownDisplay).not.toBe('none');
    expect(states.shownText).toContain('Running');
    expect(states.shownClass).toContain('running');
  });

  test('toggle view switches between summary and failures panels @prod-sanity', async ({ page }) => {
    await page.goto(uiPageUrl);

    const visibility = await page.evaluate(() => {
      (window as any).toggleView('failures');
      const failuresDisplay = getComputedStyle(document.getElementById('failuresPanel') as HTMLElement).display;
      const tableHiddenInFailures = getComputedStyle(document.getElementById('resultsTableWrap') as HTMLElement).display;

      (window as any).toggleView('summary');
      const summaryTableDisplay = getComputedStyle(document.getElementById('resultsTableWrap') as HTMLElement).display;
      const summaryFailuresDisplay = getComputedStyle(document.getElementById('failuresPanel') as HTMLElement).display;

      return {
        failuresDisplay,
        tableHiddenInFailures,
        summaryTableDisplay,
        summaryFailuresDisplay,
      };
    });

    expect(visibility.failuresDisplay).not.toBe('none');
    expect(visibility.tableHiddenInFailures).toBe('none');
    expect(visibility.summaryTableDisplay).not.toBe('none');
    expect(visibility.summaryFailuresDisplay).toBe('none');
  });

  test('live count parser updates progress and counts from terminal lines @prod-sanity', async ({ page }) => {
    await page.goto(uiPageUrl);

    const result = await page.evaluate(() => {
      (window as any).parseLiveCounts([
        '  ✓  12 [chromium] › tests/example.spec.ts',
        '  10 passed (2.1s)',
        '  2 failed',
      ]);
      (window as any).updateExecCounts();

      return {
        passedText: (document.getElementById('execPassed') as HTMLElement).textContent,
        failedText: (document.getElementById('execFailed') as HTMLElement).textContent,
        width: (document.getElementById('execBarFill') as HTMLElement).style.width,
      };
    });

    expect(result.passedText).toBe('10 passed');
    expect(result.failedText).toBe('2 failed');
    expect(result.width).not.toBe('0%');
  });
});
