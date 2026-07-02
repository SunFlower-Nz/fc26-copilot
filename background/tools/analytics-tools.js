/**
 * Club analytics MCP tool.
 */

import { computeClubAnalytics } from '../analytics/club-analytics.js';

export const analyticsTools = [
  {
    name: 'get_club_analytics',
    description:
      'Portfolio analytics for your club: total value, investments, unrealized P/L, fodder, transfer list, rating distribution, top gainers/losers. Uses cache + optional FutBin prices.',
    inputSchema: {
      type: 'object',
      properties: {
        force_refresh: { type: 'boolean', default: false },
        use_futbin: { type: 'boolean', default: true },
        platform: { type: 'string', enum: ['pc', 'ps', 'xbox'], default: 'pc' },
        top_n: { type: 'integer', default: 10 },
      },
    },
    handler: async (params) => {
      return computeClubAnalytics({
        force_refresh: params.force_refresh === true,
        use_futbin: params.use_futbin !== false,
        platform: params.platform || 'pc',
        top_n: params.top_n ?? 10,
      });
    },
  },
];
