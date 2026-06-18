import express from 'express';
import cors from 'cors';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
const PORT = process.env.UI_PORT ? parseInt(process.env.UI_PORT) : 3000;
const PROJECT_ROOT = __dirname;
const REPORT_PATH = path.join(PROJECT_ROOT, 'playwright-report', 'results.json');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');
const HISTORY_DIR = path.join(PROJECT_ROOT, 'run-history');

if (!fs.existsSync(HISTORY_DIR)) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(PROJECT_ROOT, 'ui')));

interface RunState {
  status: 'idle' | 'running' | 'completed' | 'failed';
  suite: string;
  siteUrl?: string;
  startedAt?: string;
  finishedAt?: string;
  output: string[];
  pid?: number;
}

let currentRun: RunState = { status: 'idle', suite: '', output: [] };
let activeProcess: ChildProcess | null = null;

const SUITES: Record<string, { label: string; command: string[] }> = {
  all:       { label: 'All Tests',         command: ['npx', 'playwright', 'test'] },
  endpoints: { label: 'Endpoint Checks',   command: ['npx', 'playwright', 'test', 'tests/05-endpoints.spec.ts'] },
  login:     { label: 'Login Page',        command: ['npx', 'playwright', 'test', 'tests/01-login-page.spec.ts'] },
  participant: { label: 'Participant Flows', command: ['npx', 'playwright', 'test', 'tests/02-participant-flows.spec.ts'] },
  admin:     { label: 'Admin Flows',       command: ['npx', 'playwright', 'test', 'tests/03-admin-flows.spec.ts'] },
  public:    { label: 'Public Site',       command: ['npx', 'playwright', 'test', 'tests/04-public-site.spec.ts'] },
};

app.get('/api/suites', (_req, res) => {
  const suites = Object.entries(SUITES).map(([id, s]) => ({ id, label: s.label }));
  res.json(suites);
});

app.get('/api/env', (_req, res) => {
  res.json({
    siteUrl: process.env.EHQ_PROD_SITE_URL ?? '',
    siteDomain: process.env.EHQ_PROD_SITE_DOMAIN ?? '',
    projectSlug: process.env.PROD_PROJECT_SLUG ?? '',
    username: process.env.PROD_SITEADMIN_USERNAME ?? '',
  });
});

app.post('/api/configure', (req, res) => {
  const { siteUrl, username, password, projectSlug } = req.body;

  if (!siteUrl || !username || !password || !projectSlug) {
    res.status(400).json({ error: 'All fields are required' });
    return;
  }

  const cleanUrl = siteUrl.replace(/\/+$/, '');
  let domain: string;
  try {
    domain = new URL(cleanUrl).hostname;
  } catch {
    res.status(400).json({ error: 'Invalid site URL' });
    return;
  }

  const envContent = [
    `EHQ_PROD_SITE_URL=${cleanUrl}`,
    `EHQ_PROD_SITE_DOMAIN=${domain}`,
    '',
    `PROD_PARTICIPANT_USERNAME=${username}`,
    `PROD_PARTICIPANT_PASSWORD=${password}`,
    '',
    `PROD_SITEADMIN_USERNAME=${username}`,
    `PROD_SITEADMIN_PASSWORD=${password}`,
    '',
    `PROD_PROJECT_SLUG=${projectSlug}`,
    '',
  ].join('\n');

  fs.writeFileSync(ENV_PATH, envContent);

  process.env.EHQ_PROD_SITE_URL = cleanUrl;
  process.env.EHQ_PROD_SITE_DOMAIN = domain;
  process.env.PROD_PARTICIPANT_USERNAME = username;
  process.env.PROD_PARTICIPANT_PASSWORD = password;
  process.env.PROD_SITEADMIN_USERNAME = username;
  process.env.PROD_SITEADMIN_PASSWORD = password;
  process.env.PROD_PROJECT_SLUG = projectSlug;

  res.json({ message: 'Configuration saved', siteUrl: cleanUrl, domain, projectSlug });
});

app.post('/api/run/:suite', (req, res) => {
  const suiteId = req.params.suite;
  const suite = SUITES[suiteId];
  if (!suite) {
    res.status(400).json({ error: `Unknown suite: ${suiteId}` });
    return;
  }

  if (currentRun.status === 'running') {
    res.status(409).json({ error: 'A test run is already in progress' });
    return;
  }

  currentRun = {
    status: 'running',
    suite: suite.label,
    siteUrl: process.env.EHQ_PROD_SITE_URL,
    startedAt: new Date().toISOString(),
    output: [],
  };

  const [cmd, ...args] = suite.command;
  const child = spawn(cmd, args, {
    cwd: PROJECT_ROOT,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    shell: true,
  });

  activeProcess = child;
  currentRun.pid = child.pid;

  child.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean);
    currentRun.output.push(...lines);
  });

  child.stderr?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean);
    currentRun.output.push(...lines);
  });

  child.on('close', (code) => {
    currentRun.status = code === 0 ? 'completed' : 'failed';
    currentRun.finishedAt = new Date().toISOString();
    activeProcess = null;
    saveRunToHistory();
  });

  res.json({ message: `Started: ${suite.label}`, suite: suiteId });
});

app.post('/api/stop', (_req, res) => {
  if (!activeProcess) {
    res.status(400).json({ error: 'No test run in progress' });
    return;
  }
  activeProcess.kill('SIGTERM');
  currentRun.status = 'failed';
  currentRun.finishedAt = new Date().toISOString();
  currentRun.output.push('--- Run cancelled by user ---');
  activeProcess = null;
  res.json({ message: 'Test run stopped' });
});

