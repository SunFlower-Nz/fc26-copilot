/**
 * FUT cache MCP tools — manual refresh only (no auto loops).
 */

import { rateLimiter } from '../rate-limiter.js';
import { safeEACall } from '../ea-call.js';
import {
  getCache,
  refreshFullCache,
  cacheSummary,
  filterCachedClubPlayers,
} from '../cache/fut-cache.js';

export const cacheTools = [
  {
    name: 'get_fut_cache',
    description:
      'Read the local FUT cache (club, squad, formation, tradepile, SBCs, coins). Does not call EA unless cache is empty and refresh_if_empty is true.',
    inputSchema: {
      type: 'object',
      properties: {
        refresh_if_empty: { type: 'boolean', default: false },
      },
    },
    handler: async (params) => {
      let cache = await getCache();
      if (!cache?.clubPlayers?.length && params.refresh_if_empty) {
        await rateLimiter.throttle('read');
        return refreshFullCache(safeEACall);
      }

      return {
        success: true,
        data: {
          ...(cache || {}),
          summary: cache ? cacheSummary(cache) : null,
        },
      };
    },
  },

  {
    name: 'refresh_fut_cache',
    description:
      'Manually refresh the full FUT cache from EA (club, squad, formation, tradepile, watchlist, unassigned, SBCs, coins).',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      await rateLimiter.throttle('read');
      return refreshFullCache(safeEACall);
    },
  },

  {
    name: 'get_active_squad',
    description:
      'Get the active squad (titular) with formation. Uses cache unless force_refresh is true.',
    inputSchema: {
      type: 'object',
      properties: {
        force_refresh: { type: 'boolean', default: false },
      },
    },
    handler: async (params) => {
      if (!params.force_refresh) {
        const cache = await getCache();
        if (cache?.activeSquad) {
          return {
            success: true,
            data: {
              squad: cache.activeSquad,
              formation: cache.formation,
              fromCache: true,
              updatedAt: cache.updatedAt,
            },
          };
        }
      }

      await rateLimiter.throttle('read');
      const result = await safeEACall('getActiveSquad', {});
      return result;
    },
  },
];

export { filterCachedClubPlayers };
