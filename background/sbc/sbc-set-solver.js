/**
 * Solve all challenges in an SBC set (FutNext "Entire Set Solver" parity).
 */

import { safeEACall } from '../ea-call.js';
import { rateLimiter } from '../rate-limiter.js';
import { fetchPlayerPool } from './player-pool.js';
import { parseSbcRequirements } from './requirements-parser.js';
import { solveFromChallengeData } from './solver.js';
import { summarizeConstraints } from './requirements-summary.js';
import { estimateRewards } from './reward-estimator.js';
import { enrichChallengeRequirements } from './sbc-catalog.js';

function extractChallenges(setResult) {
  return (
    setResult?.challenges ||
    setResult?.SBCChallengeResponse?.challenges ||
    (Array.isArray(setResult) ? setResult : [])
  );
}

/**
 * @param {number|string} setId
 * @param {Object} options
 */
export async function solveSbcSet(setId, options = {}) {
  await rateLimiter.throttle('sbc_read');
  const setResult = await safeEACall('getSBCSetChallenges', { setId: String(setId) });
  if (!setResult.success) {
    return { success: false, error: setResult.error || 'Failed to load set challenges' };
  }

  const challenges = extractChallenges(setResult.data);
  if (!challenges.length) {
    return { success: false, error: 'No challenges found in set' };
  }

  const pool = await fetchPlayerPool({
    min_rating: options.min_rating ?? 45,
    max_rating: options.max_rating ?? 99,
    include_unassigned: options.include_unassigned !== false,
    include_sbc_storage: true,
    use_cache: options.use_cache !== false,
    force_refresh: options.force_refresh === true,
    filters: {
      fodder_only: !options.allow_last_resort,
    },
  });

  const usedItemIds = new Set();
  const results = [];

  for (const ch of challenges) {
    const challengeId = String(ch.challengeId ?? ch.id);
    let entry = {
      challengeId,
      setId,
      name: ch.name,
      setName: options.set_name || ch.name,
      elgReq: ch.elgReq || ch.eligibilityRequirements || [],
      squadSize: ch.squadSize,
      rawRequirements: ch,
      requirementsSource: 'set_challenges',
    };

    entry = await enrichChallengeRequirements(entry);

    const challengeData = {
      ...(entry.rawRequirements || {}),
      challengeId,
      setId,
      name: entry.name,
      elgReq: entry.elgReq,
    };

    const constraints = parseSbcRequirements(challengeData);
    const availablePool = pool.filter((p) => !usedItemIds.has(p.id));
    const solution = solveFromChallengeData(challengeData, availablePool, {
      use_heuristics: false,
    });

    const rewards = estimateRewards(challengeData);
    const row = {
      challengeId,
      name: entry.name || ch.name,
      requirementsSummary: summarizeConstraints(constraints),
      rewards: rewards.items,
      estimatedBenefit: rewards.totalValue,
      solved: Boolean(solution),
      players: solution
        ? solution.players.map(({ slot, player }) => ({
            slot,
            itemId: player.id,
            rating: player.rating,
            untradeable: player.untradeable,
            inSbcStorage: player.inSbcStorage,
          }))
        : [],
      estimatedCost: solution?.estimatedValue ?? null,
      teamRating: solution?.teamRating ?? null,
      chemistry: solution?.chemistry ?? null,
    };

    if (solution) {
      for (const { player } of solution.players) {
        usedItemIds.add(player.id);
      }
    }

    results.push(row);
  }

  const allSolved = results.every((r) => r.solved);
  const totalCost = results.reduce((s, r) => s + (r.estimatedCost || 0), 0);
  const totalBenefit = results.reduce((s, r) => s + (r.estimatedBenefit || 0), 0);

  return {
    success: true,
    data: {
      setId: String(setId),
      setName: options.set_name || null,
      challengeCount: results.length,
      allSolved,
      totalEstimatedCost: totalCost,
      totalEstimatedBenefit: totalBenefit,
      netValue: totalBenefit - totalCost,
      challenges: results,
      note: 'Cartas reservadas entre challenges do mesmo set (sem reutilizar).',
    },
  };
}
