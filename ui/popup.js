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

let currentMode = 'semi_auto';

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
  chrome.storage.local.get('fc26_mode', (data) => {
    if (data.fc26_mode) {
      currentMode = data.fc26_mode;
    } else {
      currentMode = 'semi_auto';
      chrome.storage.local.set({ fc26_mode: 'semi_auto' });
    }
    updateModeButtons();
  });

  document.querySelectorAll('.mode-btn[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentMode = btn.dataset.mode;
      chrome.storage.local.set({ fc26_mode: currentMode });
      updateModeButtons();
    });
  });
}

function updateModeButtons() {
  document.querySelectorAll('.mode-btn[data-mode]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === currentMode);
  });
}

// ── SBC Protection ─────────────────────────────────────────

const DEFAULT_PROTECTED_NAMES =
  'Alisson, Dest, Militão, Bisseck, Ona Batlle, Fabinho, Bruno, Pelé, Ronaldinho, Nuamah, Evanilson';

function initProtectionSettings() {
  const ratingInput = document.getElementById('protect-min-rating');
  const namesInput = document.getElementById('protect-names');
  const saveBtn = document.getElementById('save-protection');
  const status = document.getElementById('protection-status');

  chrome.storage.local.get('fc26_protected_players', (data) => {
    const cfg = data.fc26_protected_players || {};
    ratingInput.value = cfg.minRating ?? 87;
    namesInput.value = (cfg.names || []).join(', ') || DEFAULT_PROTECTED_NAMES;
  });

  saveBtn.addEventListener('click', () => {
    const minRating = parseInt(ratingInput.value, 10) || 87;
    const names = namesInput.value
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);

    chrome.storage.local.set(
      {
        fc26_protected_players: {
          minRating,
          names,
          assetIds: [],
        },
      },
      () => {
        status.textContent = `Saved: block rating ${minRating}+ and ${names.length} names`;
      }
    );
  });
}

function initAnalytics() {
  const openBtn = document.getElementById('open-analytics');
  openBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('ui/analytics.html') });
  });

  chrome.runtime.sendMessage({ action: 'getClubAnalytics', use_futbin: true }, (result) => {
    const el = document.getElementById('analytics-mini');
    if (!result?.success) {
      el.textContent = 'Abra o Web App e atualize o cache.';
      return;
    }
    const s = result.data.summary;
    el.innerHTML = `
      <div class="mini-card"><div class="mini-label">Portfolio</div><div class="mini-value">${s.portfolio.toLocaleString()}</div></div>
      <div class="mini-card"><div class="mini-label">P/L</div><div class="mini-value">${s.unrealizedProfitLoss >= 0 ? '+' : ''}${Math.round(s.unrealizedProfitLoss).toLocaleString()}</div></div>
      <div class="mini-card"><div class="mini-label">Fodder</div><div class="mini-value">${s.fodder.toLocaleString()}</div></div>
      <div class="mini-card"><div class="mini-label">Jogadores</div><div class="mini-value">${s.playerCount}</div></div>
    `;
  });
}

// ── DME / SBC ────────────────────────────────────────────────

import { debugIngest } from '../shared/debug-ingest.js';
import { shouldStopBatchOnError } from '../shared/sbc-popup-model.js';

const DME_STORAGE_KEY = 'fc26_dme_prefs';
let dmeItems = [];
let dmeBusy = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollAnalyzeJob(maxMs = 180_000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const job = await sendMessageAsync('getAnalyzeJobStatus');
    const status = job?.data?.status;
    if (status === 'done') {
      return { success: true, data: job.data.data };
    }
    if (status === 'error') {
      return { success: false, error: job.data.error || 'Falha ao analisar DMEs' };
    }
    await sleep(1000);
  }
  return { success: false, error: 'Análise expirou. Mantenha o Web App aberto e tente de novo.' };
}

function sendMessageAsync(action, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action, ...payload }, (response) => {
      const err = chrome.runtime.lastError?.message;
      debugIngest('popup.js:sendMessageAsync', 'message_response', {
        action,
        hasResponse: Boolean(response),
        success: response?.success,
        error: response?.error || err || null,
      }, 'H1,H5');
      resolve(response || { success: false, error: err || 'Sem resposta' });
    });
  });
}

function recommendationLabel(rec) {
  const map = {
    excelente: 'Excelente',
    recomendado: 'Recomendado',
    viavel: 'Viável',
    dificil: 'Difícil',
    já_completo: 'Completo',
  };
  return map[rec] || rec || '—';
}

