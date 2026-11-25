import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

const projectRoot = path.resolve(__dirname, '..');
const port = 3199;
const baseUrl = `http://127.0.0.1:${port}`;
let serverProcess: ChildProcess | null = null;

async function waitForServerReady(timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/suites`);
      if (res.ok) return;
    } catch {
      // keep waiting while booting
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('UI server did not start in time');
}

test.describe('UI server API', () => {
  test.beforeAll(async () => {
    serverProcess = spawn('node', ['--import', 'tsx', 'server.ts'], {
      cwd: projectRoot,
      env: { ...process.env, UI_PORT: String(port), FORCE_COLOR: '0', NO_COLOR: '1' },
    });

    await waitForServerReady();
  });

  test.afterAll(async () => {
    if (!serverProcess) return;
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  });

  test('lists available suites @prod-sanity', async ({ request }) => {
    const res = await request.get(`${baseUrl}/api/suites`);
    expect(res.ok()).toBeTruthy();
    const suites = await res.json();

    const ids = suites.map((s: { id: string }) => s.id);
    expect(ids).toContain('all');
    expect(ids).toContain('endpoints');
    expect(ids).toContain('login');
    expect(ids).toContain('participant');
    expect(ids).toContain('admin');
    expect(ids).toContain('public');
  });

  test('env endpoint returns expected keys @prod-sanity', async ({ request }) => {
    const res = await request.get(`${baseUrl}/api/env`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    expect(body).toHaveProperty('siteUrl');
    expect(body).toHaveProperty('siteDomain');
    expect(body).toHaveProperty('projectSlug');
    expect(body).toHaveProperty('username');
  });

  test('configure rejects incomplete payload @prod-sanity', async ({ request }) => {
    const res = await request.post(`${baseUrl}/api/configure`, {
      data: { siteUrl: '', username: '', password: '', projectSlug: '' },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('All fields are required');
  });

  test('run rejects unknown suite id @prod-sanity', async ({ request }) => {
    const res = await request.post(`${baseUrl}/api/run/not-a-suite`);
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Unknown suite');
  });

  test('stop reports no active run when idle @prod-sanity', async ({ request }) => {
    const res = await request.post(`${baseUrl}/api/stop`);
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('No test run in progress');
  });

  test('missing history run returns 404 @prod-sanity', async ({ request }) => {
    const res = await request.get(`${baseUrl}/api/runs/non-existent-run-id`);
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('Run not found');
  });
});
