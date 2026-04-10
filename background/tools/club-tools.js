/**
 * FC26 Copilot — Club and squad management MCP tools
 */

import { rateLimiter } from '../rate-limiter.js';
import { logger } from '../../shared/logger.js';
import { safeEACall } from '../ea-call.js';

export const clubTools = [
  {
    name: 'get_club_players',
    description:
      'Get a list of players currently in the club. Supports filtering by position, rating, and untradeable status.',
    inputSchema: {
      type: 'object',
      properties: {
        position: { type: 'string' },
        min_rating: { type: 'integer' },
        max_rating: { type: 'integer' },
        is_untradeable: { type: 'boolean' },
        count: { type: 'integer', default: 50, maximum: 100 },
      },
    },
    handler: async (params) => {
      await rateLimiter.throttle('read');
      const result = await safeEACall('getClubPlayers', params);

      if (result.success) {
        logger.info('Club players fetched', {
          tool: 'get_club_players',
          count: result.data?.itemData?.length || 0,
        });
      }

      return result;
    },
  },

  {
    name: 'get_unassigned',
    description: 'Get all unassigned items (items not yet sent to club or tradepile).',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      await rateLimiter.throttle('read');
      const result = await safeEACall('getUnassigned', {});

      if (result.success) {
        logger.info('Unassigned items fetched', {
          tool: 'get_unassigned',
          count: result.data?.itemData?.length || 0,
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
