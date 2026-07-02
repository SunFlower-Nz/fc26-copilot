/**
 * FUT Pilot — DOM bridge (background → content script → page context)
 */

import { sessionMonitor } from './session-monitor.js';
import { ensureFutTab, waitForSession } from './tab-manager.js';
import { logger } from '../shared/logger.js';
import { debugIngest } from '../shared/debug-ingest.js';

async function callDOMViaTab(method, params, tabId) {
  const response = await chrome.tabs.sendMessage(tabId, {
    action: 'callDOM',
    method,
    params,
  });

  if (!response) {
    throw new Error('No response from content script. The Web App tab may still be loading.');
  }

  if (!response.success) {
    const error = new Error(response.error || 'Unknown DOM navigation error');
    if (response.data) error.data = response.data;
    throw error;
  }

  return response.data;
}

async function resolveFutTab() {
  let tabId = sessionMonitor.webAppTabId;
  if (!tabId || !sessionMonitor.tabConnected) {
    tabId = await ensureFutTab({ openIfMissing: true });
    if (tabId && !sessionMonitor.hasCredentials()) {
      await waitForSession(30_000);
    }
  }

  if (!tabId) {
    throw new Error('No FUT tab available. Open the EA FC Web App and log in.');
  }

  if (!sessionMonitor.hasCredentials() && !sessionMonitor.state.isAuthenticated) {
    await waitForSession(20_000);
  }

  return tabId;
}

/**
 * @param {string} method
 * @param {Object} [params]
 */
export async function callDOM(method, params = {}) {
  const tabId = await resolveFutTab();

  try {
    return await callDOMViaTab(method, params, tabId);
  } catch (error) {
    if (error.message?.includes('Could not establish connection')) {
      sessionMonitor.detachTab();
      const retryTab = await ensureFutTab({ openIfMissing: true });
      if (retryTab) {
        await waitForSession(15_000);
        return callDOMViaTab(method, params, retryTab);
      }
      throw new Error('Lost connection to FUT tab. Reload the Web App and extension, then retry.');
    }
    throw error;
  }
}

/**
 * Ensure the Web App has the challenge squad screen open (fixes squad API 404).
 * @param {Object} options
 * @param {number|string} options.setId
 * @param {number|string} options.challengeId
 * @param {string} [options.setName]
 * @param {string} [options.challengeName]
 */
export async function ensureSbcChallengeOpen(options) {
  const { setId, challengeId, setName, challengeName } = options;
  if (!setId || !challengeId) {
    return { success: false, error: 'setId and challengeId are required for UI navigation' };
  }

  try {
    const result = await callDOM('openSbcChallenge', {
      setId,
      challengeId,
      setName,
      challengeName,
    });
    debugIngest('dom-bridge.js:ensureSbcChallengeOpen', 'ui_open_ok', {
      setId,
      challengeId,
      method: result?.method,
      controller: result?.controller,
    }, 'H2');
    logger.info('SBC challenge opened in Web App UI', {
      setId,
      challengeId,
      method: result?.method,
      controller: result?.controller,
    });
    return { success: true, data: result };
  } catch (error) {
    debugIngest('dom-bridge.js:ensureSbcChallengeOpen', 'ui_open_fail', {
      setId,
      challengeId,
      error: error.message,
    }, 'H2');
    logger.warn('Failed to open SBC challenge in Web App UI', {
      setId,
      challengeId,
      error: error.message,
    });
    return { success: false, error: error.message, data: error.data || null };
  }
}

export async function getFutNavigationState() {
  try {
    const data = await callDOM('getNavigationState', {});
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
