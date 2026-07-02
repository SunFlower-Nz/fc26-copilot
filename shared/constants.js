/**
 * FC26 Copilot — Constants and configuration
 */

// EA_BASE_URL is captured dynamically by page-inject.js from the web app's own requests.
// No hardcoded URL needed — this avoids breaking when EA changes domains.

export const RATE_LIMITS = {
  market_search: { minDelay: 7000, maxDelay: 15000, maxPerHour: 200, maxPerDay: 2500 },
  buy:           { minDelay: 1000, maxDelay: 3000,  maxPerHour: 50,  maxPerDay: 400 },
  bid:           { minDelay: 1000, maxDelay: 3000,  maxPerHour: 50,  maxPerDay: 400 },
  list:          { minDelay: 2000, maxDelay: 5000,  maxPerHour: 40,  maxPerDay: 300 },
  relist:        { minDelay: 30000, maxDelay: 60000, maxPerHour: 4,  maxPerDay: 20 },
  read:          { minDelay: 3000, maxDelay: 8000,  maxPerHour: 80,  maxPerDay: 800 },
  sbc_read:      { minDelay: 3000, maxDelay: 6000,  maxPerHour: 40,  maxPerDay: 400 },
  sbc_write:     { minDelay: 5000, maxDelay: 10000, maxPerHour: 20,  maxPerDay: 100 },
  keepalive:     { minDelay: 300000, maxDelay: 480000, maxPerHour: 12, maxPerDay: 144 },
  global:        { minDelay: 2000, maxDelay: 4000,  maxPerHour: 300, maxPerDay: 3000 },
};

export const ERROR_CODES = {
  SESSION_EXPIRED: 401,
  FORBIDDEN: 403,
  ITEM_SOLD: 409,
  RATE_LIMITED: 429,
  TRANSFER_BAN: 461,
  TRANSFER_MARKET_LOCKED: 494,
  SERVER_ERROR: 521,
};

export const BACKOFF_DURATIONS = {
  [ERROR_CODES.FORBIDDEN]: 600_000,      // 10 minutes
  [ERROR_CODES.RATE_LIMITED]: 300_000,    // 5 minutes
  [ERROR_CODES.TRANSFER_BAN]: 86_400_000, // 24 hours
  [ERROR_CODES.TRANSFER_MARKET_LOCKED]: 86_400_000,
  [ERROR_CODES.SERVER_ERROR]: 30_000,     // 30 seconds
};

export const OPERATION_MODES = {
  MONITOR: 'monitor',
  ASSISTED: 'assisted',
  SEMI_AUTO: 'semi_auto',
  AUTO: 'auto',
};

export const SESSION_CONFIG = {
  MAX_SESSION_MINUTES: 60,
  MIN_BREAK_MINUTES: 5,
  MAX_BREAK_MINUTES: 15,
  KEEPALIVE_MIN_MS: 300_000,
  KEEPALIVE_MAX_MS: 480_000,
  RESTORE_MAX_AGE_MS: 24 * 60 * 60 * 1000,
};

export const FUT_WEB_APP_URL =
  'https://www.ea.com/ea-sports-fc/ultimate-team/web-app';

export const LOG_CONFIG = {
  MAX_ENTRIES: 1000,
  STORAGE_KEY: 'fc26_logs',
};

export const MESSAGE_TYPES = {
  REQUEST: 'FC26_COPILOT_REQUEST',
  RESPONSE: 'FC26_COPILOT_RESPONSE',
  SESSION_UPDATE: 'FC26_COPILOT_SESSION',
};

export const EA_TAX_RATE = 0.05;

export function calculateProfit(purchasePrice, sellPrice) {
  const tax = Math.floor(sellPrice * EA_TAX_RATE);
  return sellPrice - tax - purchasePrice;
}

export function calculateMinSellPrice(purchasePrice, targetProfitPercent = 10) {
  return Math.ceil(purchasePrice * (1 + targetProfitPercent / 100) / (1 - EA_TAX_RATE));
}
