/**
 * FC26 Copilot — Bridge between background service worker and content script
 *
 * Sends messages to the content script which forwards them to the page script.
 */

import { sessionMonitor } from './session-monitor.js';
import { logger } from '../shared/logger.js';

/**
 * Call an EA API method via the content script → page script bridge
 * @param {string} method - EA API method name
 * @param {Object} params - method parameters
 * @returns {Promise<*>} result from EA API
 */
export async function callEA(method, params) {
  const tabId = sessionMonitor.webAppTabId;

  if (!tabId) {
    throw new Error('No web app tab found. Please open the EA FC web app first.');
  }

  if (!sessionMonitor.state.isAuthenticated) {
    throw new Error('Not authenticated. Please log in to the EA FC web app.');
  }

  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      action: 'callEA',
      method,
      params,
    });

    if (!response) {
      throw new Error('No response from content script. The web app tab may have been closed.');
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
  } catch (error) {
    // chrome.runtime errors when tab doesn't exist
    if (error.message?.includes('Could not establish connection')) {
      sessionMonitor.markExpired();
      throw new Error('Lost connection to web app tab. Please refresh the EA FC page.');
    }
    throw error;
  }
}
