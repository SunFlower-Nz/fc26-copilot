/**
 * FC26 Copilot — Rate limiter with per-action + global throttling
 *
 * Every EA API call MUST go through rateLimiter.throttle(actionType) before executing.
 * This is non-negotiable for account safety.
 */

import { RATE_LIMITS, BACKOFF_DURATIONS } from '../shared/constants.js';
import { logger } from '../shared/logger.js';

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const STORAGE_KEY = 'fc26_rate_limiter';

class RateLimiter {
  constructor() {
    /** @type {Map<string, number[]>} timestamps of recent actions */
    this.history = new Map();
    /** @type {Map<string, number>} last execution time per action */
    this.lastExecution = new Map();
    /** @type {Map<string, number>} backoff until timestamp per action */
    this.backoffUntil = new Map();
    /** @type {boolean} full stop flag */
    this.fullStop = false;
    /** @type {number|null} full stop until timestamp */
    this.fullStopUntil = null;
    /** @type {Map<string, Promise<void>>} pending throttle locks per action */
    this.locks = new Map();
    /** @type {boolean} */
    this._initialized = false;

    this._restore().then(() => {
      this._initialized = true;
      this._scheduleResets();
      this._schedulePersist();
    });
  }

  async _restore() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      const data = stored[STORAGE_KEY];
      if (!data) return;

      const now = Date.now();

      if (data.history) {
        const oneHourAgo = now - 3_600_000;
        for (const [key, timestamps] of data.history) {
          // Only restore timestamps still relevant (within the last hour)
          this.history.set(key, timestamps.filter((t) => t > oneHourAgo));
        }
      }
      if (data.lastExecution) {
        this.lastExecution = new Map(data.lastExecution);
      }
      if (data.backoffUntil) {
        for (const [key, until] of data.backoffUntil) {
          if (until > now) this.backoffUntil.set(key, until);
        }
      }
      if (data.fullStop && data.fullStopUntil && data.fullStopUntil > now) {
        this.fullStop = true;
        this.fullStopUntil = data.fullStopUntil;
      }

