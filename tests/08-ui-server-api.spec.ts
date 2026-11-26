import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const projectRoot = path.resolve(__dirname, '..');
const port = 3199;
const baseUrl = `http://127.0.0.1:${port}`;
const reportPath = path.join(projectRoot, 'playwright-report', 'results.json');
const historyDir = path.join(projectRoot, 'run-history');
const envPath = path.join(projectRoot, '.env');
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

function buildReportFixture() {
  return {
    config: { version: '1.44.0' },
    suites: [
      {
        title: 'Endpoint health checks',
        specs: [
          {
            title: '[Homepage] GET / → validates: status=200',
            ok: true,
            tags: ['@prod-sanity'],
            tests: [{ status: 'passed', results: [{ status: 'passed', duration: 120 }] }],
          },
          {
            title: '[Admin dashboard] GET /adm → validates: status=200',
            ok: false,
            tests: [
              {
                status: 'failed',
                results: [{ status: 'failed', duration: 250, errors: [{ message: 'Expected 200, got 302' }] }],
              },
            ],
          },
          {
            title: '[Skipped endpoint] GET /skipped → validates: status=200',
            ok: true,
            tests: [{ status: 'skipped', results: [{ status: 'skipped', duration: 0 }] }],
          },
        ],
      },
    ],
    errors: [],
  };
}

async function withReportFixture<T>(fn: () => Promise<T>): Promise<T> {
  const existed = fs.existsSync(reportPath);
  const previous = existed ? fs.readFileSync(reportPath, 'utf-8') : null;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(buildReportFixture(), null, 2), 'utf-8');

  try {
    return await fn();
  } finally {
    if (previous === null) {
      if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);
    } else {
      fs.writeFileSync(reportPath, previous, 'utf-8');
    }
  }
}

async function withEnvFileRestore<T>(fn: () => Promise<T>): Promise<T> {
  const existed = fs.existsSync(envPath);
  const previous = existed ? fs.readFileSync(envPath, 'utf-8') : null;

  try {
    return await fn();
  } finally {
    if (previous === null) {
      if (fs.existsSync(envPath)) fs.unlinkSync(envPath);
    } else {
      fs.writeFileSync(envPath, previous, 'utf-8');
    }
  }
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

  test('configure accepts valid payload and updates env endpoint @prod-sanity', async ({ request }) => {
    await withEnvFileRestore(async () => {
      const configure = await request.post(`${baseUrl}/api/configure`, {
        data: {
          siteUrl: 'https://qa.example.com/',
          username: 'admin@example.com',
          password: 'password123',
          projectSlug: 'my-project',
        },
      });

      expect(configure.status()).toBe(200);
      const configureBody = await configure.json();
      expect(configureBody.siteUrl).toBe('https://qa.example.com');
      expect(configureBody.domain).toBe('qa.example.com');
      expect(configureBody.projectSlug).toBe('my-project');

      const env = await request.get(`${baseUrl}/api/env`);
      expect(env.ok()).toBeTruthy();
      const envBody = await env.json();
      expect(envBody.siteUrl).toBe('https://qa.example.com');
      expect(envBody.siteDomain).toBe('qa.example.com');
      expect(envBody.projectSlug).toBe('my-project');
      expect(envBody.username).toBe('admin@example.com');
    });
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

  test('report endpoint parses summary from results file @prod-sanity', async ({ request }) => {
    await withReportFixture(async () => {
      const res = await request.get(`${baseUrl}/api/report`);
      expect(res.status()).toBe(200);
      const body = await res.json();

      expect(body.version).toBe('1.44.0');
      expect(body.summary.total).toBe(3);
      expect(body.summary.passed).toBe(1);
      expect(body.summary.failed).toBe(1);
      expect(body.summary.skipped).toBe(1);
      expect(body.summary.passRate).toBeCloseTo(33.33, 2);
      expect(body.summary.totalDurationMs).toBe(370);
      expect(body.specs.length).toBe(3);
    });
  });

  test('report download supports csv, html, json and rejects invalid format @prod-sanity', async ({ request }) => {
    await withReportFixture(async () => {
      const csv = await request.get(`${baseUrl}/api/report/download?format=csv`);
      expect(csv.status()).toBe(200);
      expect(csv.headers()['content-type']).toContain('text/csv');
      expect(await csv.text()).toContain('EHQ Production Sanity Suite Report');

      const html = await request.get(`${baseUrl}/api/report/download?format=html`);
      expect(html.status()).toBe(200);
      expect(html.headers()['content-type']).toContain('text/html');
      expect(await html.text()).toContain('<!DOCTYPE html>');

      const json = await request.get(`${baseUrl}/api/report/download?format=json`);
      expect(json.status()).toBe(200);
      expect(json.headers()['content-type']).toContain('application/json');
      const reportJson = await json.json();
      expect(reportJson.config.version).toBe('1.44.0');

      const bad = await request.get(`${baseUrl}/api/report/download?format=xml`);
      expect(bad.status()).toBe(400);
      const badBody = await bad.json();
      expect(badBody.error).toContain('Invalid format');
    });
  });

  test('history APIs list, read, and download a saved run @prod-sanity', async ({ request }) => {
    await withReportFixture(async () => {
      const runId = `unit-run-${Date.now()}`;
      const runDir = path.join(historyDir, runId);
      const metaPath = path.join(runDir, 'meta.json');
      const resultPath = path.join(runDir, 'results.json');

      fs.mkdirSync(runDir, { recursive: true });
      fs.writeFileSync(resultPath, JSON.stringify(buildReportFixture(), null, 2), 'utf-8');
      fs.writeFileSync(
        metaPath,
        JSON.stringify(
          {
            id: runId,
            suite: 'Endpoint Checks',
            siteUrl: 'https://qa.example.com',
            status: 'completed',
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
          },
          null,
          2
        ),
        'utf-8'
      );

      try {
        const list = await request.get(`${baseUrl}/api/runs`);
        expect(list.status()).toBe(200);
        const runs = await list.json();
        expect(runs.some((r: { id: string }) => r.id === runId)).toBeTruthy();

        const single = await request.get(`${baseUrl}/api/runs/${runId}`);
        expect(single.status()).toBe(200);
        const singleBody = await single.json();
        expect(singleBody.meta.id).toBe(runId);
        expect(singleBody.summary.total).toBe(3);

        const download = await request.get(`${baseUrl}/api/runs/${runId}/download?format=csv`);
        expect(download.status()).toBe(200);
        expect(download.headers()['content-type']).toContain('text/csv');
        expect(await download.text()).toContain('Suite,Endpoint Checks');
      } finally {
        fs.rmSync(runDir, { recursive: true, force: true });
      }
    });
  });
});
