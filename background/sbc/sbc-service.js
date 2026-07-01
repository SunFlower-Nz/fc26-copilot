/**
 * Orchestrates SBC solve, apply, submit with EA validation.
 */

import { rateLimiter } from '../rate-limiter.js';
import { safeEACall } from '../ea-call.js';
import { logger } from '../../shared/logger.js';
import {
  parseSbcRequirements,
  applyUpgradeHeuristics,
} from './requirements-parser.js';
import { fetchPlayerPool } from './player-pool.js';
import { solveFromChallengeData, solutionToItemIds } from './solver.js';
import { extractEaValidation } from './chemistry-engine.js';

/**
 * @param {string|number} challengeId
 * @param {Object} options
 */
export async function previewSbcSolution(challengeId, options = {}) {
  await rateLimiter.throttle('sbc_read');

  const reqResult = await safeEACall('getSBCRequirements', { sbcId: String(challengeId) });
  if (!reqResult.success) {
    return { success: false, error: reqResult.error };
  }

  let constraints = parseSbcRequirements(reqResult.data);
  constraints = applyUpgradeHeuristics(
    constraints,
    options.challenge_name || constraints.name
  );

  const pool = await fetchPlayerPool({
    min_rating: options.min_rating ?? 45,
    max_rating: options.max_rating ?? 99,
    include_unassigned: options.include_unassigned !== false,
    filters: options.filters || {},
  });

  const solution = solveFromChallengeData(reqResult.data, pool, {
    challengeName: constraints.name,
  });

  if (!solution) {
    return {
      success: false,
      error: 'No valid solution found with current club players.',
      data: {
        challenge: constraints.name,
        challengeId: constraints.challengeId,
        poolSize: pool.length,
        constraints,
      },
    };
  }

  const preview = formatPreview(solution, constraints);

  return {
    success: true,
    needsConfirmation: true,
    data: preview,
  };
}

/**
 * @param {string|number} challengeId
 * @param {number[]} itemIdsBySlot
 */
export async function applySbcSolution(challengeId, itemIdsBySlot) {
  await rateLimiter.throttle('sbc_write');
  const putResult = await safeEACall('setSBCSquad', {
    challengeId: String(challengeId),
    itemIdsBySlot,
  });

  if (!putResult.success) {
    return putResult;
  }

  await rateLimiter.throttle('sbc_read');
  const squadResult = await safeEACall('getSBCSquad', { challengeId: String(challengeId) });
  const validation = squadResult.success
    ? extractEaValidation(squadResult.data)
    : extractEaValidation(putResult.data);

  return {
    success: true,
    data: {
      applied: true,
      challengeId,
      itemIdsBySlot,
      validation,
    },
  };
}

/**
 * @param {string|number} challengeId
 * @param {number|null} setId
 */
export async function submitSbcChallenge(challengeId, setId = null) {
  await rateLimiter.throttle('sbc_write');
  const result = await safeEACall('submitSBC', {
    challengeId: String(challengeId),
    setId,
  });

  if (result.success) {
    logger.info('SBC submitted', { challengeId, setId });
  }

  return result;
}

/**
 * Full flow: solve → apply → optional submit.
 * @param {string|number} challengeId
 * @param {Object} options
 */
export async function completeSbc(challengeId, options = {}) {
  const preview = await previewSbcSolution(challengeId, options);
  if (!preview.success) return preview;

  if (!options.confirm) {
    return {
      success: false,
      needsConfirmation: true,
      error: 'Confirmation required. Re-call with confirm: true to apply and submit.',
      data: preview.data,
    };
  }

  const itemIds = previewToItemIds(preview.data);

  const applyResult = await applySbcSolution(challengeId, itemIds);
  if (!applyResult.success) return applyResult;

  if (options.apply_only) {
    return {
      success: true,
      data: {
        ...preview.data,
        applied: true,
        submitted: false,
        validation: applyResult.data.validation,
      },
    };
  }

  const setId = options.set_id ?? preview.data.setId ?? null;
  const submitResult = await submitSbcChallenge(challengeId, setId);
  if (!submitResult.success) {
    return {
      success: false,
      error: submitResult.error,
      data: {
        preview: preview.data,
        applied: true,
        submitted: false,
      },
    };
  }

  const repeat = Math.min(options.repeat || 1, 10);
  const results = [
    {
      challengeId,
      submitted: true,
      reward: submitResult.data,
    },
  ];

  for (let i = 1; i < repeat; i += 1) {
    const next = await completeSbc(challengeId, {
      ...options,
      confirm: true,
      repeat: 1,
    });
    results.push({
      challengeId,
      submitted: next.success,
      error: next.error || null,
    });
    if (!next.success) break;
  }

  return {
    success: true,
    data: {
      preview: preview.data,
      applied: true,
      submitted: true,
      repeatResults: results,
      reward: submitResult.data,
    },
  };
}

function formatPreview(solution, constraints) {
  return {
    challenge: constraints.name,
    challengeId: constraints.challengeId,
    setId: constraints.setId,
    players: solution.players.map(({ slot, player }) => ({
      slot,
      itemId: player.id,
      assetId: player.assetId,
      rating: player.rating,
      untradeable: player.untradeable,
      nation: player.nation,
      leagueId: player.leagueId,
      teamid: player.teamid,
      name: player._name || null,
    })),
    teamRating: solution.teamRating,
    chemistry: solution.chemistry,
    estimatedValue: solution.estimatedValue,
    slotCount: constraints.squadSize || solution.players.length,
    warnings: solution.warnings,
    needsConfirmation: true,
  };
}

function previewToItemIds(previewData) {
  const slotCount = previewData.slotCount || 11;
  const ids = new Array(slotCount).fill(0);
  for (const player of previewData.players) {
    if (player.slot >= 0 && player.slot < slotCount) {
      ids[player.slot] = player.itemId;
    }
  }
  return ids;
}
