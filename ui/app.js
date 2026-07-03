const API = '';
let pollInterval = null;
let timerInterval = null;
let runStartTime = null;
let currentView = 'summary';
let livePassCount = 0;
let liveFailCount = 0;
let liveTotalEstimate = 132;
let currentReportRunId = null;

// ── Init ────────────────────────────────────────────────────
async function init() {
  await loadSavedConfig();
  loadSiteSelector();
  await checkStatus();
}

async function loadSavedConfig() {
  try {
    const res = await fetch(`${API}/api/env`);
    const env = await res.json();
    if (env.siteUrl) document.getElementById('siteUrl').value = env.siteUrl;
    if (env.username) document.getElementById('username').value = env.username;
    if (env.projectSlug) document.getElementById('projectSlug').value = env.projectSlug;
  } catch { /* fresh start */ }
}

// ── Site Selector ────────────────────────────────────────────
const KNOWN_SITES = [
  { label: 'Preprod', url: 'https://reporting.replica.bangthetable.in', slug: 'regression-project', username: 'siteadmin123' },
  { label: 'QA Demo - Australia', url: 'https://qa_demo.engagementhq.com', slug: 'test-demo-on-au' },
  { label: 'QA Demo - Europe', url: 'https://qa_demo.eu.engagementhq.com', slug: 'test-project-eu' },
  { label: 'QA Demo - United Kingdom', url: 'https://qa_demo.uk.engagementhq.com', slug: '2026-5-production-sanity' },
  { label: 'QA Demo - Canada', url: 'https://qa_demo.ca.engagementhq.com', slug: 'test' },
  { label: 'QA Demo - United States', url: 'https://qa_demo.us.engagementhq.com', slug: '' },
];

function loadSiteSelector() {
  const select = document.getElementById('siteSelector');
  const saved = getSavedSites();
  const allSites = [...KNOWN_SITES];

  saved.forEach(s => {
    if (!allSites.find(k => k.url === s.url)) {
      allSites.push(s);
    }
  });

  select.innerHTML = '<option value="">-- Choose a saved site or enter custom --</option>' +
    allSites.map((s, i) => `<option value="${i}">${s.label || s.url}</option>`).join('');

  select._sites = allSites;
}

function onSiteSelected() {
  const select = document.getElementById('siteSelector');
  const idx = select.value;
  if (idx === '') return;

  const site = select._sites[parseInt(idx)];
  if (site) {
    document.getElementById('siteUrl').value = site.url;
    if (site.slug) document.getElementById('projectSlug').value = site.slug;
    if (site.username) document.getElementById('username').value = site.username;
  }
}

function getSavedSites() {
  try {
    return JSON.parse(localStorage.getItem('savedSites') || '[]');
  } catch { return []; }
}

function saveSiteToHistory(siteUrl, username, projectSlug) {
  const saved = getSavedSites();
  const existing = saved.findIndex(s => s.url === siteUrl);
  const entry = {
    label: new URL(siteUrl).hostname,
    url: siteUrl,
    slug: projectSlug,
    username: username,
  };
  if (existing >= 0) {
    saved[existing] = entry;
  } else {
    saved.unshift(entry);
  }
  if (saved.length > 20) saved.length = 20;
  localStorage.setItem('savedSites', JSON.stringify(saved));
  loadSiteSelector();
}

