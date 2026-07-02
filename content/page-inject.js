/**
 * FC26 Copilot — Page-injected script
 */

import { executeEaMethod } from '../shared/ea-methods.js';
import { executeDomMethod } from './fut-navigation.js';

const MESSAGE_REQUEST = 'FC26_COPILOT_REQUEST';
const MESSAGE_RESPONSE = 'FC26_COPILOT_RESPONSE';
const SESSION_UPDATE = 'FC26_COPILOT_SESSION';
const SESSION_RESTORE = 'FC26_COPILOT_RESTORE';

// Base URL is captured dynamically from the web app's own requests
let EA_BASE_URL = null;

// Session credentials captured from intercepted requests
let capturedSession = {
  sid: null,
  phishingToken: null,
};

// ── Session + Base URL Capture ───────────────────────────────

function setBaseUrl(url) {
  if (!url || EA_BASE_URL === url) return;
  EA_BASE_URL = url;
  console.log('[FC26 Copilot] Captured API base URL:', EA_BASE_URL);
  notifySession();
}

function captureBaseUrl(url) {
  if (EA_BASE_URL) return;
  try {
    const str = typeof url === 'string' ? url : url.toString();
    const match = str.match(/(https:\/\/[^/]+\/ut\/game\/fc\d+)/);
    if (match) setBaseUrl(match[1]);
  } catch {
    // ignore
  }
}

const _originalFetch = window.fetch;
window.fetch = function (url, opts) {
  try {
    captureBaseUrl(url);

    if (opts?.headers) {
      const headers =
        opts.headers instanceof Headers
          ? Object.fromEntries(opts.headers.entries())
          : opts.headers;

      if (headers['X-UT-SID'] && headers['X-UT-SID'] !== capturedSession.sid) {
        capturedSession.sid = headers['X-UT-SID'];
        notifySession();
      }
      if (headers['X-UT-PHISHING-TOKEN'] && headers['X-UT-PHISHING-TOKEN'] !== capturedSession.phishingToken) {
        capturedSession.phishingToken = headers['X-UT-PHISHING-TOKEN'];
        notifySession();
      }
    }
  } catch (e) {
    // Never break the original fetch
  }
  return _originalFetch.apply(this, arguments);
};

const _originalXHROpen = XMLHttpRequest.prototype.open;
const _originalXHRSetHeader = XMLHttpRequest.prototype.setRequestHeader;

XMLHttpRequest.prototype.open = function (method, url) {
  try {
    captureBaseUrl(url);
  } catch (e) { /* ignore */ }
  return _originalXHROpen.apply(this, arguments);
};

XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
  try {
    if (name === 'X-UT-SID' && value !== capturedSession.sid) {
      capturedSession.sid = value;
      notifySession();
    }
    if (name === 'X-UT-PHISHING-TOKEN' && value !== capturedSession.phishingToken) {
      capturedSession.phishingToken = value;
      notifySession();
    }
  } catch (e) {
    // Never break XHR
  }
  return _originalXHRSetHeader.call(this, name, value);
};

function notifySession() {
  window.postMessage(
    {
      type: SESSION_UPDATE,
      sessionId: capturedSession.sid,
      phishingToken: capturedSession.phishingToken,
      eaBaseUrl: EA_BASE_URL,
    },
    '*'
  );
}

function restoreSession(payload) {
  if (!payload) return;
  if (payload.sessionId) capturedSession.sid = payload.sessionId;
  if (payload.phishingToken) capturedSession.phishingToken = payload.phishingToken;
  if (payload.eaBaseUrl) EA_BASE_URL = payload.eaBaseUrl;
  console.log('[FC26 Copilot] Session restored from extension storage');
  notifySession();
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.type !== SESSION_RESTORE) return;
  restoreSession(event.data);
});

// ── EA API Helpers ───────────────────────────────────────────

function getHeaders() {
  if (!capturedSession.sid) {
    throw new Error('No session captured. Please ensure the web app is loaded and logged in.');
  }
  if (!EA_BASE_URL) {
    throw new Error('API base URL not captured yet. Navigate around in the web app to trigger a request.');
  }
  return {
    'X-UT-SID': capturedSession.sid,
    'X-UT-PHISHING-TOKEN': capturedSession.phishingToken || '',
    'Content-Type': 'application/json',
  };
}

async function eaGet(path, params = {}) {
  if (!EA_BASE_URL || EA_BASE_URL === 'null') {
    throw new Error('API base URL not captured yet. Open Club or Home in the web app.');
  }
  const url = new URL(path, EA_BASE_URL.endsWith('/') ? EA_BASE_URL : EA_BASE_URL + '/');
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  }

  const response = await _originalFetch(url.toString(), {
    method: 'GET',
    headers: getHeaders(),


  });

  if (!response.ok) {
    const error = new Error(`EA API error: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function eaPost(path, body = {}) {
  if (!EA_BASE_URL || EA_BASE_URL === 'null') {
    throw new Error('API base URL not captured yet. Open Club or Home in the web app.');
  }
  const base = EA_BASE_URL.endsWith('/') ? EA_BASE_URL : EA_BASE_URL + '/';
  const response = await _originalFetch(new URL(path, base).toString(), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = new Error(`EA API error: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const text = await response.text();
  return text ? JSON.parse(text) : { success: true };
}

async function eaPut(path, body = {}) {
  if (!EA_BASE_URL || EA_BASE_URL === 'null') {
    throw new Error('API base URL not captured yet. Open Club or Home in the web app.');
  }
  const base = EA_BASE_URL.endsWith('/') ? EA_BASE_URL : EA_BASE_URL + '/';
  const response = await _originalFetch(new URL(path, base).toString(), {
    method: 'PUT',
    headers: getHeaders(),


    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = new Error(`EA API error: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const text = await response.text();
  return text ? JSON.parse(text) : { success: true };
}

async function eaDelete(path) {
  if (!EA_BASE_URL || EA_BASE_URL === 'null') {
    throw new Error('API base URL not captured yet. Open Club or Home in the web app.');
  }
  const base = EA_BASE_URL.endsWith('/') ? EA_BASE_URL : EA_BASE_URL + '/';
  const response = await _originalFetch(new URL(path, base).toString(), {
    method: 'DELETE',
    headers: getHeaders(),


  });

  if (!response.ok) {
    const error = new Error(`EA API error: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  // Some DELETE endpoints return empty body
  const text = await response.text();
  return text ? JSON.parse(text) : { success: true };
}

const pageApi = {
  get: eaGet,
  post: eaPost,
  put: eaPut,
  del: eaDelete,
};

async function executeMethod(method, params) {
  if (method.startsWith('dom.')) {
    return executeDomMethod(method.slice(4), params || {});
  }
  return executeEaMethod(pageApi, method, params);
}

// ── Message Listener ─────────────────────────────────────────

window.addEventListener('message', async (event) => {
  if (event.source !== window || event.data?.type !== MESSAGE_REQUEST) return;

  const { requestId, method, params } = event.data;

  try {
    const result = await executeMethod(method, params);
    window.postMessage(
      { type: MESSAGE_RESPONSE, requestId, result },
      '*'
    );
  } catch (error) {
    window.postMessage(
      {
        type: MESSAGE_RESPONSE,
        requestId,
        error: error.message,
        errorCode: error.status || null,
      },
      '*'
    );
  }
});

console.log('[FC26 Copilot] Page script injected and listening');