      logger.info('Rate limiter state restored from storage');
    } catch (err) {
      logger.error('Failed to restore rate limiter state', { error: err.message });
    }
  }

  async _persist() {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEY]: {
          history: Array.from(this.history.entries()),
          lastExecution: Array.from(this.lastExecution.entries()),
          backoffUntil: Array.from(this.backoffUntil.entries()),
          fullStop: this.fullStop,
          fullStopUntil: this.fullStopUntil,
        },
      });
    } catch (err) {
      // Non-critical — next persist will retry
    }
  }

  _schedulePersist() {
    // Persist every 30 seconds to survive service worker restarts
    setInterval(() => this._persist(), 30_000);
  }

  _scheduleResets() {
    // Reset hourly counters every hour
    setInterval(() => {
      const oneHourAgo = Date.now() - 3_600_000;
      for (const [key, timestamps] of this.history) {
        this.history.set(key, timestamps.filter((t) => t > oneHourAgo));
      }
    }, 60_000);
  }

  _getHourlyCount(actionType) {
    const oneHourAgo = Date.now() - 3_600_000;
    const timestamps = this.history.get(actionType) || [];
    return timestamps.filter((t) => t > oneHourAgo).length;
  }

  _getDailyCount(actionType) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const timestamps = this.history.get(actionType) || [];
    return timestamps.filter((t) => t > startOfDay.getTime()).length;
  }

  /**
   * Throttle before executing an action. Waits for rate limit delay, checks caps.
   * @param {string} actionType - key from RATE_LIMITS
   * @throws {Error} if limits exceeded or in full stop
   */
  async throttle(actionType) {
    // Check full stop
    if (this.fullStop) {
      if (this.fullStopUntil && Date.now() > this.fullStopUntil) {
        this.fullStop = false;
        this.fullStopUntil = null;
        logger.info('Full stop expired, resuming operations');
      } else {
        const remaining = this.fullStopUntil
          ? Math.ceil((this.fullStopUntil - Date.now()) / 60_000)
          : '?';
        throw new Error(
          `ALL OPERATIONS STOPPED. ${remaining} minutes remaining. Do not retry.`
        );
      }
    }

    // Check action-level backoff
    const backoff = this.backoffUntil.get(actionType);
    if (backoff && Date.now() < backoff) {
      const remaining = Math.ceil((backoff - Date.now()) / 1000);
      throw new Error(
        `Action "${actionType}" is in backoff for ${remaining}s more`
      );
    }

    // Check global backoff
    const globalBackoff = this.backoffUntil.get('global');
    if (globalBackoff && Date.now() < globalBackoff) {
      const remaining = Math.ceil((globalBackoff - Date.now()) / 1000);
      throw new Error(`Global backoff active for ${remaining}s more`);
    }

    const config = RATE_LIMITS[actionType];
    if (!config) {
      throw new Error(`Unknown action type: ${actionType}`);
    }

    const globalConfig = RATE_LIMITS.global;

    // Check hourly/daily caps for action
    const hourly = this._getHourlyCount(actionType);
    if (hourly >= config.maxPerHour) {
      logger.warn('Hourly limit reached', { actionType, count: hourly, limit: config.maxPerHour });
      throw new Error(`Hourly limit reached for ${actionType} (${hourly}/${config.maxPerHour})`);
    }

    const daily = this._getDailyCount(actionType);
    if (daily >= config.maxPerDay) {
      logger.warn('Daily limit reached', { actionType, count: daily, limit: config.maxPerDay });
      throw new Error(`Daily limit reached for ${actionType} (${daily}/${config.maxPerDay})`);
    }

    // Check global caps
    const globalHourly = this._getHourlyCount('global');
    if (globalHourly >= globalConfig.maxPerHour) {
      logger.warn('Global hourly limit reached', { count: globalHourly });
      throw new Error(`Global hourly limit reached (${globalHourly}/${globalConfig.maxPerHour})`);
    }

    const globalDaily = this._getDailyCount('global');
    if (globalDaily >= globalConfig.maxPerDay) {
      logger.warn('Global daily limit reached', { count: globalDaily });
      throw new Error(`Global daily limit reached (${globalDaily}/${globalConfig.maxPerDay})`);
    }

    // Serialize: wait for any pending throttle on this action type
    while (this.locks.has(actionType)) {
      await this.locks.get(actionType);
    }

    // Calculate delay
    const now = Date.now();
    const lastExec = this.lastExecution.get(actionType) || 0;
    const lastGlobal = this.lastExecution.get('global') || 0;

    const baseDelay = randomBetween(config.minDelay, config.maxDelay);
    // Add jitter +/- 20%
    const jitter = baseDelay * (0.8 + Math.random() * 0.4);

    const timeSinceAction = now - lastExec;
    const timeSinceGlobal = now - lastGlobal;

    const actionWait = Math.max(0, jitter - timeSinceAction);
    const globalWait = Math.max(
      0,
      randomBetween(globalConfig.minDelay, globalConfig.maxDelay) - timeSinceGlobal
    );

    const waitTime = Math.max(actionWait, globalWait);

    if (waitTime > 0) {
      const lockPromise = sleep(waitTime);
      this.locks.set(actionType, lockPromise);
      await lockPromise;
      this.locks.delete(actionType);
    }

    // Record execution
    const execTime = Date.now();
    this.lastExecution.set(actionType, execTime);
    this.lastExecution.set('global', execTime);

    if (!this.history.has(actionType)) this.history.set(actionType, []);
    this.history.get(actionType).push(execTime);

    if (!this.history.has('global')) this.history.set('global', []);
    this.history.get('global').push(execTime);

    // Warn if approaching limits
    const newHourly = this._getHourlyCount(actionType);
    if (newHourly >= config.maxPerHour * 0.8) {
      logger.warn('Rate limit approaching', {
        actionType,
        hourlyCount: newHourly,
        hourlyLimit: config.maxPerHour,
      });
    }
  }

  /**
   * Trigger a backoff for a specific action type
   * @param {string} actionType
   * @param {number} durationMs
   */
  triggerBackoff(actionType, durationMs) {
    this.backoffUntil.set(actionType, Date.now() + durationMs);
    logger.warn('Backoff triggered', { actionType, durationMs });
    this._persist();
  }

  /**
   * Trigger a full stop of all operations
   * @param {number} durationMs
   */
  triggerFullStop(durationMs) {
    this.fullStop = true;
    this.fullStopUntil = Date.now() + durationMs;
    logger.error('FULL STOP triggered', {
      durationMs,
      resumeAt: new Date(this.fullStopUntil).toISOString(),
    });
    this._persist();
  }

  /**
   * Get current usage stats for all action types
   */
  getStats() {
    const stats = {};
    for (const actionType of Object.keys(RATE_LIMITS)) {
      const config = RATE_LIMITS[actionType];
      stats[actionType] = {
        hourly: this._getHourlyCount(actionType),
        hourlyLimit: config.maxPerHour,
        daily: this._getDailyCount(actionType),
        dailyLimit: config.maxPerDay,
        inBackoff: (this.backoffUntil.get(actionType) || 0) > Date.now(),
      };
    }
    stats._fullStop = this.fullStop;
    stats._fullStopUntil = this.fullStopUntil;
    return stats;
  }
}

export const rateLimiter = new RateLimiter();
