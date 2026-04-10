/**
 * FC26 Copilot — Structured logger with chrome.storage rotation
 */

import { LOG_CONFIG } from './constants.js';

const LEVELS = { debug: 0, info: 1, trade: 2, warn: 3, error: 4 };

class Logger {
  constructor() {
    this.minLevel = LEVELS.info;
    this.buffer = [];
    this.flushTimer = null;
  }

  setLevel(level) {
    this.minLevel = LEVELS[level] ?? LEVELS.info;
  }

  _log(level, message, data = {}) {
    if (LEVELS[level] < this.minLevel) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data,
    };

    this.buffer.push(entry);
    console.log(`[FC26][${level.toUpperCase()}] ${message}`, data);

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this._flush(), 2000);
    }
  }

  async _flush() {
    this.flushTimer = null;
    if (this.buffer.length === 0) return;

    const toWrite = this.buffer.splice(0);

    try {
      const stored = await chrome.storage.local.get(LOG_CONFIG.STORAGE_KEY);
      let logs = stored[LOG_CONFIG.STORAGE_KEY] || [];
      logs.push(...toWrite);

      // Rotate: keep last MAX_ENTRIES
      if (logs.length > LOG_CONFIG.MAX_ENTRIES) {
        logs = logs.slice(-LOG_CONFIG.MAX_ENTRIES);
      }

      await chrome.storage.local.set({ [LOG_CONFIG.STORAGE_KEY]: logs });
    } catch (err) {
      console.error('[FC26] Failed to flush logs', err);
    }
  }

  debug(message, data) { this._log('debug', message, data); }
  info(message, data)  { this._log('info', message, data); }
  trade(message, data) { this._log('trade', message, data); }
  warn(message, data)  { this._log('warn', message, data); }
  error(message, data) { this._log('error', message, data); }

  async getLogs(count = 50) {
    const stored = await chrome.storage.local.get(LOG_CONFIG.STORAGE_KEY);
    const logs = stored[LOG_CONFIG.STORAGE_KEY] || [];
    return logs.slice(-count);
  }

  async clearLogs() {
    await chrome.storage.local.set({ [LOG_CONFIG.STORAGE_KEY]: [] });
    this.buffer = [];
  }
}

export const logger = new Logger();
