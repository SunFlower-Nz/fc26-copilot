/**
 * FC26 Copilot — SBC MCP tools
 */

import { rateLimiter } from '../rate-limiter.js';
import { logger } from '../../shared/logger.js';
import { safeEACall } from '../ea-call.js';

export const sbcTools = [
  {
    name: 'get_active_sbcs',
    description:
      'Get all currently active SBCs with their requirements, rewards, and expiry times.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      await rateLimiter.throttle('read');
      const result = await safeEACall('getActiveSBCs', {});

      if (result.success) {
        logger.info('Active SBCs fetched', {
          tool: 'get_active_sbcs',
          count: result.data?.challenges?.length || 0,
        });
      }

      return result;
    },
  },

  {
    name: 'get_sbc_requirements',
    description:
      'Get the detailed requirements for a specific SBC challenge (rating, chemistry, nation/league constraints, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        sbc_id: { type: 'string' },
      },
      required: ['sbc_id'],
    },
    handler: async (params) => {
      await rateLimiter.throttle('read');
      const result = await safeEACall('getSBCRequirements', { sbcId: params.sbc_id });

      if (result.success) {
        logger.info('SBC requirements fetched', {
          tool: 'get_sbc_requirements',
          sbcId: params.sbc_id,
        });
      }

      return result;
    },
  },
];
