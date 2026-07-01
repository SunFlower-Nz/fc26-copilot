/**
 * FC26 Copilot — SBC MCP tools (read + solve + submit)
 */

import { rateLimiter } from '../rate-limiter.js';
import { logger } from '../../shared/logger.js';
import { safeEACall } from '../ea-call.js';
import {
  previewSbcSolution,
  applySbcSolution,
  submitSbcChallenge,
  completeSbc,
} from '../sbc/sbc-service.js';

export const sbcTools = [
  {
    name: 'get_active_sbcs',
    description:
      'Get all currently active SBCs with their requirements, rewards, and expiry times.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      await rateLimiter.throttle('sbc_read');
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
    name: 'get_sbc_sets',
    description: 'Get SBC categories and sets from the upgrades/icons/etc. hub.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      await rateLimiter.throttle('sbc_read');
      return safeEACall('getSBCSets', {});
    },
  },

  {
    name: 'get_sbc_requirements',
    description:
      'Get the detailed requirements for a specific SBC challenge (rating, chemistry, nation/league constraints, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        sbc_id: { type: 'string', description: 'Challenge ID' },
      },
      required: ['sbc_id'],
    },
    handler: async (params) => {
      await rateLimiter.throttle('sbc_read');
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

  {
    name: 'get_sbc_squad',
    description: 'Get the current draft squad for an open SBC challenge.',
    inputSchema: {
      type: 'object',
      properties: {
        challenge_id: { type: 'string' },
      },
      required: ['challenge_id'],
    },
    handler: async (params) => {
      await rateLimiter.throttle('sbc_read');
      return safeEACall('getSBCSquad', { challengeId: params.challenge_id });
    },
  },

  {
    name: 'solve_sbc',
    description:
      'Solve an SBC using club/unassigned players. Returns a preview with selected cards, rating, and chemistry. Does NOT submit. Always show the preview to the user before applying.',
    inputSchema: {
      type: 'object',
      properties: {
        challenge_id: { type: 'string', description: 'SBC challenge ID' },
        challenge_name: { type: 'string', description: 'Optional name hint for upgrade DMEs' },
        min_rating: { type: 'integer', default: 45 },
        max_rating: { type: 'integer', default: 99 },
        include_unassigned: { type: 'boolean', default: true },
      },
      required: ['challenge_id'],
    },
    handler: async (params) => {
      return previewSbcSolution(params.challenge_id, {
        challenge_name: params.challenge_name,
        min_rating: params.min_rating,
        max_rating: params.max_rating,
        include_unassigned: params.include_unassigned,
      });
    },
  },

  {
    name: 'apply_sbc_solution',
    description:
      'Apply a solved squad to an SBC (PUT squad). IRREVERSIBLE once submitted later. Requires confirm: true.',
    inputSchema: {
      type: 'object',
      properties: {
        challenge_id: { type: 'string' },
        item_ids: {
          type: 'array',
          items: { type: 'integer' },
          description: 'Item instance IDs per slot (0 = empty)',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true after user reviews the solve_sbc preview',
        },
      },
      required: ['challenge_id', 'item_ids'],
    },
    requiresConfirmation: true,
    isWrite: true,
    handler: async (params) => {
      return applySbcSolution(params.challenge_id, params.item_ids);
    },
  },

  {
    name: 'submit_sbc',
    description:
      'Submit an SBC challenge after the squad is applied. PERMANENTLY consumes players. Requires confirm: true.',
    inputSchema: {
      type: 'object',
      properties: {
        challenge_id: { type: 'string' },
        set_id: { type: 'integer', description: 'Optional set ID from challenge metadata' },
        confirm: { type: 'boolean' },
      },
      required: ['challenge_id'],
    },
    requiresConfirmation: true,
    isWrite: true,
    handler: async (params) => {
      return submitSbcChallenge(params.challenge_id, params.set_id ?? null);
    },
  },

  {
    name: 'complete_sbc',
    description:
      'Full SBC flow: solve → apply squad → submit. Returns preview when confirm is false. When confirm is true, executes the full flow. Use repeat for upgrade loops (max 10).',
    inputSchema: {
      type: 'object',
      properties: {
        challenge_id: { type: 'string' },
        challenge_name: { type: 'string' },
        set_id: { type: 'integer' },
        confirm: {
          type: 'boolean',
          description: 'Set true only after user confirms the preview',
        },
        apply_only: {
          type: 'boolean',
          description: 'If true with confirm, only apply squad without submit',
        },
        repeat: {
          type: 'integer',
          description: 'Repeat the full flow N times (upgrade DMEs)',
          default: 1,
        },
        min_rating: { type: 'integer', default: 45 },
        max_rating: { type: 'integer', default: 99 },
      },
      required: ['challenge_id'],
    },
    requiresConfirmation: true,
    autoConfirmCheap: true,
    isWrite: true,
    handler: async (params) => {
      return completeSbc(params.challenge_id, {
        confirm: params.confirm,
        challenge_name: params.challenge_name,
        set_id: params.set_id,
        apply_only: params.apply_only,
        repeat: params.repeat,
        min_rating: params.min_rating,
        max_rating: params.max_rating,
      });
    },
  },
];
