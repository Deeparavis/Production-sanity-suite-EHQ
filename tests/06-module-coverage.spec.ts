import { test, expect, APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

import { L } from '../src/locators/login.locators';
import { getEndpointsByAuth, resolveEndpointUrl } from '../src/config/endpoints';
import { assertEndpointReturnsExpectedStatus } from '../src/helpers/endpointCheck';
import { newSanityContext } from '../src/helpers/testContext';
import { dismissCookieConsent } from '../src/helpers/cookieConsent';
import { createAuthenticatedRequest } from '../src/helpers/authenticatedRequest';
import { LoginPage } from '../src/pages/loginPage';

const envModulePath = require.resolve('../src/config/env');
const rootStoragePath = path.resolve(__dirname, '../storage-state.json');
const rootEndpointsPath = path.resolve(__dirname, '../endpoints.json');

function loadFreshEnvModule() {
  delete require.cache[envModulePath];
  return require('../src/config/env') as typeof import('../src/config/env');
}

class FakeLocator {
  visibleSequence: boolean[];
  clickCount = 0;
  fillValues: string[] = [];
  waitForCount = 0;

  constructor(visibleSequence: boolean[] = [true]) {
    this.visibleSequence = visibleSequence;
  }

  first(): FakeLocator {
    return this;
  }

  async waitFor(): Promise<void> {
    this.waitForCount += 1;
  }

  async fill(value: string): Promise<void> {
    this.fillValues.push(value);
  }

  async click(): Promise<void> {
    this.clickCount += 1;
  }

  async isVisible(): Promise<boolean> {
    if (this.visibleSequence.length > 1) {
      return this.visibleSequence.shift() as boolean;
    }
    return this.visibleSequence[0] ?? false;
  }
}

class FakePage {
  private locators = new Map<string, FakeLocator>();
  gotoCalls: string[] = [];
  waitForUrlCount = 0;
  waitForTimeoutCalls: number[] = [];
  closeCount = 0;

  setLocator(selector: string, locator: FakeLocator): void {
    this.locators.set(selector, locator);
  }

  locator(selector: string): FakeLocator {
    return this.locators.get(selector) ?? new FakeLocator([true]);
  }

  getByRole(role: string, opts: { name: string; exact?: boolean }): FakeLocator {
    return this.locator(`${role}:${opts.name}:${Boolean(opts.exact)}`);
  }

  async goto(url: string): Promise<void> {
    this.gotoCalls.push(url);
  }

  async waitForURL(): Promise<void> {
    this.waitForUrlCount += 1;
  }

  async waitForTimeout(ms: number): Promise<void> {
    this.waitForTimeoutCalls.push(ms);
  }

  async waitForLoadState(): Promise<void> {
    // no-op in fake
  }

  async close(): Promise<void> {
    this.closeCount += 1;
  }
}

test.describe('Module coverage', () => {
  test.beforeEach(() => {
    process.env.EHQ_PROD_SITE_URL = 'https://prod.example.com/';
    process.env.EHQ_PROD_SITE_DOMAIN = 'prod.example.com';
    process.env.PROD_PARTICIPANT_USERNAME = 'participant@example.com';
    process.env.PROD_PARTICIPANT_PASSWORD = 'participant-secret';
    process.env.PROD_SITEADMIN_USERNAME = 'admin@example.com';
    process.env.PROD_SITEADMIN_PASSWORD = 'admin-secret';
    process.env.PROD_PROJECT_SLUG = 'my-project';
    delete process.env.PROD_PLATFORMADMIN_USERNAME;
    delete process.env.PROD_PLATFORMADMIN_PASSWORD;

    if (fs.existsSync(rootStoragePath)) fs.unlinkSync(rootStoragePath);
    if (fs.existsSync(rootEndpointsPath)) fs.unlinkSync(rootEndpointsPath);
  });

  test.afterEach(() => {
    if (fs.existsSync(rootStoragePath)) fs.unlinkSync(rootStoragePath);
    if (fs.existsSync(rootEndpointsPath)) fs.unlinkSync(rootEndpointsPath);
  });

  test('env config loads required values and trims optional platform admin @prod-sanity', async () => {
    process.env.PROD_PLATFORMADMIN_USERNAME = ' optional-admin@example.com ';
    process.env.PROD_PLATFORMADMIN_PASSWORD = ' optional-admin-secret ';
    const env = loadFreshEnvModule();

    const base = env.getBaseConfig();
    const cfg = env.getConfig();

    expect(base.siteUrl).toBe('https://prod.example.com');
    expect(base.siteDomain).toBe('prod.example.com');
    expect(cfg.platformAdmin?.username).toBe(' optional-admin@example.com ');
    expect(cfg.projectSlug).toBe('my-project');
  });

  test('env config throws when required values are missing @prod-sanity', async () => {
    // Empty string is treated as missing and won't be overwritten by dotenv on import.
    process.env.EHQ_PROD_SITE_URL = '';
    const env = loadFreshEnvModule();
    expect(() => env.getBaseConfig()).toThrow(/Required env var EHQ_PROD_SITE_URL/);
  });

  test('env config keeps platform admin undefined unless both optional values exist @prod-sanity', async () => {
    process.env.PROD_PLATFORMADMIN_USERNAME = 'platform-admin@example.com';
    delete process.env.PROD_PLATFORMADMIN_PASSWORD;
    const env = loadFreshEnvModule();
    expect(env.getConfig().platformAdmin).toBeUndefined();
  });

  test('endpoint config resolves path and groups by auth @prod-sanity', async () => {
    const url = resolveEndpointUrl('/{projectSlug}/documents');
    const noLeadingSlashUrl = resolveEndpointUrl('{projectSlug}/documents');
    const publicEndpoints = getEndpointsByAuth('none');
    const participantEndpoints = getEndpointsByAuth('participant');
    const siteAdminEndpoints = getEndpointsByAuth('siteAdmin');

    expect(url).toBe('https://prod.example.com/my-project/documents');
    expect(noLeadingSlashUrl).toBe('https://prod.example.com/my-project/documents');
    expect(publicEndpoints.length).toBeGreaterThan(0);
    expect(participantEndpoints.length).toBeGreaterThan(0);
    expect(siteAdminEndpoints.length).toBeGreaterThan(0);
  });

  test('endpoint config prefers custom endpoints file and validates shape @prod-sanity', async () => {
    fs.writeFileSync(
      rootEndpointsPath,
      JSON.stringify([{ name: 'Custom homepage', path: '/', auth: 'none' }], null, 2),
      'utf-8'
    );
    const customOnly = getEndpointsByAuth('none');
    expect(customOnly).toEqual([{ name: 'Custom homepage', path: '/', auth: 'none' }]);

    fs.writeFileSync(rootEndpointsPath, JSON.stringify([{ path: '/bad' }]), 'utf-8');
    expect(() => getEndpointsByAuth('none')).toThrow(/requires "name" and "path"/);

    fs.writeFileSync(rootEndpointsPath, JSON.stringify([]), 'utf-8');
    expect(() => getEndpointsByAuth('none')).toThrow(/non-empty array/);
  });

  test('endpoint checker validates status, performance, body text and JSON keys @prod-sanity', async () => {
    const fakeRequest = {
      fetch: async () => ({
        status: () => 200,
        text: async () => JSON.stringify({ data: { id: 123 }, name: 'Site Name', html: '<html>' }),
      }),
    } as unknown as APIRequestContext;

    await assertEndpointReturnsExpectedStatus(fakeRequest, {
      name: 'Unit endpoint',
      path: '/api/v2/site',
      method: 'POST',
      expectedStatus: [200, 201],
      maxResponseTimeMs: 10_000,
      bodyContains: 'Site Name',
      bodyHasKey: 'data.id',
      auth: 'none',
    });
  });

  test('endpoint checker fails for non-json when key check is requested @prod-sanity', async () => {
    const fakeRequest = {
      fetch: async () => ({
        status: () => 200,
        text: async () => 'not-json-response',
      }),
    } as unknown as APIRequestContext;

    await expect(
      assertEndpointReturnsExpectedStatus(fakeRequest, {
        name: 'Broken JSON endpoint',
        path: '/api/v2/site',
        bodyHasKey: 'data.id',
        auth: 'none',
      })
    ).rejects.toThrow(/response is not valid JSON/);
  });

  test('endpoint checker applies request options for write methods and no-redirect @prod-sanity', async () => {
    let fetchedUrl = '';
    let fetchedOptions: unknown;
    const fakeRequest = {
      fetch: async (url: string, options: unknown) => {
        fetchedUrl = url;
        fetchedOptions = options;
        return {
          status: () => 204,
          text: async () => '',
        };
      },
    } as unknown as APIRequestContext;

    await assertEndpointReturnsExpectedStatus(fakeRequest, {
      name: 'Delete endpoint',
      path: '/users/sign_out',
      method: 'DELETE',
      noRedirect: true,
      expectedStatus: [204],
      auth: 'siteAdmin',
    });

    expect(fetchedUrl).toBe('https://prod.example.com/users/sign_out');
    expect(fetchedOptions).toEqual({
      method: 'DELETE',
      maxRedirects: 0,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  test('endpoint checker accepts regex bodyContains patterns @prod-sanity', async () => {
    const fakeRequest = {
      fetch: async () => ({
        status: () => 200,
        text: async () => '{"build":"v1.2.3"}',
      }),
    } as unknown as APIRequestContext;

    await assertEndpointReturnsExpectedStatus(fakeRequest, {
      name: 'Regex body check',
      path: '/api/v2/site',
      expectedStatus: 200,
      bodyContains: 'v1\\.2\\.[0-9]+',
      auth: 'none',
    });
  });

  test('endpoint checker fails when status is outside expected list @prod-sanity', async () => {
    const fakeRequest = {
      fetch: async () => ({
        status: () => 500,
        text: async () => 'server error',
      }),
    } as unknown as APIRequestContext;

    await expect(
      assertEndpointReturnsExpectedStatus(fakeRequest, {
        name: 'Wrong status endpoint',
        path: '/health',
        expectedStatus: [200, 204],
        auth: 'none',
      })
    ).rejects.toThrow(/expected one of \[200, 204\], got 500/);
  });

  test('test context uses storage state when available @prod-sanity', async () => {
    fs.writeFileSync(rootStoragePath, JSON.stringify({ cookies: [], origins: [] }), 'utf-8');

    let receivedStorage: unknown = undefined;
    const fakeBrowser = {
      newContext: async (options?: unknown) => {
        receivedStorage = options;
        return {} as BrowserContext;
      },
    } as unknown as Browser;

    await newSanityContext(fakeBrowser);
    expect(receivedStorage).toEqual({ storageState: rootStoragePath });
  });

  test('test context creates clean context when no storage state exists @prod-sanity', async () => {
    let receivedOptions: unknown = 'not-called';
    const fakeBrowser = {
      newContext: async (options?: unknown) => {
        receivedOptions = options;
        return {} as BrowserContext;
      },
    } as unknown as Browser;

    await newSanityContext(fakeBrowser);
    expect(receivedOptions).toBeUndefined();
  });

  test('cookie consent helper clicks while visible and then exits @prod-sanity', async () => {
    const fakePage = new FakePage();
    const acceptAll = new FakeLocator([true, true, false]);
    fakePage.setLocator('button:Accept All:false', acceptAll);

    await dismissCookieConsent(fakePage as unknown as Page);
    expect(acceptAll.clickCount).toBe(2);
  });

  test('cookie consent helper exits immediately when not visible @prod-sanity', async () => {
    const fakePage = new FakePage();
    const acceptAll = new FakeLocator([false]);
    fakePage.setLocator('button:Accept All:false', acceptAll);

    await dismissCookieConsent(fakePage as unknown as Page);
    expect(acceptAll.clickCount).toBe(0);
  });

  test('authenticated request helper logs in and returns request context @prod-sanity', async () => {
    const page = new FakePage();
    const fakeRequestContext = { marker: 'request' } as unknown as APIRequestContext;
    const context = {
      newPage: async () => page as unknown as Page,
      request: fakeRequestContext,
    } as unknown as BrowserContext;

    const fakeBrowser = {
      newContext: async () => context,
    } as unknown as Browser;

    const originalLoginAs = LoginPage.prototype.loginAs;
    let loginCalledWith: { username: string; password: string } | undefined;
    LoginPage.prototype.loginAs = async function (username: string, password: string): Promise<void> {
      loginCalledWith = { username, password };
    };

    try {
      const request = await createAuthenticatedRequest(
        fakeBrowser,
        { siteUrl: 'https://prod.example.com', siteDomain: 'prod.example.com' },
        'user@example.com',
        'secret'
      );
      expect(request).toBe(fakeRequestContext);
      expect(loginCalledWith).toEqual({ username: 'user@example.com', password: 'secret' });
      expect(page.closeCount).toBe(1);
    } finally {
      LoginPage.prototype.loginAs = originalLoginAs;
    }
  });

  test('login page methods call expected actions including logout fallback @prod-sanity', async () => {
    const page = new FakePage();
    const emailInput = new FakeLocator([true]);
    const passwordInput = new FakeLocator([true]);
    const signInButton = new FakeLocator([true]);
    const userMenu = new FakeLocator([true]);
    const logoutLink = new FakeLocator([false, true]);
    const acceptAll = new FakeLocator([false]);

    page.setLocator('#emailOrScreenName, input[type="email"]', emailInput);
    page.setLocator('#loginPassword, input[type="password"]', passwordInput);
    page.setLocator("[data-testid='signIn'], button[type='submit']", signInButton);
    page.setLocator('nav a[href=\'#\']:has(img), [data-scope=\'avatar\'], [data-testid=\'user-menu\'], button[aria-label=\'User menu\'], div[class*=\'avatar\'], button[class*=\'user-menu\']', userMenu);
    page.setLocator('link:Logout:true', logoutLink);
    page.setLocator('button:Accept All:false', acceptAll);

    const loginPage = new LoginPage(
      page as unknown as Page,
      { siteUrl: 'https://prod.example.com', siteDomain: 'prod.example.com' }
    );

    await loginPage.gotoLogin();
    await loginPage.fillCredentials('me@example.com', 'password');
    await loginPage.submitLogin();
    await loginPage.loginAs('me@example.com', 'password');
    await loginPage.logout();

    expect(page.gotoCalls[0]).toBe('https://prod.example.com/login');
    expect(emailInput.fillValues).toContain('me@example.com');
    expect(passwordInput.fillValues).toContain('password');
    expect(signInButton.clickCount).toBeGreaterThan(0);
    expect(userMenu.clickCount).toBe(2);
    expect(logoutLink.clickCount).toBe(1);
    expect(page.waitForUrlCount).toBe(1);
  });

  test('login locators expose expected selectors @prod-sanity', async () => {
    expect(L.usernameInput).toContain('input[type="email"]');
    expect(L.passwordInput).toContain('input[type="password"]');
    expect(L.signInButton).toContain("button[type='submit']");
    expect(L.logoutLink).toContain('Sign out');
  });
});
