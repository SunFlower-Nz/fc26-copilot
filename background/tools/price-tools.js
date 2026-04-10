/**
 * FC26 Copilot — External price data tools (FutDB/FutBin)
 *
 * These tools do NOT hit EA servers and are not rate-limited by the EA limiter.
 */

import { logger } from '../../shared/logger.js';

export const priceTools = [
  {
    name: 'get_player_market_data',
    description:
      'Get current market price data for a player from external sources (FutDB/FutBin). Includes lowest BIN, average price, and price graph data. This does NOT hit EA servers.',
    inputSchema: {
      type: 'object',
      properties: {
        player_name: { type: 'string' },
        asset_id: { type: 'integer', description: 'EA asset ID if known' },
        platform: { type: 'string', enum: ['pc', 'ps', 'xbox'], default: 'pc' },
      },
    },
    handler: async (params) => {
      try {
        // FutBin price lookup
        // This uses the FutBin public price endpoint
        const platform = params.platform || 'pc';

        if (params.asset_id) {
          const response = await fetch(
            `https://www.futbin.com/stc/cheapest?type=player&platform=${platform}&ids=${params.asset_id}`
          );

          if (!response.ok) {
            return { success: false, error: `FutBin API error: ${response.status}` };
          }

          const data = await response.json();
          logger.info('Price data fetched', {
            tool: 'get_player_market_data',
            assetId: params.asset_id,
            platform,
          });

          return { success: true, data };
        }

        if (params.player_name) {
          const response = await fetch(
            `https://www.futbin.com/search?year=26&term=${encodeURIComponent(params.player_name)}`
          );

          if (!response.ok) {
            return { success: false, error: `FutBin search error: ${response.status}` };
          }

          const data = await response.json();
          logger.info('Player search (FutBin)', {
            tool: 'get_player_market_data',
            playerName: params.player_name,
            results: data?.length || 0,
          });

          return { success: true, data };
        }

        return { success: false, error: 'Provide either player_name or asset_id' };
      } catch (error) {
        logger.error('Price lookup error', { error: error.message });
        return { success: false, error: `Price lookup failed: ${error.message}` };
      }
    },
  },

  {
    name: 'get_coin_balance',
    description: 'Get the current FUT coin balance.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const { rateLimiter } = await import('../rate-limiter.js');
      const { safeEACall } = await import('../ea-call.js');

      await rateLimiter.throttle('read');
      const result = await safeEACall('getCoinBalance', {});

      if (result.success) {
        logger.info('Coin balance fetched', { tool: 'get_coin_balance' });
      }

      return result;
    },
  },
];