app.get('/api/status', (_req, res) => {
  res.json({
    status: currentRun.status,
    suite: currentRun.suite,
    siteUrl: currentRun.siteUrl,
    startedAt: currentRun.startedAt,
    finishedAt: currentRun.finishedAt,
    outputLines: currentRun.output.length,
    lastLines: currentRun.output.slice(-40),
  });
});

app.get('/api/output', (_req, res) => {
  res.json({ output: currentRun.output });
});

interface Spec {
  title: string;
  ok: boolean;
  tags?: string[];
  tests?: Array<{
    status: string;
    results?: Array<{
      status: string;
      duration: number;
      errors?: Array<{ message?: string }>;
      startTime?: string;
    }>;
  }>;
}

interface Suite {
  title: string;
  specs?: Spec[];
  suites?: Suite[];
}

interface ReportJson {
  config: { version: string };
  suites: Suite[];
  errors?: Array<{ message: string }>;
}

function flattenSpecs(suites: Suite[], parentTitle = ''): any[] {
  const results: any[] = [];
  for (const suite of suites) {
    const suitePath = parentTitle ? `${parentTitle} > ${suite.title}` : suite.title;
    if (suite.specs) {
      for (const spec of suite.specs) {
        const test = spec.tests?.[0];
        const result = test?.results?.[0];
        results.push({
          title: spec.title,
          suite: suitePath,
          ok: spec.ok,
          status: result?.status ?? 'unknown',
          duration: result?.duration ?? 0,
          tags: spec.tags ?? [],
          error: result?.errors?.[0]?.message?.slice(0, 300) ?? null,
        });
      }
    }
    if (suite.suites) {
      results.push(...flattenSpecs(suite.suites, suitePath));
    }
  }
  return results;
}

app.get('/api/report', (_req, res) => {
  if (!fs.existsSync(REPORT_PATH)) {
    res.status(404).json({ error: 'No report found. Run a test suite first.' });
    return;
  }

  try {
    const raw: ReportJson = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf-8'));
    const specs = flattenSpecs(raw.suites);
    const passed = specs.filter(s => s.status === 'passed').length;
    const failed = specs.filter(s => s.status === 'failed').length;
    const skipped = specs.filter(s => s.status === 'skipped').length;
    const totalDuration = specs.reduce((sum, s) => sum + s.duration, 0);

    res.json({
      version: raw.config?.version,
      summary: {
        total: specs.length,
        passed,
        failed,
        skipped,
        passRate: specs.length ? Math.round((passed / specs.length) * 10000) / 100 : 0,
        totalDurationMs: totalDuration,
      },
      specs,
      errors: raw.errors ?? [],
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to parse report: ${err.message}` });
  }
});

function parseReportFile(filePath: string) {
  const raw: ReportJson = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const specs = flattenSpecs(raw.suites);
  const passed = specs.filter(s => s.status === 'passed').length;
  const failed = specs.filter(s => s.status === 'failed').length;
  const skipped = specs.filter(s => s.status === 'skipped').length;
  const totalDuration = specs.reduce((sum, s) => sum + s.duration, 0);
  return {
    version: raw.config?.version,
    summary: { total: specs.length, passed, failed, skipped, passRate: specs.length ? Math.round((passed / specs.length) * 10000) / 100 : 0, totalDurationMs: totalDuration },
    specs,
    errors: raw.errors ?? [],
  };
}

function saveRunToHistory() {
  if (!fs.existsSync(REPORT_PATH)) return;
  try {
    const ts = currentRun.startedAt ?? new Date().toISOString();
    const id = ts.replace(/[:.]/g, '-');
    const destDir = path.join(HISTORY_DIR, id);
    fs.mkdirSync(destDir, { recursive: true });

    fs.copyFileSync(REPORT_PATH, path.join(destDir, 'results.json'));

    const meta = {
      id,
      suite: currentRun.suite,
      siteUrl: currentRun.siteUrl ?? '',
      status: currentRun.status,
      startedAt: currentRun.startedAt,
      finishedAt: currentRun.finishedAt,
    };
    fs.writeFileSync(path.join(destDir, 'meta.json'), JSON.stringify(meta, null, 2));
  } catch (e) { /* ignore save errors */ }
}

app.get('/api/runs', (_req, res) => {
  try {
    if (!fs.existsSync(HISTORY_DIR)) { res.json([]); return; }
    const dirs = fs.readdirSync(HISTORY_DIR);
    const entries = [];
    for (const name of dirs) {
      const metaPath = path.join(HISTORY_DIR, name, 'meta.json');
      if (!fs.existsSync(metaPath)) continue;
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      const rptPath = path.join(HISTORY_DIR, name, 'results.json');
      let summary = null;
      if (fs.existsSync(rptPath)) {
        try { summary = parseReportFile(rptPath).summary; } catch (e2) { /* skip */ }
      }
      entries.push({ ...meta, summary });
    }
    entries.sort((a: any, b: any) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
    res.json(entries);
  } catch (e) {
    res.json([]);
  }
});

app.get('/api/runs/:id', (req, res) => {
  const runId = req.params.id;
  const rptPath = path.join(HISTORY_DIR, runId, 'results.json');
  if (!fs.existsSync(rptPath)) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }
  try {
    const report = parseReportFile(rptPath);
    const meta = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, runId, 'meta.json'), 'utf-8'));
    res.json({ ...report, meta });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to load run: ${err.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`\n  Sanity Suite UI running at: http://localhost:${PORT}\n`);
});
