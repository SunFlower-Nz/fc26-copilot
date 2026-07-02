/**
 * CSP-style solver for complex SBCs (11 players, chemistry, rating).
 * Uses MRV variable ordering + forward checking; falls back when timeout.
 */

import {
  getRequiredPlayerCount,
} from './requirements-parser.js';
import {
  calculateSquadChemistry,
  calculateTeamRating,
} from './chemistry-engine.js';
import { estimatePlayerCost } from './player-pool.js';
import { satisfiesConstraints } from './solver.js';

const CSP_TIMEOUT_MS = 20000;
const CSP_MAX_CANDIDATES = 200;

/**
 * Whether to prefer CSP solver over greedy backtracking.
 * @param {import('./types.js').SbcConstraints} constraints
 */
export function shouldUseCspSolver(constraints) {
  const count = getRequiredPlayerCount(constraints);
  if (count >= 6) return true;
  if (constraints.minChemistry && constraints.minChemistry >= 10) return true;
  if (constraints.minTeamRating && constraints.minTeamRating >= 82) return true;

  const complexReqs = (constraints.playerRequirements || []).filter((r) =>
    ['SAME_LEAGUE_COUNT', 'SAME_NATION_COUNT', 'SAME_CLUB_COUNT', 'LEAGUE_COUNT', 'NATION_COUNT', 'CLUB_COUNT'].includes(
      r.type
    )
  );
  return complexReqs.length >= 2;
}

/**
 * @param {import('./types.js').SbcConstraints} constraints
 * @param {import('./types.js').ClubPlayer[]} pool
 * @param {Object} options
 * @returns {import('./types.js').SbcSolution|null}
 */
export function solveSbcCsp(constraints, pool, options = {}) {
  const started = Date.now();
  const requiredCount = getRequiredPlayerCount(constraints);
  const candidates = rankCandidates(pool, constraints).slice(0, CSP_MAX_CANDIDATES);

  if (candidates.length < requiredCount) return null;

  let best = null;
  let bestCost = Infinity;

  function search(chosen, slotIdx) {
    if (Date.now() - started > CSP_TIMEOUT_MS) return;

    if (slotIdx === requiredCount) {
      if (!satisfiesConstraints(constraints, chosen)) return;
      const cost = chosen.reduce((sum, p) => sum + estimatePlayerCost(p), 0);
      if (cost < bestCost) {
        bestCost = cost;
        best = buildSolution(chosen, constraints);
      }
      return;
    }

    const usedIds = new Set(chosen.map((p) => p.id));
    const remainingSlots = requiredCount - slotIdx;

    const ordered = orderCandidatesForSlot(candidates, chosen, constraints, usedIds);

    for (const player of ordered) {
      if (usedIds.has(player.id)) continue;
      chosen.push(player);

      if (forwardCheck(constraints, chosen, requiredCount)) {
        search(chosen, slotIdx + 1);
      }

      chosen.pop();
      if (best && Date.now() - started > CSP_TIMEOUT_MS) return;
    }
  }

  search([], 0);
  return best;
}

function rankCandidates(pool, constraints) {
  return [...pool].sort((a, b) => {
    const costA = estimatePlayerCost(a);
    const costB = estimatePlayerCost(b);
    if (costA !== costB) return costA - costB;
    return (a.rating || 0) - (b.rating || 0);
  });
}

function orderCandidatesForSlot(candidates, chosen, constraints, usedIds) {
  return candidates
    .filter((p) => !usedIds.has(p.id))
    .map((p) => ({
      player: p,
      score: candidateScore(p, chosen, constraints),
    }))
    .sort((a, b) => a.score - b.score)
    .map((x) => x.player);
}

function candidateScore(player, chosen, constraints) {
  let score = estimatePlayerCost(player);
  const trial = [...chosen, player];

  if (constraints.minChemistry) {
    score -= calculateSquadChemistry(trial) * 2;
  }
  if (constraints.minTeamRating) {
    score -= calculateTeamRating(trial);
  }

  return score;
}

function forwardCheck(constraints, chosen, requiredCount) {
  if (constraints.minTeamRating) {
    const maxPossible = Math.round(
      (chosen.reduce((s, p) => s + p.rating, 0) + (requiredCount - chosen.length) * 99) /
        requiredCount
    );
    if (maxPossible < constraints.minTeamRating) return false;
  }

  if (constraints.minChemistry && chosen.length >= 3) {
    const maxChemPerPlayer = 3;
    const maxPossible =
      chosen.length * maxChemPerPlayer +
      (requiredCount - chosen.length) * maxChemPerPlayer;
    if (maxPossible < constraints.minChemistry && chosen.length === requiredCount) {
      return calculateSquadChemistry(chosen) >= constraints.minChemistry;
    }
  }

  for (const req of constraints.playerRequirements) {
    if (req.type === 'PLAYER_LEVEL' && req.ratingRange) {
      const matching = chosen.filter(
        (p) => p.rating >= req.ratingRange.min && p.rating <= req.ratingRange.max
      ).length;
      const maxCanAdd = requiredCount - chosen.length + matching;
      if (maxCanAdd < req.count) return false;
    }
  }

  return true;
}

function buildSolution(chosen, constraints) {
  const players = chosen.map((player, slot) => ({ slot, player }));
  return {
    players,
    teamRating: calculateTeamRating(chosen),
    chemistry: calculateSquadChemistry(chosen),
    estimatedValue: chosen.reduce((sum, p) => sum + estimatePlayerCost(p), 0),
    warnings: ['Solved with CSP engine'],
    constraints: {
      challengeId: constraints.challengeId,
      name: constraints.name,
      requiredCount: getRequiredPlayerCount(constraints),
    },
  };
}
