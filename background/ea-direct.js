/**
 * Direct EA API calls from the service worker using persisted session tokens.
 * Avoids requiring an active FUT tab for every MCP operation.
 */

import { sessionMonitor } from './session-monitor.js';
import { executeEaMethod } from '../shared/ea-methods.js';
import { logger } from '../shared/logger.js';

const DEFAULT_EA_BASE = 'https://utas.mob.aem.ea.com/ut/game/fc26';

function normalizeEaBaseUrl(url) {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (parsed.port === '443' || parsed.port === '80') {
      parsed.port = '';
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url.replace(':443', '');
  }
}

function getBaseUrl() {
  return normalizeEaBaseUrl(sessionMonitor.getEaBaseUrl()) || DEFAULT_EA_BASE;
}

function getHeaders() {
  const headers = sessionMonitor.getHeaders();
  if (!headers) {
    throw new Error('Not authenticated. Open the FUT Web App once to capture session tokens.');
  }
  return {
    ...headers,
    'Content-Type': 'application/json',
  };
}

async function eaRequest(method, path, { params, body } = {}) {
  let url = getBaseUrl() + path;

  if (params && method === 'GET') {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) search.set(key, value);
    }
    const qs = search.toString();
    if (qs) url += `?${qs}`;
  }

  const response = await fetch(url, {
    method,
    headers: getHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = new Error(`EA API error: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  if (method === 'DELETE') {
    const text = await response.text();
    return text ? JSON.parse(text) : { success: true };
  }

  const text = await response.text();
  return text ? JSON.parse(text) : { success: true };
}

const api = {
  get: (path, params) => eaRequest('GET', path, { params }),
  post: (path, body) => eaRequest('POST', path, { body }),
  put: (path, body) => eaRequest('PUT', path, { body }),
  del: (path) => eaRequest('DELETE', path),
};

/**
 * @param {string} method
 * @param {Object} params
 */
export async function callEADirect(method, params) {
  if (!sessionMonitor.hasCredentials()) {
    const error = new Error('No stored session credentials');
    error.status = 401;
    throw error;
  }

  logger.debug('EA direct call', { method });
  return executeEaMethod(api, method, params);
}

export function canUseDirectCall() {
  return sessionMonitor.hasCredentials();
}
