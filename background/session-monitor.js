/**
 * FC26 Copilot — Session monitor
 *
 * Persists EA credentials and base URL so MCP can call the API directly
 * from the service worker without requiring the FUT tab to stay open.
 */

import { SESSION_CONFIG } from '../shared/constants.js';
import { logger } from '../shared/logger.js';

function normalizeEaBaseUrl(url) {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (parsed.port === '443' || parsed.port === '80') parsed.port = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url.replace(':443', '');
  }
}

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

    this.eaBaseUrl = null;
    this.webAppTabId = null;
    this.tabConnected = false;
    this.listeners = new Set();

    this._restore();
  }

  async _restore() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      const data = stored[STORAGE_KEY];
      if (!data) return;

      const maxAge = SESSION_CONFIG.RESTORE_MAX_AGE_MS;
      if (data.lastActivity && Date.now() - data.lastActivity < maxAge) {
        this.state = { ...this.state, ...data.state };
        this.eaBaseUrl = normalizeEaBaseUrl(data.eaBaseUrl) || null;
        this.webAppTabId = data.webAppTabId || null;
        this.tabConnected = false;

        if (this.state.sessionId && this.state.phishingToken) {
          this.state.isAuthenticated = true;
          this._scheduleKeepalive();
          logger.info('Session restored from storage', {
            hasBaseUrl: Boolean(this.eaBaseUrl),
          });
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
          eaBaseUrl: this.eaBaseUrl,
          webAppTabId: this.webAppTabId,
          tabConnected: this.tabConnected,
          lastActivity: this.state.lastActivity,
        },
      });
    } catch {
      // Non-critical
    }
  }

  hasCredentials() {
    return Boolean(this.state.sessionId && this.state.phishingToken);
  }

  getEaBaseUrl() {
    return this.eaBaseUrl;
  }

  setEaBaseUrl(url) {
    const normalized = normalizeEaBaseUrl(url);
    if (!normalized || normalized === this.eaBaseUrl) return;
    this.eaBaseUrl = normalized;
    this._persist();
  }

  getRestorePayload() {
    if (!this.hasCredentials()) return null;
    return {
      sessionId: this.state.sessionId,
      phishingToken: this.state.phishingToken,
      eaBaseUrl: this.eaBaseUrl,
    };
  }

  attachTab(tabId) {
    if (!tabId) return;
    this.webAppTabId = tabId;
    this.tabConnected = true;
    this._persist();
  }

  detachTab() {
    this.webAppTabId = null;
    this.tabConnected = false;
    this._persist();
  }

  updateSession(sessionId, phishingToken, tabId, eaBaseUrl) {
    const wasAuthenticated = this.state.isAuthenticated;

    if (sessionId) this.state.sessionId = sessionId;
    if (phishingToken) this.state.phishingToken = phishingToken;
    this.state.isAuthenticated = this.hasCredentials();
    this.state.lastActivity = Date.now();

    if (tabId) {
      this.webAppTabId = tabId;
      this.tabConnected = true;
    }
    if (eaBaseUrl) {
      this.eaBaseUrl = normalizeEaBaseUrl(eaBaseUrl);
    }

    if (!wasAuthenticated && this.state.isAuthenticated) {
      this.state.sessionStartTime = Date.now();
      logger.info('Session authenticated', { tabId: this.webAppTabId });
      this._scheduleKeepalive();
    }

    this._persist();
    this._notify();
  }

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

  recordKeepalive() {
    this.state.lastKeepalive = Date.now();
    this.state.lastActivity = Date.now();
    this._persist();
  }

  recordActivity() {
    this.state.lastActivity = Date.now();
    this._persist();
  }

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

  isKeepaliveDue() {
    if (!this.state.isAuthenticated) return false;
    if (!this.state.lastKeepalive) return true;
    return Date.now() - this.state.lastKeepalive >= SESSION_CONFIG.KEEPALIVE_MIN_MS;
  }

  getStatus() {
    const health = this.checkSessionHealth();
    return {
      isAuthenticated: this.state.isAuthenticated,
      hasStoredCredentials: this.hasCredentials(),
      tabConnected: this.tabConnected,
      webAppTabId: this.webAppTabId,
      eaBaseUrl: this.eaBaseUrl,
      directApiReady: this.hasCredentials(),
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

  getHeaders() {
    if (!this.hasCredentials()) return null;
    return {
      'X-UT-SID': this.state.sessionId,
      'X-UT-PHISHING-TOKEN': this.state.phishingToken,
    };
  }

  onTabClosed(tabId) {
    if (tabId !== this.webAppTabId) return;
    logger.info('FUT tab closed — keeping stored credentials for direct API', { tabId });
    this.detachTab();
  }

  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  _notify() {
    for (const cb of this.listeners) {
      try {
        cb(this.state);
      } catch {
        // ignore
      }
    }
  }

  _scheduleKeepalive() {
    this._cancelKeepalive();
    const delay =
      SESSION_CONFIG.KEEPALIVE_MIN_MS +
      Math.random() * (SESSION_CONFIG.KEEPALIVE_MAX_MS - SESSION_CONFIG.KEEPALIVE_MIN_MS);
    chrome.alarms.create('fc26_keepalive', { delayInMinutes: delay / 60_000 });
  }

  _cancelKeepalive() {
    chrome.alarms.clear('fc26_keepalive');
  }
}

export const sessionMonitor = new SessionMonitor();