// ── Config + Run ────────────────────────────────────────────
async function handleRun() {
  const siteUrl = document.getElementById('siteUrl').value.trim();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  const projectSlug = document.getElementById('projectSlug').value.trim();
  const suiteId = document.getElementById('suiteSelect').value;
  const hint = document.getElementById('runHint');

  if (!siteUrl || !username || !password || !projectSlug) {
    hint.textContent = 'All fields are required';
    hint.className = 'form-error';
    return;
  }

  const btn = document.getElementById('runBtn');
  btn.classList.add('loading');
  btn.innerHTML = '<span>Configuring...</span>';
  hint.textContent = '';
  hint.className = 'form-hint';

  try {
    const cfgRes = await fetch(`${API}/api/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteUrl, username, password, projectSlug }),
    });
    const cfgData = await cfgRes.json();
    if (!cfgRes.ok) {
      hint.textContent = cfgData.error || 'Configuration failed';
      hint.className = 'form-error';
      resetRunBtn();
      return;
    }

    saveSiteToHistory(siteUrl, username, projectSlug);

    btn.innerHTML = '<span>Starting tests...</span>';

    const runRes = await fetch(`${API}/api/run/${suiteId}`, { method: 'POST' });
    const runData = await runRes.json();
    if (!runRes.ok) {
      hint.textContent = runData.error || 'Failed to start';
      hint.className = 'form-error';
      resetRunBtn();
      return;
    }

    showExecution(runData.suite || suiteId, siteUrl);
  } catch (e) {
    hint.textContent = 'Connection failed. Is the server running?';
    hint.className = 'form-error';
    resetRunBtn();
  }
}

function resetRunBtn() {
  const btn = document.getElementById('runBtn');
  btn.classList.remove('loading');
  btn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="5 3 19 12 5 21 5 3"></polygon>
    </svg>
    Run Sanity Suite`;
}

// ── Execution View ──────────────────────────────────────────
function showExecution(suiteName, siteUrl) {
  document.getElementById('configPanel').style.display = 'none';
  document.getElementById('reportPanel').style.display = 'none';
  document.getElementById('outputPanel').style.display = '';
  document.getElementById('terminalContent').innerHTML = '';
  document.getElementById('runSuite').textContent = suiteName;
  document.getElementById('execBarFill').style.width = '0%';
  document.getElementById('execBarFill').classList.remove('done');

  livePassCount = 0;
  liveFailCount = 0;
  updateExecCounts();

  setGlobalStatus('running', 'Running');
  runStartTime = Date.now();
  startTimer();
  startPolling();
  resetRunBtn();
}

function showConfig() {
  document.getElementById('configPanel').style.display = '';
  document.getElementById('reportPanel').style.display = 'none';
  document.getElementById('outputPanel').style.display = 'none';
  document.getElementById('historyPanel').style.display = 'none';
  setGlobalStatus('', 'Ready');
  document.getElementById('password').value = '';
}

async function stopRun() {
  try {
    await fetch(`${API}/api/stop`, { method: 'POST' });
  } catch { /* ignore */ }
}

// ── Polling ─────────────────────────────────────────────────
function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(pollStatus, 1200);
}

function stopPolling() {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!runStartTime) return;
    document.getElementById('runTimer').textContent = formatDuration(Date.now() - runStartTime);
  }, 100);
}

async function pollStatus() {
  try {
    const res = await fetch(`${API}/api/status`);
    const data = await res.json();

    updateTerminal(data.lastLines);
    parseLiveCounts(data.lastLines);
    updateExecCounts();

    if (data.status !== 'running') {
      stopPolling();
      document.getElementById('execBarFill').classList.add('done');

      if (data.status === 'completed') {
        setGlobalStatus('passed', 'Passed');
        document.getElementById('execBarFill').style.background = 'var(--green)';
        showNotification('All tests completed successfully', 'success');
      } else {
        setGlobalStatus('failed', 'Tests Done');
        document.getElementById('execBarFill').style.background = liveFailCount > 0 ? 'var(--orange)' : 'var(--red)';
        showNotification('Test run finished with failures', 'error');
      }

      setTimeout(async () => {
        await loadReport();
        document.getElementById('outputPanel').style.display = 'none';
      }, 800);
    }
  } catch { /* retry */ }
}

async function checkStatus() {
  try {
    const res = await fetch(`${API}/api/status`);
    const data = await res.json();
    if (data.status === 'running') {
      showExecution(data.suite, data.siteUrl || '');
      runStartTime = data.startedAt ? new Date(data.startedAt).getTime() : Date.now();
    }
  } catch { /* ignore */ }
}

function parseLiveCounts(lines) {
  let p = 0, f = 0;
  for (const line of lines) {
    const passMatch = line.match(/(\d+)\s+passed/);
    const failMatch = line.match(/(\d+)\s+failed/);
    if (passMatch) p = parseInt(passMatch[1]);
    if (failMatch) f = parseInt(failMatch[1]);
  }

  let runningCount = 0;
  for (const line of lines) {
    const m = line.match(/^\s*[✓✘]\s+(\d+)/);
    if (m) runningCount = Math.max(runningCount, parseInt(m[1]));
  }

  if (runningCount > 0) {
    livePassCount = runningCount - f;
    liveFailCount = f;
  }
  if (p > 0) livePassCount = p;
  if (f > 0) liveFailCount = f;

  const total = livePassCount + liveFailCount;
  const pct = liveTotalEstimate > 0 ? Math.min((total / liveTotalEstimate) * 100, 100) : 0;
  document.getElementById('execBarFill').style.width = `${pct}%`;
  document.getElementById('execBarFill').style.background = liveFailCount > 0 ? 'var(--orange)' : 'linear-gradient(90deg, #3b82f6, #60a5fa)';
}

