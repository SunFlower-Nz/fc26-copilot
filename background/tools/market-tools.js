/**
 * FC26 Copilot — Transfer market MCP tools
 */

import { rateLimiter } from '../rate-limiter.js';
import { logger } from '../../shared/logger.js';
import { safeEACall } from '../ea-call.js';
import { sellPremiumFodder } from '../market/sell-premium-fodder.js';

export const marketTools = [
  {
    name: 'search_transfer_market',
    description:
      'Search the FUT transfer market for player or item listings. Returns a list of auctions with trade IDs, prices, time remaining, and player details.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['player', 'consumable', 'development'], default: 'player' },
        player_name: { type: 'string', description: 'Player name to search for (fuzzy match)' },
        quality: { type: 'string', enum: ['bronze', 'silver', 'gold', 'special'] },
        position: { type: 'string', description: 'Position filter (e.g., ST, CAM, CB, GK)' },
        chemistry_style: { type: 'string' },
        nation_id: { type: 'integer' },
        league_id: { type: 'integer' },
        club_id: { type: 'integer' },
        min_price: { type: 'integer', description: 'Minimum BIN price' },
        max_price: { type: 'integer', description: 'Maximum BIN price' },
        min_bid: { type: 'integer' },
        max_bid: { type: 'integer' },
        min_rating: { type: 'integer' },
        max_rating: { type: 'integer' },
        page: { type: 'integer', default: 0 },
      },
    },
    handler: async (params) => {
      await rateLimiter.throttle('market_search');
      const result = await safeEACall('searchTransferMarket', params);

      if (result.success) {
        logger.info('Market search', {
          tool: 'search_transfer_market',
          params,
          results: result.data?.auctionInfo?.length || 0,
        });
      }

      return result;
    },
  },

  {
    name: 'buy_now',
    description:
      'Buy an item at its Buy Now price. IMPORTANT: Always confirm with the user before executing. Returns success/failure and updated coin balance.',
    inputSchema: {
      type: 'object',
      properties: {
        trade_id: { type: 'integer', description: 'Trade ID from search results' },
        max_price: { type: 'integer', description: 'Maximum price willing to pay (safety check)' },
      },
      required: ['trade_id', 'max_price'],
    },
    handler: async (params) => {
      await rateLimiter.throttle('buy');
      const result = await safeEACall('buyNow', {
        tradeId: params.trade_id,
        maxPrice: params.max_price,
      });

      if (result.success) {
        logger.trade('Buy Now', {
          tradeId: params.trade_id,
          price: params.max_price,
        });
      }

      return result;
    },
    requiresConfirmation: true,
  },

  {
    name: 'place_bid',
    description:
      'Place a bid on an active auction. Requires confirmation. The bid amount must be higher than the current bid.',
    inputSchema: {
      type: 'object',
      properties: {
        trade_id: { type: 'integer' },
        bid_amount: { type: 'integer' },
      },
      required: ['trade_id', 'bid_amount'],
    },
    handler: async (params) => {
      await rateLimiter.throttle('bid');
      const result = await safeEACall('placeBid', {
        tradeId: params.trade_id,
        bidAmount: params.bid_amount,
      });

      if (result.success) {
        logger.trade('Bid placed', {
          tradeId: params.trade_id,
          bidAmount: params.bid_amount,
        });
      }

      return result;
    },
    requiresConfirmation: true,
  },

  {
    name: 'list_on_market',
    description: 'List an item on the transfer market for sale. Item must be in tradepile first.',
    inputSchema: {
      type: 'object',
      properties: {
        item_id: { type: 'integer', description: 'Item ID from tradepile' },
        start_price: { type: 'integer' },
        buy_now_price: { type: 'integer' },
        duration: {
          type: 'integer',
          enum: [3600, 10800, 21600, 43200, 86400, 259200],
          default: 3600,
          description: 'Listing duration in seconds (1h, 3h, 6h, 12h, 1d, 3d)',
        },
      },
      required: ['item_id', 'start_price', 'buy_now_price'],
    },
    handler: async (params) => {
      await rateLimiter.throttle('list');
      const result = await safeEACall('listItem', {
        itemId: params.item_id,
        startPrice: params.start_price,
        buyNowPrice: params.buy_now_price,
        duration: params.duration || 3600,
      });

      if (result.success) {
        logger.trade('Listed item', {
          itemId: params.item_id,
          startPrice: params.start_price,
          buyNowPrice: params.buy_now_price,
        });
      }

      return result;
    },
    requiresConfirmation: true,
  },

  {
    name: 'sell_premium_fodder',
    description:
      'Preview or list tradeable bronze/silver cards with high market value (e.g. Nilsen, Bounou, Guendouzi, Diop) at EA market average BIN. Default: preview only; use confirm: true to execute.',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          default: false,
          description: 'true = send to tradepile and list at market average',
        },
        dry_run: { type: 'boolean', default: false },
        min_bronze: {
          type: 'integer',
          default: 350,
          description: 'Min EA market average for bronze (45–64)',
        },
        min_silver: {
          type: 'integer',
          default: 650,
          description: 'Min EA market average for silver (65–74)',
        },
        min_multiplier: {
          type: 'number',
          default: 2.5,
          description: 'Market avg must be >= tier baseline × this (filters common fodder)',
        },
        duration: {
          type: 'integer',
          enum: [3600, 10800, 21600, 43200, 86400, 259200],
          default: 3600,
        },
        use_cache: { type: 'boolean', default: true },
        force_refresh: { type: 'boolean', default: false },
      },
    },
    handler: async (params) => sellPremiumFodder(params),
    requiresConfirmation: true,
  },
];
