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

  resolveChallengeId,

} from '../sbc/sbc-service.js';

import { analyzeAllSbcs } from '../sbc/sbc-analyzer.js';
import { solveSbcSet } from '../sbc/sbc-set-solver.js';
import { ensureSbcChallengeOpen, getFutNavigationState } from '../dom-bridge.js';

import { parseSbcRequirements } from '../sbc/requirements-parser.js';

import { summarizeConstraints } from '../sbc/requirements-summary.js';



async function resolveId(params) {

  const resolved = await resolveChallengeId(params.challenge_id, params.challenge_name);

  if (resolved.error) {

    return { error: resolved.error, matches: resolved.matches };

  }

  return { challengeId: resolved.challengeId, setId: resolved.setId, name: resolved.name };

}



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

        challenge_name: {

          type: 'string',

          description: 'Optional — resolve challenge by name instead of ID',

        },

      },

    },

    handler: async (params) => {

      const resolved = await resolveId({

        challenge_id: params.sbc_id,

        challenge_name: params.challenge_name,

      });

      if (resolved.error) {

        return { success: false, error: resolved.error, matches: resolved.matches };

      }



      await rateLimiter.throttle('sbc_read');

      const result = await safeEACall('getSBCRequirements', { sbcId: resolved.challengeId });



      if (result.success) {

        logger.info('SBC requirements fetched', {

          tool: 'get_sbc_requirements',

          sbcId: resolved.challengeId,

        });

        const parsed = parseSbcRequirements(result.data);

        return {

          success: true,

          data: {

            raw: result.data,

            parsed,

            summary: summarizeConstraints(parsed),

            requiredPlayers: parsed.playerCount || parsed.squadSize,

          },

        };

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

        challenge_name: { type: 'string' },

      },

    },

    handler: async (params) => {

      const resolved = await resolveId(params);

      if (resolved.error) {

        return { success: false, error: resolved.error, matches: resolved.matches };

      }



      await rateLimiter.throttle('sbc_read');

      return safeEACall('getSBCSquad', { challengeId: resolved.challengeId });

    },

  },



  {

    name: 'solve_sbc',

    description:

      'Solve an SBC using club/unassigned players. Returns preview with names and bilingual positions (e.g. ATA/ST). Does NOT submit. Use challenge_id (fast) or challenge_name.',

    inputSchema: {

      type: 'object',

      properties: {

        challenge_id: { type: 'string', description: 'SBC challenge ID (preferred)' },

        challenge_name: {

          type: 'string',

          description: 'Resolve by name if ID unknown (e.g. "Bronze Upgrade")',

        },

        min_rating: { type: 'integer', default: 45 },

        max_rating: { type: 'integer', default: 99 },

        include_unassigned: { type: 'boolean', default: true },

        use_cache: { type: 'boolean', default: true },

        force_refresh: { type: 'boolean', default: false },

        allow_last_resort: {
          type: 'boolean',
          description:
            'Allow special/titular cards only if you confirmed — blocked by default',
        },
      },

    },

    handler: async (params) => {

      const resolved = await resolveId(params);

      if (resolved.error) {

        return { success: false, error: resolved.error, matches: resolved.matches };

      }



      return previewSbcSolution(resolved.challengeId, {

        challenge_name: resolved.name || params.challenge_name,

        set_id: params.set_id ?? resolved.setId ?? null,

        min_rating: params.min_rating,

        max_rating: params.max_rating,

        include_unassigned: params.include_unassigned,

        use_cache: params.use_cache,

        force_refresh: params.force_refresh,

        allow_last_resort: params.allow_last_resort,

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

        challenge_name: { type: 'string' },

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

      required: ['item_ids'],

    },

    requiresConfirmation: true,

    isWrite: true,

    handler: async (params) => {

      const resolved = await resolveId(params);

      if (resolved.error) {

        return { success: false, error: resolved.error, matches: resolved.matches };

      }



      return applySbcSolution(resolved.challengeId, params.item_ids, {
        setId: params.set_id ?? resolved.setId,
        set_id: params.set_id ?? resolved.setId,
        challenge_name: params.challenge_name ?? resolved.name,
        open_ui: params.open_ui,
      });

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

        challenge_name: { type: 'string' },

        set_id: { type: 'integer', description: 'Optional set ID from challenge metadata' },

        confirm: { type: 'boolean' },

      },

    },

    requiresConfirmation: true,

    isWrite: true,

    handler: async (params) => {

      const resolved = await resolveId(params);

      if (resolved.error) {

        return { success: false, error: resolved.error, matches: resolved.matches };

      }



      return submitSbcChallenge(resolved.challengeId, params.set_id ?? resolved.setId ?? null);

    },

  },



  {

    name: 'complete_sbc',

    description:

      'Single SBC run: solve → apply → submit. Returns preview when confirm is false. With confirm: true, executes once. No automatic repeat loop.',

    inputSchema: {

      type: 'object',

      properties: {

        challenge_id: { type: 'string', description: 'Challenge ID (preferred)' },

        challenge_name: { type: 'string', description: 'Or resolve by name' },

        set_id: { type: 'integer' },

        confirm: {

          type: 'boolean',

          description: 'Set true only after user confirms the preview',

        },

        apply_only: {

          type: 'boolean',

          description: 'If true with confirm, only apply squad without submit',

        },

        min_rating: { type: 'integer', default: 45 },

        max_rating: { type: 'integer', default: 99 },

        use_cache: { type: 'boolean', default: true },

        open_ui: {
          type: 'boolean',
          description: 'Auto-open challenge in Web App before apply (default true)',
          default: true,
        },

        allow_last_resort: {
          type: 'boolean',
          description: 'Confirm use of blocked/special card when no standard fodder exists',
        },
      },

    },

    requiresConfirmation: true,

    isWrite: true,

    handler: async (params) => {

      return completeSbc(params.challenge_id || null, {

        confirm: params.confirm,

        challenge_name: params.challenge_name,

        set_id: params.set_id,

        apply_only: params.apply_only,

        min_rating: params.min_rating,

        max_rating: params.max_rating,

        use_cache: params.use_cache,

        open_ui: params.open_ui,

        allow_last_resort: params.allow_last_resort,

      });

    },

  },

  {

    name: 'analyze_sbcs',

    description:

      'Scan active SBCs, read EA requirements (elgReq) per challenge, and rank feasibility + cost-benefit for your club. Requirements-driven — no hardcoded upgrade names.',

    inputSchema: {

      type: 'object',

      properties: {

        category: {

          type: 'string',

          description: 'Filter by category (e.g. Upgrades / Melhorias)',

        },

        max_sets: { type: 'integer', default: 40 },

        top_n: { type: 'integer', default: 15 },

        try_solve: { type: 'boolean', default: true },

        include_completed: { type: 'boolean', default: false },

        include_all: { type: 'boolean', default: false },

        force_refresh: { type: 'boolean', default: false },

        daily_only: {
          type: 'boolean',
          default: false,
          description: 'Only scan Daily Bronze/Silver/Gold upgrades',
        },

        use_cache: { type: 'boolean', default: true },

        use_futbin_prices: { type: 'boolean', default: false },

      },

    },

    handler: async (params) => {

      return analyzeAllSbcs({

        category: params.category,

        max_sets: params.max_sets,

        top_n: params.top_n,

        try_solve: params.try_solve !== false,

        include_completed: params.include_completed === true,

        include_all: params.include_all === true,

        force_refresh: params.force_refresh === true,

        daily_only: params.daily_only === true,

        use_cache: params.use_cache !== false,

        use_futbin_prices: params.use_futbin_prices === true,

        platform: params.platform || 'pc',

      });

    },

  },

  {

    name: 'solve_sbc_set',

    description:

      'Solve all challenges in one SBC set (FutNext-style entire set solver). Preview only — does not submit. Reserves players across challenges in order.',

    inputSchema: {

      type: 'object',

      properties: {

        set_id: { type: 'string', description: 'SBC set ID from get_sbc_sets' },

        set_name: { type: 'string', description: 'Optional — resolve set by name' },

        min_rating: { type: 'integer', default: 45 },

        max_rating: { type: 'integer', default: 99 },

        use_cache: { type: 'boolean', default: true },

        allow_last_resort: { type: 'boolean', default: false },

      },

      required: [],

    },

    handler: async (params) => {

      let setId = params.set_id;

      if (!setId && params.set_name) {

        const sets = await safeEACall('getSBCSets', {});

        if (!sets.success) return sets;

        const categories = sets.data?.categories || [];

        const flat = [];

        for (const cat of categories) {

          for (const set of cat.sets || []) {

            flat.push({ setId: set.setId ?? set.id, name: set.name });

          }

        }

        const q = params.set_name.toLowerCase();

        const match = flat.find((s) => (s.name || '').toLowerCase().includes(q));

        if (!match) {

          return { success: false, error: `No set matching "${params.set_name}"` };

        }

        setId = match.setId;

      }

      if (!setId) {

        return { success: false, error: 'Provide set_id or set_name' };

      }

      return solveSbcSet(setId, {

        set_name: params.set_name,

        min_rating: params.min_rating,

        max_rating: params.max_rating,

        use_cache: params.use_cache,

        allow_last_resort: params.allow_last_resort,

      });

    },

  },

  {
    name: 'get_fut_navigation_state',
    description:
      'Inspect FUT Web App UI state (current screen, SBC hub/squad open). Useful for debugging DOM navigation.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => getFutNavigationState(),
  },

  {
    name: 'open_sbc_challenge',
    description:
      'Open an SBC/DME challenge screen in the Web App (internal navigation + DOM fallback). Required before apply/submit when squad API returns 404.',
    inputSchema: {
      type: 'object',
      properties: {
        challenge_id: { type: 'string', description: 'Challenge ID (preferred)' },
        set_id: { type: 'integer', description: 'SBC set ID' },
        challenge_name: { type: 'string' },
        set_name: { type: 'string' },
      },
      required: ['set_id'],
    },
    handler: async (params) => {
      const resolved = await resolveId(params);
      if (resolved.error) {
        return { success: false, error: resolved.error, matches: resolved.matches };
      }

      const result = await ensureSbcChallengeOpen({
        setId: params.set_id ?? resolved.setId,
        challengeId: resolved.challengeId,
        setName: params.set_name,
        challengeName: params.challenge_name ?? resolved.name,
      });

      if (!result.success) return result;
      return { success: true, data: result.data };
    },
  },

];