function updateExecCounts() {
  document.getElementById('execPassed').textContent = `${livePassCount} passed`;
  document.getElementById('execFailed').textContent = `${liveFailCount} failed`;
  document.getElementById('execTotal').textContent = `of ~${liveTotalEstimate} tests`;
}

function updateTerminal(lines) {
  const container = document.getElementById('terminalContent');
  container.innerHTML = lines.map(line => {
    let cls = '';
    if (/✓|passed/.test(line)) cls = 'pass';
    else if (/✘|failed|Error/.test(line)) cls = 'fail';
    else if (/Running|tests? using/.test(line)) cls = 'info';
    return `<div class="term-line ${cls}">${escapeHtml(line)}</div>`;
  }).join('');
  const terminal = document.getElementById('terminal');
  terminal.scrollTop = terminal.scrollHeight;
}

// ── Report ──────────────────────────────────────────────────
async function loadReport() {
  try {
    const res = await fetch(`${API}/api/report`);
    if (!res.ok) return;
    const report = await res.json();
    renderReport(report);
    document.getElementById('reportPanel').style.display = '';
    document.getElementById('configPanel').style.display = 'none';
  } catch { /* no report */ }
}

function renderReport(report) {
  currentReportRunId = report.meta?.id ?? null;
  const s = report.summary;
  const siteUrl = document.getElementById('siteUrl').value || '';

  // Verdict banner
  const banner = document.getElementById('verdictBanner');
  if (s.failed === 0) {
    banner.className = 'verdict-banner pass';
    banner.innerHTML = `
      <span class="verdict-text green">All ${s.total} tests passed</span>
      <span class="verdict-site">${siteUrl}</span>`;
  } else {
    banner.className = 'verdict-banner fail';
    banner.innerHTML = `
      <span class="verdict-text red">${s.failed} of ${s.total} tests failed</span>
      <span class="verdict-site">${siteUrl}</span>`;
  }

  // Stats
  const durationStr = formatDuration(s.totalDurationMs);
  document.getElementById('statsRow').innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${s.total}</div>
      <div class="stat-label">Total Tests</div>
    </div>
    <div class="stat-card">
      <div class="stat-value green">${s.passed}</div>
      <div class="stat-label">Passed</div>
    </div>
    <div class="stat-card">
      <div class="stat-value red">${s.failed}</div>
      <div class="stat-label">Failed</div>
    </div>
    <div class="stat-card">
      <div class="stat-value blue">${s.passRate}%</div>
      <div class="stat-label">Pass Rate</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${durationStr}</div>
      <div class="stat-label">Duration</div>
    </div>`;

  // Progress bar
  const bar = document.getElementById('progressBar');
  bar.style.width = `${s.passRate}%`;
  bar.style.background = s.passRate === 100 ? 'var(--green)' : s.passRate >= 80 ? 'var(--orange)' : 'var(--red)';

  document.getElementById('passedLabel').textContent = `${s.passed} passed`;
  document.getElementById('failedLabel').textContent = `${s.failed} failed`;
  document.getElementById('skippedLabel').textContent = `${s.skipped} skipped`;

  // Suite breakdown
  const suiteMap = {};
  report.specs.forEach(spec => {
    const suite = spec.suite.split(' > ').pop();
    if (!suiteMap[suite]) suiteMap[suite] = { passed: 0, failed: 0, total: 0 };
    suiteMap[suite].total++;
    if (spec.status === 'passed') suiteMap[suite].passed++;
    if (spec.status === 'failed') suiteMap[suite].failed++;
  });

  document.getElementById('suiteBreakdown').innerHTML = Object.entries(suiteMap)
    .map(([name, data]) => {
      const dotClass = data.failed > 0 ? 'red' : 'green';
      return `<span class="suite-pill"><span class="dot ${dotClass}"></span>${name} (${data.passed}/${data.total})</span>`;
    }).join('');

  renderResultsTable(report.specs);
  renderFailures(report.specs.filter(sp => sp.status === 'failed'));
  toggleView('summary');
}

async function downloadReport(format = 'csv') {
  const url = currentReportRunId
    ? `${API}/api/runs/${currentReportRunId}/download?format=${encodeURIComponent(format)}`
    : `${API}/api/report/download?format=${encodeURIComponent(format)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showNotification(err.error || 'Download failed', 'error');
      return;
    }

    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] || `sanity-report.${format}`;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
    showNotification(`Report downloaded (${format.toUpperCase()})`, 'success');
  } catch {
    showNotification('Download failed', 'error');
  }
}

