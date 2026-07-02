/**

 * FC26 Copilot — Club and squad management MCP tools

 */



import { rateLimiter } from '../rate-limiter.js';

import { logger } from '../../shared/logger.js';

import { safeEACall } from '../ea-call.js';

import {

  getCache,

  refreshFullCache,

  filterCachedClubPlayers,

  cacheSummary,

  updateCache,

} from '../cache/fut-cache.js';

import { enrichPlayers } from '../player-catalog.js';

import { formatPosition } from '../../shared/positions.js';



export const clubTools = [

  {

    name: 'get_club_players',

    description:

      'Get players in the club. Uses local cache by default (fast). Set force_refresh: true to fetch from EA.',

    inputSchema: {

      type: 'object',

      properties: {

        position: { type: 'string' },

        min_rating: { type: 'integer' },

        max_rating: { type: 'integer' },

        is_untradeable: { type: 'boolean' },

        count: { type: 'integer', default: 91, maximum: 91 },

        max_total: { type: 'integer', default: 1000, maximum: 1500 },

        sort: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },

        use_cache: { type: 'boolean', default: true },

        force_refresh: { type: 'boolean', default: false },

      },

    },

    handler: async (params) => {

      const useCache = params.use_cache !== false && !params.force_refresh;



      if (useCache) {

        const cache = await getCache();

        if (cache?.clubPlayers?.length) {

          const filtered = filterCachedClubPlayers(cache, params);

          const itemData = filtered.itemData.map((p) => ({

            ...p,

            position: p.positionLabel || formatPosition(p.preferredPosition || p.position),

          }));



          logger.info('Club players from cache', {

            tool: 'get_club_players',

            count: itemData.length,

          });



          return {

            success: true,

            data: {

              itemData,

              total: filtered.total,

              fromCache: true,

              cacheUpdatedAt: cache.updatedAt,

              summary: cacheSummary(cache),

            },

          };

        }

      }



      await rateLimiter.throttle('read');

      const result = await safeEACall('getClubPlayers', params);



      if (result.success) {

        const items = await enrichPlayers(result.data?.itemData || []);

        await updateCache({ clubPlayers: items });

        result.data = {

          itemData: items.map((p) => ({

            ...p,

            position: p.positionLabel || formatPosition(p.preferredPosition),

          })),

          total: result.data?.total ?? items.length,

          fromCache: false,

        };



        logger.info('Club players fetched from EA', {

          tool: 'get_club_players',

          count: items.length,

        });

      }



      return result;

    },

  },



  {

    name: 'get_unassigned',

    description:

      'Get unassigned items. Uses cache unless force_refresh is true.',

    inputSchema: {

      type: 'object',

      properties: {

        force_refresh: { type: 'boolean', default: false },

      },

    },

    handler: async (params) => {

      if (!params.force_refresh) {

        const cache = await getCache();

        if (cache?.unassigned) {

          return {

            success: true,

            data: {

              itemData: cache.unassigned,

              fromCache: true,

              cacheUpdatedAt: cache.updatedAt,

            },

          };

        }

      }



      await rateLimiter.throttle('read');

      const result = await safeEACall('getUnassigned', {});



      if (result.success) {

        const items = result.data?.itemData || result.data?.items || [];

        await updateCache({ unassigned: items });

        logger.info('Unassigned items fetched', {

          tool: 'get_unassigned',

          count: items.length,

        });

      }



      return result;

    },

  },



  {

    name: 'send_to_tradepile',

    description:

      'Move an item to the tradepile for selling. Works on items in transfer targets (won bids) or club.',

    inputSchema: {

      type: 'object',

      properties: {

        item_id: { type: 'integer' },

      },

      required: ['item_id'],

    },

    handler: async (params) => {

      await rateLimiter.throttle('read');

      const result = await safeEACall('sendToTradepile', { itemId: params.item_id });



      if (result.success) {

        logger.info('Item sent to tradepile', { itemId: params.item_id });

      }



      return result;

    },

  },



  {

    name: 'send_to_club',

    description: 'Send an item to the club (e.g., won bid items or unassigned items).',

    inputSchema: {

      type: 'object',

      properties: {

        item_id: { type: 'integer' },

      },

      required: ['item_id'],

    },

    handler: async (params) => {

      await rateLimiter.throttle('read');

      const result = await safeEACall('sendToClub', { itemId: params.item_id });



      if (result.success) {

        logger.info('Item sent to club', { itemId: params.item_id });

      }



      return result;

    },

  },

];


