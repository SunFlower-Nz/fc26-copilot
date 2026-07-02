/**
 * FC26 Copilot — Safe EA API call wrapper
 *
 * Centralized error handling for all EA API calls.
 * Every tool file should use this instead of calling bridge.callEA directly.
 */

import { rateLimiter } from './rate-limiter.js';
import { sessionMonitor } from './session-monitor.js';
import { callEA } from './bridge.js';
import { logger } from '../shared/logger.js';
import { ERROR_CODES, BACKOFF_DURATIONS } from '../shared/constants.js';

/**
 * Call an EA API method with full error handling and status code routing.
 * @param {string} method - EA API method name
 * @param {Object} params - method parameters
 * @returns {Promise<import('../shared/types.js').ToolResult>}
 */
export async function safeEACall(method, params) {
  try {
    const result = await callEA(method, params);
    sessionMonitor.recordActivity();
    return { success: true, data: result };
  } catch (error) {
    const code = error.status || error.code;

    switch (code) {
      case ERROR_CODES.SESSION_EXPIRED:
        sessionMonitor.markExpired();
        return { success: false, error: 'Session expired. Please re-login to the web app.' };
      case ERROR_CODES.FORBIDDEN:
        rateLimiter.triggerBackoff('global', BACKOFF_DURATIONS[ERROR_CODES.FORBIDDEN]);
        return { success: false, error: 'Forbidden by EA. Pausing for 10 minutes.' };
      case ERROR_CODES.ITEM_SOLD:
        return { success: false, error: 'Item already sold or bid outbid.' };
      case ERROR_CODES.RATE_LIMITED:
        rateLimiter.triggerBackoff('global', BACKOFF_DURATIONS[ERROR_CODES.RATE_LIMITED]);
        return { success: false, error: 'Rate limited by EA. Pausing for 5 minutes.' };
      case ERROR_CODES.TRANSFER_BAN:
        rateLimiter.triggerFullStop(BACKOFF_DURATIONS[ERROR_CODES.TRANSFER_BAN]);
        return {
          success: false,
          error: 'TRANSFER MARKET BAN DETECTED. All operations stopped for 24 hours.',
        };
      case ERROR_CODES.TRANSFER_MARKET_LOCKED:
        rateLimiter.triggerBackoff('list', BACKOFF_DURATIONS[ERROR_CODES.TRANSFER_MARKET_LOCKED]);
        rateLimiter.triggerBackoff('global', 300_000);
        return {
          success: false,
          error:
            'Transfer market locked (EA 494). Listings blocked — SBC and club reads can continue.',
        };
      case ERROR_CODES.SERVER_ERROR:
        return { success: false, error: 'EA server error. Try again in 30 seconds.' };
      default:
        logger.error('EA API error', { method, code, message: error.message });
        return { success: false, error: `EA API error: ${error.message}` };
    }
  }
}
