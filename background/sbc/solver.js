/**
 * SBC constraint solver — backtracking search with greedy seeding.
 */

import {
  parseSbcRequirements,
  applyUpgradeHeuristics,
  getRequiredPlayerCount,
} from './requirements-parser.js';
import {
  calculateSquadChemistry,
  calculateTeamRating,
  getPlayerNation,
  getPlayerLeague,
  getPlayerClub,
} from './chemistry-engine.js';
import { estimatePlayerCost } from './player-pool.js';

const SOLVER_TIMEOUT_MS = 15000;
const MAX_CANDIDATES = 120;

/**
 * @param {import('./types.js').SbcConstraints} constraints
 * @param {import('./types.js').ClubPlayer[]} pool
 * @param {Object} options
 * @returns {import('./types.js').SbcSolution|null}
 */
export function solveSbc(constraints, pool, options = {}) {
  const started = Date.now();
  const requiredCount = getRequiredPlayerCount(constraints);
  const candidates = rankCandidates(pool, constraints).slice(0, MAX_CANDIDATES);

  if (candidates.length < requiredCount) {
    return null;
  }

  let best = null;
  let bestCost = Infinity;

  function search(chosen, startIdx) {
    if (Date.now() - started > SOLVER_TIMEOUT_MS) return;

    if (chosen.length === requiredCount) {
      if (!satisfiesConstraints(constraints, chosen)) return;
      const cost = chosen.reduce((sum, p) => sum + estimatePlayerCost(p), 0);
      if (cost < bestCost) {
        bestCost = cost;
        best = buildSolution(chosen, constraints);
      }
      return;
    }

    const remaining = requiredCount - chosen.length;
    for (let i = startIdx; i <= candidates.length - remaining; i += 1) {
      const player = candidates[i];
      if (chosen.some((p) => p.id === player.id)) continue;
      chosen.push(player);
      // Prune early on hard constraints
      if (canPartiallySatisfy(constraints, chosen, requiredCount)) {
        search(chosen, i + 1);
      }
      chosen.pop();
      if (best && Date.now() - started > SOLVER_TIMEOUT_MS) return;
    }
  }

  search([], 0);
  return best;
}

/**
 * @param {Object} challengeData
 * @param {import('./types.js').ClubPlayer[]} pool
 * @param {Object} options
 */
export function solveFromChallengeData(challengeData, pool, options = {}) {
  let constraints = parseSbcRequirements(challengeData);
  constraints = applyUpgradeHeuristics(constraints, options.challengeName || constraints.name);
  return solveSbc(constraints, pool, options);
}

function rankCandidates(pool, constraints) {
  return [...pool].sort((a, b) => {
    const costA = estimatePlayerCost(a);
    const costB = estimatePlayerCost(b);
    if (costA !== costB) return costA - costB;
    return (a.rating || 0) - (b.rating || 0);
  });
}

function buildSolution(chosen, constraints) {
  const players = chosen.map((player, slot) => ({ slot, player }));
  const squad = chosen;
  return {
    players,
    teamRating: calculateTeamRating(squad),
    chemistry: calculateSquadChemistry(squad),
    estimatedValue: squad.reduce((sum, p) => sum + estimatePlayerCost(p), 0),
    warnings: [],
    constraints: {
      challengeId: constraints.challengeId,
      name: constraints.name,
      requiredCount: getRequiredPlayerCount(constraints),
    },
  };
}

function canPartiallySatisfy(constraints, chosen, requiredCount) {
  if (constraints.minTeamRating) {
    const avg = calculateTeamRating(chosen);
    const maxPossible = Math.round(
      (chosen.reduce((s, p) => s + p.rating, 0) + (requiredCount - chosen.length) * 99) /
        requiredCount
    );
    if (maxPossible < constraints.minTeamRating) return false;
    if (chosen.length === requiredCount && avg < constraints.minTeamRating) return false;
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

/**
 * @param {import('./types.js').SbcConstraints} constraints
 * @param {import('./types.js').ClubPlayer[]} squad
 */
export function satisfiesConstraints(constraints, squad) {
  const requiredCount = getRequiredPlayerCount(constraints);
  if (squad.length !== requiredCount) return false;

  if (constraints.minTeamRating && calculateTeamRating(squad) < constraints.minTeamRating) {
    return false;
  }

  if (constraints.minChemistry && calculateSquadChemistry(squad) < constraints.minChemistry) {
    return false;
  }

  for (const req of constraints.playerRequirements) {
    if (!checkRequirement(req, squad)) return false;
  }

  return true;
}

function checkRequirement(req, squad) {
  switch (req.type) {
    case 'PLAYER_LEVEL': {
      if (!req.ratingRange) return true;
      const count = squad.filter(
        (p) => p.rating >= req.ratingRange.min && p.rating <= req.ratingRange.max
      ).length;
      return count >= req.count;
    }
    case 'PLAYER_RARITY': {
      const count = squad.filter((p) => Number(p.rareflag) === Number(req.rarity)).length;
      return count >= req.count;
    }
    case 'SCOPE_COUNT': {
      const count = squad.filter((p) => matchesScope(p, req.scope, req.value)).length;
      return count >= req.count;
    }
    case 'SAME_LEAGUE_COUNT':
      return maxSameGroup(squad, getPlayerLeague) >= req.count;
    case 'SAME_NATION_COUNT':
      return maxSameGroup(squad, getPlayerNation) >= req.count;
    case 'SAME_CLUB_COUNT':
      return maxSameGroup(squad, getPlayerClub) >= req.count;
    case 'LEAGUE_COUNT':
    case 'NATION_COUNT':
    case 'CLUB_COUNT': {
      const getter =
        req.type === 'LEAGUE_COUNT'
          ? getPlayerLeague
          : req.type === 'NATION_COUNT'
            ? getPlayerNation
            : getPlayerClub;
      const unique = new Set(squad.map(getter));
      return unique.size >= (req.minUnique || 0);
    }
    default:
      return true;
  }
}

function matchesScope(player, scope, value) {
  switch (scope) {
    case 'nation':
      return getPlayerNation(player) === value;
    case 'league':
      return getPlayerLeague(player) === value;
    case 'club':
    case 'team':
      return getPlayerClub(player) === value;
    default:
      return true;
  }
}

function maxSameGroup(squad, getter) {
  const counts = new Map();
  for (const p of squad) {
    const key = getter(p);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Math.max(0, ...counts.values());
}

/**
 * Map solution to slot indices for EA PUT squad API.
 * Upgrade SBCs use slot 0 only; full squads fill 0..N-1.
 * @param {import('./types.js').SbcSolution} solution
 * @param {number} slotCount
 */
export function solutionToItemIds(solution, slotCount = 11) {
  const ids = new Array(slotCount).fill(0);
  for (const { slot, player } of solution.players) {
    const index = slot < slotCount ? slot : ids.findIndex((id) => id === 0);
    if (index >= 0) ids[index] = player.id;
  }
  return ids;
}