function renderResultsTable(specs) {
  document.getElementById('resultsBody').innerHTML = specs.map(spec => {
    const durClass = spec.duration > 5000 ? 'slow' : '';
    const validation = parseValidation(spec.title);
    return `<tr>
      <td><span class="status-dot ${spec.status}">${capitalize(spec.status)}</span></td>
      <td class="td-test-name">${escapeHtml(validation.name)}</td>
      <td class="td-validates">${validation.badges}</td>
      <td class="td-suite-name">${escapeHtml(spec.suite.split(' > ').pop())}</td>
      <td class="td-duration ${durClass}">${formatDuration(spec.duration)}</td>
    </tr>`;
  }).join('');
}

function parseValidation(title) {
  const validatesMatch = title.match(/→ validates: (.+)$/);
  const nameMatch = title.match(/^\[(.+?)\]/);
  const name = nameMatch ? nameMatch[1] : title.split('→')[0].trim();

  if (!validatesMatch) {
    return { name, badges: '<span class="v-badge v-status">status=200</span>' };
  }

  const parts = validatesMatch[1].split(', ');
  const badges = parts.map(part => {
    if (part.startsWith('status=')) {
      return `<span class="v-badge v-status">${escapeHtml(part)}</span>`;
    } else if (part.startsWith('perf<')) {
      return `<span class="v-badge v-perf">${escapeHtml(part)}</span>`;
    } else if (part.startsWith('body~')) {
      return `<span class="v-badge v-body">${escapeHtml(part)}</span>`;
    } else if (part.startsWith('key=')) {
      return `<span class="v-badge v-key">${escapeHtml(part)}</span>`;
    } else if (part === 'no-redirect') {
      return `<span class="v-badge v-redirect">no-redirect</span>`;
    }
    return `<span class="v-badge">${escapeHtml(part)}</span>`;
  }).join(' ');

  return { name, badges };
}

function renderFailures(failures) {
  const list = document.getElementById('failuresList');
  if (!failures.length) {
    list.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--text-tertiary)">No failures</div>`;
    return;
  }
  list.innerHTML = failures.map(f => `
    <div class="failure-card">
      <div class="failure-card-header">
        <span class="failure-card-title">${escapeHtml(f.title)}</span>
        <span class="failure-card-suite">${escapeHtml(f.suite.split(' > ').pop())}</span>
      </div>
      ${f.error ? `<div class="failure-card-error">${escapeHtml(f.error)}</div>` : ''}
    </div>`).join('');
}

// ── View Toggle ─────────────────────────────────────────────
function toggleView(view) {
  currentView = view;
  document.getElementById('resultsTableWrap').style.display = view === 'failures' ? 'none' : '';
  document.getElementById('failuresPanel').style.display = view === 'failures' ? '' : 'none';

  document.querySelectorAll('.report-actions .btn-ghost').forEach(btn => {
    btn.classList.remove('active');
    if (btn.textContent.trim().toLowerCase() === view) btn.classList.add('active');
  });
}

function toggleSuiteSelect() {
  const sel = document.getElementById('suiteSelect').closest('.form-group');
  sel.style.display = sel.style.display === 'none' ? 'flex' : 'none';
}

