/**
 * FC26 Copilot — Tradepile and watchlist MCP tools
 */

import { rateLimiter } from '../rate-limiter.js';
import { logger } from '../../shared/logger.js';
import { safeEACall } from '../ea-call.js';

export const tradepileTools = [
  {
    name: 'get_tradepile',
    description:
      'Get all items in the tradepile. Shows listed items (with current bid info), sold items, and expired items.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      await rateLimiter.throttle('read');
      const result = await safeEACall('getTradepile', {});

      if (result.success) {
        logger.info('Tradepile fetched', {
          tool: 'get_tradepile',
          count: result.data?.auctionInfo?.length || 0,
        });
      }

      return result;
    },
  },

  {
    name: 'get_watchlist',
    description:
      'Get items on the watchlist (transfer targets). Shows items being bid on and their current status.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      await rateLimiter.throttle('read');
      const result = await safeEACall('getWatchlist', {});

      if (result.success) {
        logger.info('Watchlist fetched', {
          tool: 'get_watchlist',
          count: result.data?.auctionInfo?.length || 0,
        });
      }

      return result;
    },
  },

  {
    name: 'relist_all',
    description:
      'Relist all expired items in the tradepile at their previous prices. Returns count of relisted items.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      await rateLimiter.throttle('relist');
      const result = await safeEACall('relistAll', {});

      if (result.success) {
        logger.trade('Relisted all expired items', {
          tool: 'relist_all',
        });
      }

      return result;
    },
    requiresConfirmation: true,
  },

  {
    name: 'clear_sold',
    description:
      'Remove all sold items from the tradepile to free up space. Returns count of cleared items and total coins earned.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      await rateLimiter.throttle('read');
      const result = await safeEACall('clearSold', {});

      if (result.success) {
        logger.trade('Cleared sold items', { tool: 'clear_sold' });
      }

      return result;
    },
  },
];
