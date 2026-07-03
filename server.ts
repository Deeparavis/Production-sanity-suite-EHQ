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

app.get('/api/report/download', (req, res) => {
  if (!fs.existsSync(REPORT_PATH)) {
    res.status(404).json({ error: 'No report found. Run a test suite first.' });
    return;
  }

  const format = String(req.query.format ?? 'csv').toLowerCase();
  sendReportDownload(res, REPORT_PATH, format, {
    siteUrl: process.env.EHQ_PROD_SITE_URL,
    suite: currentRun.suite || 'Latest run',
    startedAt: currentRun.finishedAt ?? currentRun.startedAt,
  });
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

function csvEscape(value: unknown): string {
  const s = String(value ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsvReport(
  specs: ReturnType<typeof parseReportFile>['specs'],
  summary: ReturnType<typeof parseReportFile>['summary'],
  meta?: { siteUrl?: string; suite?: string; startedAt?: string }
): string {
  const lines: string[] = [
    'EHQ Production Sanity Suite Report',
    `Site,${csvEscape(meta?.siteUrl ?? '')}`,
    `Suite,${csvEscape(meta?.suite ?? '')}`,
    `Started,${csvEscape(meta?.startedAt ?? '')}`,
    `Total,${summary.total}`,
    `Passed,${summary.passed}`,
    `Failed,${summary.failed}`,
    `Skipped,${summary.skipped}`,
    `Pass Rate,${summary.passRate}%`,
    `Duration (ms),${summary.totalDurationMs}`,
    '',
    ['Status', 'Test', 'Suite', 'Duration (ms)', 'Error'].join(','),
  ];

  for (const spec of specs) {
    lines.push([
      spec.status,
      spec.title,
      spec.suite,
      spec.duration,
      spec.error ?? '',
    ].map(csvEscape).join(','));
  }

  return lines.join('\n');
}

function htmlEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function buildHtmlReport(
  specs: ReturnType<typeof parseReportFile>['specs'],
  summary: ReturnType<typeof parseReportFile>['summary'],
  meta?: { siteUrl?: string; suite?: string; startedAt?: string }
): string {
  const generatedAt = new Date().toISOString();
  const verdictClass = summary.failed === 0 ? 'pass' : 'fail';
  const verdictText = summary.failed === 0
    ? `All ${summary.total} tests passed`
    : `${summary.failed} of ${summary.total} tests failed`;

  const rows = specs.map((spec) => `
      <tr>
        <td><span class="badge ${htmlEscape(spec.status)}">${htmlEscape(spec.status)}</span></td>
        <td>${htmlEscape(spec.title)}</td>
        <td class="muted">${htmlEscape(spec.suite)}</td>
        <td class="mono">${htmlEscape(formatDurationMs(spec.duration))}</td>
        <td class="error-cell">${spec.error ? htmlEscape(spec.error) : '—'}</td>
      </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>EHQ Sanity Report — ${htmlEscape(meta?.siteUrl ?? 'Report')}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f8f9ff;
      color: #0c0e1a;
      line-height: 1.5;
      padding: 32px 20px 48px;
    }
    .container { max-width: 1100px; margin: 0 auto; }
    h1 { font-size: 24px; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 6px; }
    .subtitle { color: #6b7094; font-size: 14px; margin-bottom: 24px; }
    .verdict {
      padding: 18px 22px;
      border-radius: 14px;
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 20px;
      border-left: 4px solid;
    }
    .verdict.pass { background: #ecfdf5; color: #047857; border-color: #10b981; }
    .verdict.fail { background: #fef2f2; color: #b91c1c; border-color: #ef4444; }
    .meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .meta-item {
      background: #fff;
      border: 1px solid rgba(99, 102, 241, 0.1);
      border-radius: 12px;
      padding: 14px 16px;
    }
    .meta-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #9da3c0; font-weight: 600; }
    .meta-value { font-size: 14px; font-weight: 600; margin-top: 4px; word-break: break-word; }
    .stats {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 12px;
      margin-bottom: 28px;
    }
    .stat {
      background: #fff;
      border: 1px solid rgba(99, 102, 241, 0.1);
      border-radius: 14px;
      padding: 20px 14px;
      text-align: center;
    }
    .stat-value { font-size: 30px; font-weight: 800; line-height: 1; }
    .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #9da3c0; margin-top: 8px; font-weight: 600; }
    .green { color: #10b981; }
    .red { color: #ef4444; }
    .blue { color: #6366f1; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #fff;
      border: 1px solid rgba(99, 102, 241, 0.1);
      border-radius: 14px;
      overflow: hidden;
      font-size: 13px;
    }
    thead { background: #f5f7ff; }
    th {
      text-align: left;
      padding: 12px 16px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #9da3c0;
      font-weight: 650;
      border-bottom: 1px solid rgba(99, 102, 241, 0.08);
    }
    td { padding: 11px 16px; border-bottom: 1px solid rgba(99, 102, 241, 0.05); vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    .badge {
      display: inline-block;
      padding: 3px 9px;
      border-radius: 100px;
      font-size: 11px;
      font-weight: 700;
      text-transform: capitalize;
    }
    .badge.passed { background: #ecfdf5; color: #047857; }
    .badge.failed { background: #fef2f2; color: #b91c1c; }
    .badge.skipped { background: #fffbeb; color: #b45309; }
    .muted { color: #6b7094; font-size: 12px; }
    .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12px; color: #3b3f5c; }
    .error-cell { font-family: ui-monospace, monospace; font-size: 11px; color: #7f1d1d; white-space: pre-wrap; word-break: break-word; max-width: 320px; }
    .footer { margin-top: 28px; text-align: center; color: #9da3c0; font-size: 12px; }
    @media (max-width: 768px) {
      .stats { grid-template-columns: repeat(2, 1fr); }
      table { display: block; overflow-x: auto; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>EHQ Production Sanity Suite</h1>
    <p class="subtitle">Test results report</p>

    <div class="verdict ${verdictClass}">${htmlEscape(verdictText)}</div>

    <div class="meta">
      <div class="meta-item"><div class="meta-label">Site</div><div class="meta-value">${htmlEscape(meta?.siteUrl ?? '—')}</div></div>
      <div class="meta-item"><div class="meta-label">Suite</div><div class="meta-value">${htmlEscape(meta?.suite ?? '—')}</div></div>
      <div class="meta-item"><div class="meta-label">Started</div><div class="meta-value">${htmlEscape(meta?.startedAt ?? '—')}</div></div>
      <div class="meta-item"><div class="meta-label">Generated</div><div class="meta-value">${htmlEscape(generatedAt)}</div></div>
    </div>

    <div class="stats">
      <div class="stat"><div class="stat-value">${summary.total}</div><div class="stat-label">Total</div></div>
      <div class="stat"><div class="stat-value green">${summary.passed}</div><div class="stat-label">Passed</div></div>
      <div class="stat"><div class="stat-value red">${summary.failed}</div><div class="stat-label">Failed</div></div>
      <div class="stat"><div class="stat-value blue">${summary.passRate}%</div><div class="stat-label">Pass Rate</div></div>
      <div class="stat"><div class="stat-value">${htmlEscape(formatDurationMs(summary.totalDurationMs))}</div><div class="stat-label">Duration</div></div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Status</th>
          <th>Test</th>
          <th>Suite</th>
          <th>Duration</th>
          <th>Error</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <p class="footer">EHQ Production Sanity Suite · Playwright</p>
  </div>
</body>
</html>`;
}

function reportFilename(meta?: { startedAt?: string }): string {
  const ts = (meta?.startedAt ?? new Date().toISOString()).replace(/[:.]/g, '-');
  return `sanity-report-${ts}`;
}

function sendReportDownload(
  res: express.Response,
  filePath: string,
  format: string,
  meta?: { siteUrl?: string; suite?: string; startedAt?: string }
): void {
  const parsed = parseReportFile(filePath);
  const base = reportFilename(meta);

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.json"`);
    res.sendFile(filePath);
    return;
  }

  if (format === 'csv') {
    const csv = buildCsvReport(parsed.specs, parsed.summary, meta);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
    res.send(csv);
    return;
  }

  if (format === 'html') {
    const html = buildHtmlReport(parsed.specs, parsed.summary, meta);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.html"`);
    res.send(html);
    return;
  }

  res.status(400).json({ error: 'Invalid format. Use csv, html, or json.' });
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

app.get('/api/runs/:id/download', (req, res) => {
  const runId = req.params.id;
  const rptPath = path.join(HISTORY_DIR, runId, 'results.json');
  const metaPath = path.join(HISTORY_DIR, runId, 'meta.json');

  if (!fs.existsSync(rptPath)) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }

  const format = String(req.query.format ?? 'csv').toLowerCase();
  let meta: { siteUrl?: string; suite?: string; startedAt?: string } | undefined;
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    } catch { /* use defaults */ }
  }

  sendReportDownload(res, rptPath, format, meta);
});

app.listen(PORT, () => {
  console.log(`\n  Sanity Suite UI running at: http://localhost:${PORT}\n`);
});
