/**
 * Auto-discover and attach FUT web app tabs; open background tab when needed.
 */

import { sessionMonitor } from './session-monitor.js';
import { logger } from '../shared/logger.js';

export const FUT_WEB_APP_URL = 'https://www.ea.com/ea-sports-fc/ultimate-team/web-app';
export const FUT_TAB_MATCH = 'https://www.ea.com/ea-sports-fc/ultimate-team/web-app/*';

/**
 * @returns {Promise<number|null>}
 */
export async function findFutTab() {
  const tabs = await chrome.tabs.query({ url: FUT_TAB_MATCH });
  return tabs[0]?.id ?? null;
}

/**
 * Ensure a FUT tab exists for token refresh. Prefers existing tabs.
 * @param {{ openIfMissing?: boolean }} options
 * @returns {Promise<number|null>}
 */
export async function ensureFutTab(options = { openIfMissing: true }) {
  const current = sessionMonitor.webAppTabId;
  if (current) {
    try {
      await chrome.tabs.get(current);
      sessionMonitor.attachTab(current);
      return current;
    } catch {
      sessionMonitor.detachTab();
    }
  }

  const existing = await findFutTab();
  if (existing) {
    sessionMonitor.attachTab(existing);
    logger.info('Reattached to existing FUT tab', { tabId: existing });
    return existing;
  }

  if (!options.openIfMissing) return null;

  const tab = await chrome.tabs.create({ url: FUT_WEB_APP_URL, active: false });
  sessionMonitor.attachTab(tab.id);
  logger.info('Opened background FUT tab for session refresh', { tabId: tab.id });
  return tab.id;
}

/**
 * Wait for session tokens after opening a tab.
 * @param {number} timeoutMs
 */
export async function waitForSession(timeoutMs = 45000) {
  if (sessionMonitor.hasCredentials()) return true;

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (sessionMonitor.hasCredentials()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return sessionMonitor.hasCredentials();
}

/**
 * Scan for FUT tabs on startup.
 */
export async function discoverFutTabsOnStartup() {
  const tabId = await findFutTab();
  if (tabId) {
    sessionMonitor.attachTab(tabId);
    logger.info('Discovered FUT tab on startup', { tabId });
  }
}
