/**
 * FC26 Copilot — Bridge between background service worker and EA API.
 *
 * Priority: direct API (persisted session) → tab bridge (token refresh fallback).
 */

import { sessionMonitor } from './session-monitor.js';
import { callEADirect, canUseDirectCall } from './ea-direct.js';
import { ensureFutTab, waitForSession } from './tab-manager.js';
import { logger } from '../shared/logger.js';

async function callEAViaTab(method, params, tabId) {
  const response = await chrome.tabs.sendMessage(tabId, {
    action: 'callEA',
    method,
    params,
  });

  if (!response) {
    throw new Error('No response from content script. The web app tab may still be loading.');
  }

  if (!response.success) {
    const error = new Error(response.error || 'Unknown error from EA API');
    if (response.errorCode) {
      error.status = response.errorCode;
      error.code = response.errorCode;
    }
    throw error;
  }

  return response.data;
}

/**
 * @param {string} method
 * @param {Object} params
 */
function isDirectCallFallbackError(error) {
  if (error.status === 401) return true;
  const msg = (error.message || '').toLowerCase();
  return msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed');
}

export async function callEA(method, params) {
  if (canUseDirectCall()) {
    try {
      const result = await callEADirect(method, params);
      sessionMonitor.recordActivity();
      return result;
    } catch (error) {
      if (error.status === 401) {
        logger.warn('Direct EA call unauthorized — attempting tab refresh', { method });
        sessionMonitor.markExpired();
      } else if (!isDirectCallFallbackError(error)) {
        throw error;
      } else {
        logger.warn('Direct EA call failed — falling back to FUT tab', {
          method,
          message: error.message,
        });
      }
    }
  }

  let tabId = sessionMonitor.webAppTabId;
  if (!tabId || !sessionMonitor.tabConnected) {
    tabId = await ensureFutTab({ openIfMissing: true });
    if (tabId && !sessionMonitor.hasCredentials()) {
      await waitForSession(30000);
    }
  }

  if (!tabId) {
    throw new Error(
      'No FUT session available. Open the EA FC Web App once to log in, then retry.'
    );
  }

  if (!sessionMonitor.hasCredentials() && !sessionMonitor.state.isAuthenticated) {
    await waitForSession(20000);
  }

  try {
    const result = await callEAViaTab(method, params, tabId);
    sessionMonitor.recordActivity();
    return result;
  } catch (error) {
    if (error.message?.includes('Could not establish connection')) {
      sessionMonitor.detachTab();
      const retryTab = await ensureFutTab({ openIfMissing: true });
      if (retryTab) {
        await waitForSession(15000);
        return callEAViaTab(method, params, retryTab);
      }
      throw new Error('Lost connection to FUT tab. A background tab is reopening — retry in 10s.');
    }
    if (error.status === 401 || error.code === 401) {
      sessionMonitor.markExpired();
    }
    throw error;
  }
}
