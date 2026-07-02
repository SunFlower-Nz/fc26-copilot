/**
 * Popup-facing SBC actions (analyze + complete).
 */

import { mcpServer } from './mcp-server.js';
import { logger } from '../shared/logger.js';
import { buildPopupItems } from '../shared/sbc-popup-model.js';
import { debugIngest } from '../shared/debug-ingest.js';
import { checkToolAccess } from './mode-guard.js';

export { buildPopupItems, canCompleteFromAnalysis } from '../shared/sbc-popup-model.js';

const ANALYSIS_STORAGE_KEY = 'fc26_sbc_analysis';
const ANALYZE_JOB_KEY = 'fc26_sbc_analyze_job';

async function runAnalyzeJob(jobId, options) {
  const tool = mcpServer.tools.get('analyze_sbcs');
  if (!tool) {
    await chrome.storage.local.set({
      [ANALYZE_JOB_KEY]: { status: 'error', jobId, error: 'analyze_sbcs não disponível' },
    });
    return;
  }

  const access = await checkToolAccess(tool, options);
  if (!access.allowed) {
    await chrome.storage.local.set({
      [ANALYZE_JOB_KEY]: { status: 'error', jobId, error: access.error },
    });
    return;
  }

  debugIngest('popup-sbc.js:runAnalyzeJob', 'analyze_start', { jobId, options }, 'H1');
  const started = Date.now();

  try {
    const result = await tool.handler({
      daily_only: options.daily_only !== false,
      try_solve: true,
      include_completed: false,
      include_all: true,
      top_n: options.top_n ?? 30,
      max_sets: options.max_sets ?? 40,
      use_cache: options.use_cache !== false,
      force_refresh: options.force_refresh === true,
    });

    if (result?.success) {
      const payload = {
        analyzedAt: Date.now(),
        dailyOnly: options.daily_only !== false,
        meta: result.meta,
        items: buildPopupItems(result),
      };
      await chrome.storage.local.set({
        [ANALYSIS_STORAGE_KEY]: payload,
        [ANALYZE_JOB_KEY]: { status: 'done', jobId, data: payload },
      });
      debugIngest('popup-sbc.js:runAnalyzeJob', 'analyze_ok', {
        jobId,
        ms: Date.now() - started,
        itemCount: payload.items.length,
        solvable: payload.items.filter((i) => i.canComplete).length,
      }, 'H1');
      return;
    }

    await chrome.storage.local.set({
      [ANALYZE_JOB_KEY]: {
        status: 'error',
        jobId,
        error: result?.error || 'Falha ao analisar DMEs',
      },
    });
    debugIngest('popup-sbc.js:runAnalyzeJob', 'analyze_fail', {
      jobId,
      ms: Date.now() - started,
      error: result?.error,
    }, 'H1');
  } catch (error) {
    await chrome.storage.local.set({
      [ANALYZE_JOB_KEY]: { status: 'error', jobId, error: error.message },
    });
    debugIngest('popup-sbc.js:runAnalyzeJob', 'analyze_exception', {
      jobId,
      error: error.message,
    }, 'H1,H5');
  }
}

/**
 * Inicia análise assíncrona (evita timeout do popup / service worker).
 * @param {Object} options
 */
export async function startAnalyzeSbcsJob(options = {}) {
  const stored = await chrome.storage.local.get(ANALYZE_JOB_KEY);
  const current = stored[ANALYZE_JOB_KEY];
  if (current?.status === 'running') {
    const age = Date.now() - (current.startedAt || 0);
    if (age < 180_000) {
      return { success: true, data: { status: 'running', jobId: current.jobId } };
    }
  }

  const jobId = crypto.randomUUID();
  await chrome.storage.local.set({
    [ANALYZE_JOB_KEY]: {
      status: 'running',
      jobId,
      startedAt: Date.now(),
    },
  });

  runAnalyzeJob(jobId, options);
  return { success: true, data: { status: 'running', jobId } };
}

export async function getAnalyzeJobStatus() {
  const stored = await chrome.storage.local.get(ANALYZE_JOB_KEY);
  return stored[ANALYZE_JOB_KEY] || { status: 'idle' };
}

/** @deprecated Use startAnalyzeSbcsJob + polling */
export async function runAnalyzeSbcsFromPopup(options = {}) {
  await startAnalyzeSbcsJob(options);
  for (let i = 0; i < 180; i += 1) {
    await new Promise((r) => setTimeout(r, 1000));
    const job = await getAnalyzeJobStatus();
    if (job.status === 'done') {
      return { success: true, data: job.data };
    }
    if (job.status === 'error') {
      return { success: false, error: job.error };
    }
  }
  return { success: false, error: 'Análise expirou após 3 minutos' };
}

export async function getStoredSbcAnalysis() {
  const stored = await chrome.storage.local.get(ANALYSIS_STORAGE_KEY);
  return stored[ANALYSIS_STORAGE_KEY] || null;
}

/**
 * @param {Object} params
 */
export async function runCompleteSbcFromPopup(params) {
  debugIngest('popup-sbc.js:runCompleteSbcFromPopup', 'complete_start', {
    challenge_id: params.challenge_id,
    set_id: params.set_id,
    challenge_name: params.challenge_name,
    refresh_pool: params.refresh_pool,
  }, 'H3');
  const started = Date.now();
  const tool = mcpServer.tools.get('complete_sbc');
  if (!tool) {
    return { success: false, error: 'complete_sbc não disponível' };
  }

  const access = await checkToolAccess(tool, {
    challenge_id: params.challenge_id,
    set_id: params.set_id,
    confirm: true,
  });
  if (!access.allowed) {
    return { success: false, error: access.error };
  }

  logger.info('Popup complete_sbc', {
    challengeId: params.challenge_id,
    setId: params.set_id,
    name: params.challenge_name,
    refreshPool: params.refresh_pool,
  });

  const result = await tool.handler({
    challenge_id: params.challenge_id,
    set_id: Number(params.set_id),
    challenge_name: params.challenge_name,
    confirm: true,
    open_ui: true,
    use_cache: params.refresh_pool !== true,
    force_refresh: params.refresh_pool === true,
    refresh_pool: params.refresh_pool === true,
  });

  debugIngest('popup-sbc.js:runCompleteSbcFromPopup', 'complete_end', {
    ms: Date.now() - started,
    success: result?.success,
    error: result?.error,
    submitted: result?.data?.submitted,
    uiNavigation: result?.data?.uiNavigation || result?.data?.applied?.uiNavigation,
  }, 'H2,H3,H4');

  return result;
}
