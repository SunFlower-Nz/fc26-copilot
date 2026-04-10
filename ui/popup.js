/**
 * FC26 Copilot — Popup UI logic
 */

const RATE_LIMIT_DISPLAY = {
  market_search: 'Search',
  buy: 'Buy',
  bid: 'Bid',
  list: 'List',
  read: 'Read',
  global: 'Global',
};

let currentMode = 'assisted';

// ── Data Fetching ────────────────────────────────────────────

async function fetchStatus() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
      resolve(response || {});
    });
  });
}

async function fetchLogs() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getLogs', count: 20 }, (response) => {
      resolve(response?.logs || []);
    });
  });
}

async function fetchCoinBalance() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getCoinBalance' }, (response) => {
      resolve(response);
    });
  });
}

// ── UI Updates ───────────────────────────────────────────────

function updateConnectionStatus(status) {
  const session = status.session || {};

  // Web App
  const dotWebapp = document.getElementById('dot-webapp');
  const statusWebapp = document.getElementById('status-webapp');
  if (session.webAppTabId) {
    dotWebapp.className = 'status-dot green';
    statusWebapp.textContent = 'Connected';
  } else {
    dotWebapp.className = 'status-dot red';
    statusWebapp.textContent = 'Not found';
  }

  // Session
  const dotSession = document.getElementById('dot-session');
  const statusSession = document.getElementById('status-session');
  if (session.isAuthenticated) {
    dotSession.className = 'status-dot green';
    statusSession.textContent = 'Authenticated';
  } else {
    dotSession.className = 'status-dot red';
    statusSession.textContent = 'Not logged in';
  }

  // MCP
  const dotMcp = document.getElementById('dot-mcp');
  const statusMcp = document.getElementById('status-mcp');
  if (status.mcpConnected) {
    dotMcp.className = 'status-dot green';
    statusMcp.textContent = 'Connected';
  } else {
    dotMcp.className = 'status-dot yellow';
    statusMcp.textContent = 'Waiting';
  }
}

function updateSessionInfo(status) {
  const session = status.session || {};

  // Session age
  const ageEl = document.getElementById('session-age');
  if (session.sessionAgeMinutes > 0) {
    ageEl.textContent = `${session.sessionAgeMinutes}m`;
  } else {
    ageEl.textContent = '--';
  }

  // Last keepalive
  const keepaliveEl = document.getElementById('last-keepalive');
  if (session.lastKeepalive) {
    const ago = Math.round((Date.now() - new Date(session.lastKeepalive).getTime()) / 60000);
    keepaliveEl.textContent = `${ago}m ago`;
  } else {
    keepaliveEl.textContent = '--';
  }

  // Break warning
  const breakWarning = document.getElementById('break-warning');
  if (session.shouldBreak) {
    breakWarning.classList.remove('hidden');
  } else {
    breakWarning.classList.add('hidden');
  }
}

function updateCoinBalance(result) {
  const el = document.getElementById('coin-balance');
  if (result?.success && result.data?.credits != null) {
    el.textContent = result.data.credits.toLocaleString();
  } else if (result?.success && typeof result.data === 'number') {
    el.textContent = result.data.toLocaleString();
  } else {
    el.textContent = '--';
  }
}

function updateRateLimits(status) {
  const container = document.getElementById('rate-limits');
  const rateLimits = status.rateLimits || {};

  container.innerHTML = '';

  for (const [key, label] of Object.entries(RATE_LIMIT_DISPLAY)) {
    const data = rateLimits[key];
    if (!data) continue;

    const pct = data.hourlyLimit > 0 ? (data.hourly / data.hourlyLimit) * 100 : 0;
    let fillClass = '';
    if (pct >= 80) fillClass = 'danger';
    else if (pct >= 50) fillClass = 'warning';

    const bar = document.createElement('div');
    bar.className = 'rate-bar';
    bar.innerHTML = `
      <span class="label">${label}</span>
      <div class="bar-bg">
        <div class="bar-fill ${fillClass}" style="width: ${Math.min(pct, 100)}%"></div>
      </div>
      <span class="count">${data.hourly}/${data.hourlyLimit}</span>
    `;
    container.appendChild(bar);
  }
}

function updateActivityLog(logs) {
  const container = document.getElementById('activity-log');

  if (!logs || logs.length === 0) {
    container.innerHTML = '<div class="activity-empty">No recent activity</div>';
    return;
  }

  container.innerHTML = '';

  // Show newest first
  for (const log of logs.slice().reverse()) {
    const entry = document.createElement('div');
    entry.className = 'activity-entry';

    const time = new Date(log.timestamp);
    const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    entry.innerHTML = `
      <span class="activity-time">${timeStr}</span>
      <span class="activity-level ${log.level}">${log.level}</span>
      <span class="activity-msg">${escapeHtml(log.message)}</span>
    `;
    container.appendChild(entry);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ── Mode Selection ───────────────────────────────────────────

function initModeSelector() {
  // Load saved mode
  chrome.storage.local.get('fc26_mode', (data) => {
    if (data.fc26_mode) {
      currentMode = data.fc26_mode;
      updateModeButtons();
    }
  });

  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentMode = btn.dataset.mode;
      chrome.storage.local.set({ fc26_mode: currentMode });
      updateModeButtons();
    });
  });
}

function updateModeButtons() {
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === currentMode);
  });
}

// ── Refresh Loop ─────────────────────────────────────────────

let lastCoinFetch = 0;
const COIN_FETCH_INTERVAL = 300_000; // 5 minutes

async function refresh() {
  try {
    const [status, logs] = await Promise.all([fetchStatus(), fetchLogs()]);

    updateConnectionStatus(status);
    updateSessionInfo(status);
    updateRateLimits(status);
    updateActivityLog(logs);

    // Fetch coin balance at most once every 5 minutes to avoid burning read rate limit
    const now = Date.now();
    if (status.session?.isAuthenticated && now - lastCoinFetch >= COIN_FETCH_INTERVAL) {
      lastCoinFetch = now;
      const coinResult = await fetchCoinBalance();
      updateCoinBalance(coinResult);
    }
  } catch (err) {
    console.error('[FC26 Popup] Refresh error', err);
  }
}

// ── Init ─────────────────────────────────────────────────────

initModeSelector();
refresh();
setInterval(refresh, 3000);