// ── Helpers ─────────────────────────────────────────────────
function setGlobalStatus(cls, text) {
  const badge = document.getElementById('globalStatus');
  if (!cls || !text || text === 'Ready' || text === 'History') {
    badge.style.display = 'none';
    return;
  }
  badge.style.display = '';
  badge.className = `status-badge ${cls}`;
  badge.innerHTML = `<span class="status-dot-indicator"></span>${text}`;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

let notifTimeout = null;
function showNotification(message, type) {
  let notif = document.getElementById('notification');
  if (!notif) {
    notif = document.createElement('div');
    notif.id = 'notification';
    notif.style.cssText = `
      position:fixed;bottom:24px;right:24px;padding:14px 22px;
      border-radius:14px;font-size:13px;font-weight:600;
      z-index:1000;transition:all 0.4s cubic-bezier(0.4,0,0.2,1);
      backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
      box-shadow:0 8px 30px rgba(0,0,0,0.08);
      opacity:0;transform:translateY(12px) scale(0.96);`;
    document.body.appendChild(notif);
  }
  const c = {
    success: { bg:'rgba(16,185,129,0.1)',color:'#059669',border:'rgba(16,185,129,0.2)' },
    error: { bg:'rgba(239,68,68,0.08)',color:'#dc2626',border:'rgba(239,68,68,0.2)' },
    warning: { bg:'rgba(245,158,11,0.08)',color:'#d97706',border:'rgba(245,158,11,0.2)' },
  }[type] || { bg:'rgba(16,185,129,0.1)',color:'#059669',border:'rgba(16,185,129,0.2)' };
  notif.style.background = c.bg;
  notif.style.color = c.color;
  notif.style.border = `1px solid ${c.border}`;
  notif.textContent = message;
  requestAnimationFrame(() => {
    notif.style.opacity = '1';
    notif.style.transform = 'translateY(0) scale(1)';
  });
  if (notifTimeout) clearTimeout(notifTimeout);
  notifTimeout = setTimeout(() => {
    notif.style.opacity = '0';
    notif.style.transform = 'translateY(12px) scale(0.96)';
  }, 4000);
}

// ── History ─────────────────────────────────────────────────
async function showHistory() {
  document.getElementById('configPanel').style.display = 'none';
  document.getElementById('reportPanel').style.display = 'none';
  document.getElementById('outputPanel').style.display = 'none';
  document.getElementById('historyPanel').style.display = '';
  setGlobalStatus('', '');
  await loadHistory();
}

async function loadHistory() {
  const list = document.getElementById('historyList');
  try {
    const res = await fetch(`${API}/api/runs`);
    const runs = await res.json();
    if (!runs.length) {
      list.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--text-tertiary)">No previous runs found. Run a test suite to see results here.</div>`;
      return;
    }
    list.innerHTML = `<div class="history-header">
      <span class="history-count">${runs.length} saved run${runs.length > 1 ? 's' : ''}</span>
    </div>` + runs.map(run => {
      const date = run.startedAt ? new Date(run.startedAt).toLocaleString() : 'Unknown';
      const statusCls = run.status === 'completed' ? 'passed' : 'failed';
      const summary = run.summary;
      const passRate = summary ? `${summary.passRate}%` : '-';
      const total = summary ? summary.total : '-';
      const passed = summary ? summary.passed : '-';
      const failed = summary ? summary.failed : '-';
      const duration = summary ? formatDuration(summary.totalDurationMs) : '-';
      return `
        <div class="history-card" onclick="viewHistoryRun('${run.id}')">
          <div class="history-card-left">
            <span class="status-dot ${statusCls}">${capitalize(run.status)}</span>
            <div class="history-card-info">
              <div class="history-card-title">${escapeHtml(run.suite)}</div>
              <div class="history-card-meta">${escapeHtml(run.siteUrl || '')} &middot; ${date}</div>
            </div>
          </div>
          <div class="history-card-stats">
            <span class="history-stat green">${passed} passed</span>
            <span class="history-stat red">${failed} failed</span>
            <span class="history-stat">${total} total</span>
            <span class="history-stat muted">${duration}</span>
            <span class="history-rate ${summary && summary.passRate === 100 ? 'green' : 'orange'}">${passRate}</span>
          </div>
        </div>`;
    }).join('');
  } catch {
    list.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--text-tertiary)">Failed to load history</div>`;
  }
}

async function viewHistoryRun(runId) {
  try {
    const res = await fetch(`${API}/api/runs/${runId}`);
    if (!res.ok) {
      showNotification('Failed to load run', 'error');
      return;
    }
    const report = await res.json();
    document.getElementById('historyPanel').style.display = 'none';
    document.getElementById('reportPanel').style.display = '';
    renderReport(report);
  } catch {
    showNotification('Failed to load run details', 'error');
  }
}

// ── Start ───────────────────────────────────────────────────
init();