function formatAnalyzedAt(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function setDmeStatus(text, isError = false) {
  const el = document.getElementById('dme-status');
  el.textContent = text;
  el.style.color = isError ? '#f87171' : '#71717a';
}

function updateCompleteAllButton() {
  const btn = document.getElementById('complete-all-dmes');
  const actionable = dmeItems.filter((item) => item.canComplete);
  btn.classList.toggle('hidden', actionable.length < 2);
  btn.disabled = dmeBusy || actionable.length < 2;
  btn.textContent = actionable.length >= 2 ? `Completar todos (${actionable.length})` : 'Completar todos';
}

function renderDmeList() {
  const container = document.getElementById('dme-list');
  container.innerHTML = '';

  if (!dmeItems.length) {
    container.innerHTML = '<div class="dme-empty">Nenhum DME encontrado nesta análise.</div>';
    updateCompleteAllButton();
    return;
  }

  for (const item of dmeItems) {
    const card = document.createElement('div');
    card.className = 'dme-card';

    const badgeClass = item.completed ? 'completo' : (item.recommendation || 'dificil');
    const reqText = item.requirementsSummary || 'Requisitos não carregados';
    const costText =
      item.estimatedCost != null ? ` · ~${Math.round(item.estimatedCost).toLocaleString()} coins` : '';

    card.innerHTML = `
      <div class="dme-card-header">
        <div class="dme-card-title">${escapeHtml(item.name || item.setName || 'DME')}</div>
        <span class="dme-badge ${badgeClass}">${escapeHtml(recommendationLabel(item.recommendation))}</span>
      </div>
      <div class="dme-card-meta">${escapeHtml(reqText)}${escapeHtml(costText)}</div>
      <div class="dme-card-actions"></div>
    `;

    const actions = card.querySelector('.dme-card-actions');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dme-action-btn primary';
    btn.dataset.challengeId = item.challengeId;
    btn.dataset.setId = String(item.setId);
    btn.dataset.challengeName = item.name || item.setName || '';

    if (item.completed) {
      btn.textContent = 'Já completo';
      btn.disabled = true;
    } else if (item.canComplete) {
      btn.textContent = 'Fazer DME';
      btn.addEventListener('click', () => completeDme(item, btn));
    } else if (item.solutionFound === false && item.recommendation && item.recommendation !== 'difícil') {
      btn.textContent = 'Sem solução';
      btn.disabled = true;
      btn.title = (item.issues || []).join(' · ') || 'Solver não encontrou elenco válido';
    } else {
      btn.textContent = 'Indisponível';
      btn.disabled = true;
      btn.title = (item.issues || []).join(' · ') || 'Solver não encontrou solução';
    }

    actions.appendChild(btn);
    container.appendChild(card);
  }

  updateCompleteAllButton();
}

async function loadStoredDmeAnalysis() {
  const prefs = await chrome.storage.local.get(DME_STORAGE_KEY);
  const dailyOnly = prefs[DME_STORAGE_KEY]?.dailyOnly !== false;
  document.getElementById('dme-daily-only').checked = dailyOnly;

  const result = await sendMessageAsync('getSbcAnalysis');
  if (!result?.success || !result.data?.items?.length) return;

  dmeItems = result.data.items;
  setDmeStatus(
    `${dmeItems.length} DME(s) · ${formatAnalyzedAt(result.data.analyzedAt)} · ${result.data.dailyOnly ? 'diários' : 'todos'}`
  );
  renderDmeList();
}

async function analyzeDmes(forceRefresh = false) {
  if (dmeBusy) return;

  const dailyOnly = document.getElementById('dme-daily-only').checked;
  const analyzeBtn = document.getElementById('analyze-dmes');

  dmeBusy = true;
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = 'Analisando…';
  setDmeStatus('Lendo DMEs e testando soluções…');
  debugIngest('popup.js:analyzeDmes', 'popup_analyze_start', { dailyOnly }, 'H1');

  try {
    await chrome.storage.local.set({ [DME_STORAGE_KEY]: { dailyOnly } });

    const start = await sendMessageAsync('analyzeSbcs', {
      daily_only: dailyOnly,
      force_refresh: forceRefresh,
    });

    if (!start?.success) {
      setDmeStatus(start?.error || 'Falha ao iniciar análise', true);
      return;
    }

    const result = await pollAnalyzeJob();

    if (!result?.success) {
      setDmeStatus(result?.error || 'Falha ao analisar DMEs', true);
      return;
    }

    dmeItems = result.data?.items || [];
    const meta = result.data?.meta;
    const solvable = dmeItems.filter((i) => i.canComplete).length;
    setDmeStatus(
      `${dmeItems.length} DME(s) · ${solvable} prontos · ${formatAnalyzedAt(result.data.analyzedAt)}` +
        (meta?.poolStats ? ` · clube: ${meta.poolStats.total} cartas` : '')
    );
    renderDmeList();
  } catch (err) {
    debugIngest('popup.js:analyzeDmes', 'popup_analyze_exception', { error: err.message }, 'H5');
    setDmeStatus(err.message || 'Erro inesperado na análise', true);
  } finally {
    dmeBusy = false;
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = 'Analisar DMEs';
  }
}

async function completeDme(item, buttonEl) {
  if (dmeBusy) return;

  const name = item.name || item.setName || 'DME';
  const ok = confirm(
    `Completar "${name}"?\n\nAs cartas usadas serão consumidas permanentemente. O plugin abrirá o DME no Web App automaticamente.`
  );
  if (!ok) return;

  dmeBusy = true;
  buttonEl.disabled = true;
  buttonEl.textContent = 'Executando…';
  setDmeStatus(`Completando ${name}…`);

  try {
    const result = await sendMessageAsync('completeSbc', {
      challenge_id: item.challengeId,
      set_id: item.setId,
      challenge_name: item.name || item.setName,
    });

    if (result?.success) {
      item.completed = true;
      item.canComplete = false;
      item.recommendation = 'já_completo';
      buttonEl.textContent = 'Concluído';
      setDmeStatus(`DME "${name}" completado com sucesso.`);
      renderDmeList();
      refresh();
      return;
    }

    buttonEl.disabled = false;
    buttonEl.textContent = 'Fazer DME';
    setDmeStatus(result?.error || `Falha ao completar ${name}`, true);
  } finally {
    dmeBusy = false;
  }
}

async function completeAllDmes() {
  const actionable = dmeItems.filter((item) => item.canComplete);
  if (!actionable.length || dmeBusy) return;

  const names = actionable.map((i) => i.name || i.setName).join('\n· ');
  const ok = confirm(
    `Completar ${actionable.length} DME(s)?\n\n· ${names}\n\nCartas serão consumidas. Continuar?`
  );
  if (!ok) return;

  dmeBusy = true;
  document.getElementById('complete-all-dmes').disabled = true;
  setDmeStatus(`Completando ${actionable.length} DME(s)…`);

  let done = 0;
  let failed = 0;
  let stoppedEarly = false;

  try {
    for (const item of actionable) {
      setDmeStatus(`Completando (${done + failed + 1}/${actionable.length}): ${item.name || item.setName}…`);
      debugIngest('popup.js:completeAllDmes', 'batch_item_start', {
        index: done + failed + 1,
        total: actionable.length,
        challengeId: item.challengeId,
        setId: item.setId,
        refreshPool: done > 0,
      }, 'H4');
      const result = await sendMessageAsync('completeSbc', {
        challenge_id: item.challengeId,
        set_id: item.setId,
        challenge_name: item.name || item.setName,
        refresh_pool: done > 0,
      });

      if (result?.success) {
        done += 1;
        item.completed = true;
        item.canComplete = false;
        item.recommendation = 'já_completo';
      } else {
        failed += 1;
        if (shouldStopBatchOnError(result?.error)) {
          stoppedEarly = true;
          setDmeStatus(result?.error || 'Batch interrompido', true);
          break;
        }
      }
    }
  } finally {
    dmeBusy = false;
  }

  renderDmeList();
  if (!stoppedEarly) {
    setDmeStatus(
      failed
        ? `Concluídos: ${done} · Falhas: ${failed}. Veja o log de atividade.`
        : `${done} DME(s) completados com sucesso.`,
      failed > 0
    );
  }
  refresh();
}

function initDmeSection() {
  document.getElementById('analyze-dmes').addEventListener('click', () => analyzeDmes(false));
  document.getElementById('complete-all-dmes').addEventListener('click', completeAllDmes);
  document.getElementById('dme-daily-only').addEventListener('change', (e) => {
    chrome.storage.local.set({ [DME_STORAGE_KEY]: { dailyOnly: e.target.checked } });
  });

  const manifest = chrome.runtime.getManifest();
  const versionEl = document.getElementById('version');
  if (versionEl && manifest?.version) {
    versionEl.textContent = `v${manifest.version}`;
  }

  loadStoredDmeAnalysis();
}


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
initProtectionSettings();
initAnalytics();
initDmeSection();
refresh();
setInterval(refresh, 3000);
