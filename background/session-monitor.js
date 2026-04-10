/**
 * FC26 Copilot — Session monitor
 *
 * Tracks EA web app auth state, schedules keepalives, and manages session lifecycle.
 */

import { SESSION_CONFIG } from '../shared/constants.js';
import { logger } from '../shared/logger.js';

const STORAGE_KEY = 'fc26_session';

class SessionMonitor {
  constructor() {
    /** @type {import('../shared/types.js').SessionState} */
    this.state = {
      isAuthenticated: false,
      sessionId: null,
      phishingToken: null,
      sessionStartTime: null,
      lastKeepalive: null,
      lastActivity: null,
    };

    /** @type {number|null} */
    this.keepaliveAlarm = null;
    /** @type {number|null} */
    this.webAppTabId = null;
    /** @type {Set<function>} */
    this.listeners = new Set();

    this._restore();
  }

  async _restore() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      const data = stored[STORAGE_KEY];
      if (!data) return;

      // Only restore if session is still plausibly valid (< 2 hours old)
      const maxAge = 2 * 60 * 60 * 1000;
      if (data.lastActivity && Date.now() - data.lastActivity < maxAge) {
        this.state = { ...this.state, ...data.state };
        this.webAppTabId = data.webAppTabId;

        if (this.state.isAuthenticated) {
          this._scheduleKeepalive();
          logger.info('Session state restored from storage');
        }
      }
    } catch (err) {
      logger.error('Failed to restore session state', { error: err.message });
    }
  }

  async _persist() {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEY]: {
          state: this.state,
          webAppTabId: this.webAppTabId,
          lastActivity: this.state.lastActivity,
        },
      });
    } catch (err) {
      // Non-critical
    }
  }

  /**
   * Update session credentials from the content script
   */
  updateSession(sessionId, phishingToken, tabId) {
    const wasAuthenticated = this.state.isAuthenticated;

    this.state.sessionId = sessionId;
    this.state.phishingToken = phishingToken;
    this.state.isAuthenticated = !!(sessionId && phishingToken);
    this.state.lastActivity = Date.now();
    this.webAppTabId = tabId;

    if (!wasAuthenticated && this.state.isAuthenticated) {
      this.state.sessionStartTime = Date.now();
      logger.info('Session authenticated', { tabId });
      this._scheduleKeepalive();
    }

    this._persist();
    this._notify();
  }

  /**
   * Mark session as expired (e.g. after 401 error)
   */
  markExpired() {
    this.state.isAuthenticated = false;
    this.state.sessionId = null;
    this.state.phishingToken = null;
    this.state.sessionStartTime = null;
    this._cancelKeepalive();

    logger.warn('Session expired');
    this._persist();
    this._notify();
  }

  /**
   * Record that a keepalive was sent
   */
  recordKeepalive() {
    this.state.lastKeepalive = Date.now();
    this.state.lastActivity = Date.now();
  }

  /**
   * Record any activity (EA API call)
   */
  recordActivity() {
    this.state.lastActivity = Date.now();
  }

  /**
   * Check if the session has been active too long and should take a break
   * @returns {{ shouldBreak: boolean, minutesActive: number }}
   */
  checkSessionHealth() {
    if (!this.state.sessionStartTime) {
      return { shouldBreak: false, minutesActive: 0 };
    }

    const minutesActive = (Date.now() - this.state.sessionStartTime) / 60_000;
    return {
      shouldBreak: minutesActive >= SESSION_CONFIG.MAX_SESSION_MINUTES,
      minutesActive: Math.round(minutesActive),
    };
  }

  /**
   * Check if keepalive is due
   * @returns {boolean}
   */
  isKeepaliveDue() {
    if (!this.state.isAuthenticated) return false;
    if (!this.state.lastKeepalive) return true;

    const elapsed = Date.now() - this.state.lastKeepalive;
    return elapsed >= SESSION_CONFIG.KEEPALIVE_MIN_MS;
  }

  /**
   * Get current session status for the MCP tool
   */
  getStatus() {
    const health = this.checkSessionHealth();
    return {
      isAuthenticated: this.state.isAuthenticated,
      webAppTabId: this.webAppTabId,
      sessionAgeMinutes: health.minutesActive,
      shouldBreak: health.shouldBreak,
      lastKeepalive: this.state.lastKeepalive
        ? new Date(this.state.lastKeepalive).toISOString()
        : null,
      lastActivity: this.state.lastActivity
        ? new Date(this.state.lastActivity).toISOString()
        : null,
    };
  }

  /**
   * Get session headers for EA API calls
   * @returns {{ 'X-UT-SID': string, 'X-UT-PHISHING-TOKEN': string } | null}
   */
  getHeaders() {
    if (!this.state.isAuthenticated) return null;
    return {
      'X-UT-SID': this.state.sessionId,
      'X-UT-PHISHING-TOKEN': this.state.phishingToken,
    };
  }

  /**
   * Handle the web app tab closing
   */
  onTabClosed(tabId) {
    if (tabId === this.webAppTabId) {
      logger.info('Web app tab closed', { tabId });
      this.markExpired();
      this.webAppTabId = null;
    }
  }

  /**
   * Subscribe to state changes
   */
  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  _notify() {
    for (const cb of this.listeners) {
      try { cb(this.state); } catch (e) { /* ignore */ }
    }
  }

  _scheduleKeepalive() {
    this._cancelKeepalive();

    const delay =
      SESSION_CONFIG.KEEPALIVE_MIN_MS +
      Math.random() * (SESSION_CONFIG.KEEPALIVE_MAX_MS - SESSION_CONFIG.KEEPALIVE_MIN_MS);

    // Use chrome.alarms for service worker reliability
    chrome.alarms.create('fc26_keepalive', { delayInMinutes: delay / 60_000 });
    logger.debug('Keepalive scheduled', { delayMs: Math.round(delay) });
  }

  _cancelKeepalive() {
    chrome.alarms.clear('fc26_keepalive');
  }
}

export const sessionMonitor = new SessionMonitor();
