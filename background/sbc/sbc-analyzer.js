/**
 * Analyze all SBCs against club pool — feasibility + cost-benefit from EA requirements.
 */

import { parseSbcRequirements, getRequiredPlayerCount } from './requirements-parser.js';
import { summarizeConstraints, inferFodderTier } from './requirements-summary.js';
import { estimateRewards } from './reward-estimator.js';
import { loadAllSbcChallenges, enrichChallengeRequirements } from './sbc-catalog.js';
import { fetchPlayerPool, estimatePlayerCost } from './player-pool.js';
import { solveSbc } from './solver.js';

/**
 * @param {import('./types.js').ClubPlayer[]} pool
 * @param {import('./types.js').SbcConstraints} constraints
 */
export function quickFeasibilityCheck(pool, constraints) {
  const required = getRequiredPlayerCount(constraints);
  const issues = [];
  let feasible = true;

  if (pool.length < required) {
    feasible = false;
    issues.push(`Pool insuficiente: ${pool.length} cartas vs ${required} necessárias`);
  }

  for (const req of constraints.playerRequirements) {
    if (req.type === 'PLAYER_LEVEL' && req.ratingRange) {
      const matching = pool.filter(
        (p) => p.rating >= req.ratingRange.min && p.rating <= req.ratingRange.max
      );
      if (matching.length < req.count) {
        feasible = false;
        issues.push(
          `Faltam ${req.count - matching.length} cartas ${req.level} (${req.ratingRange.min}-${req.ratingRange.max})`
        );
      }
    }
  }

  if (constraints.minTeamRating) {
    const sorted = [...pool].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    const top = sorted.slice(0, required);
    if (top.length < required) {
      feasible = false;
    } else {
      const avg = Math.round(top.reduce((s, p) => s + p.rating, 0) / required);
      if (avg < constraints.minTeamRating) {
        feasible = false;
        issues.push(`OVR máximo estimado ${avg} < ${constraints.minTeamRating}`);
      }
    }
  }

  return { feasible, issues, requiredCount: required };
}

/**
 * Cheapest estimated fodder cost without full solver.
 * @param {import('./types.js').ClubPlayer[]} pool
 * @param {import('./types.js').SbcConstraints} constraints
 */
export function estimateCheapestCost(pool, constraints) {
  const required = getRequiredPlayerCount(constraints);
  let candidates = [...pool];

  for (const req of constraints.playerRequirements) {
    if (req.type === 'PLAYER_LEVEL' && req.ratingRange) {
      const tier = candidates.filter(
        (p) => p.rating >= req.ratingRange.min && p.rating <= req.ratingRange.max
      );
      if (tier.length >= req.count) {
        candidates = tier;
      }
    }
  }

  const tier = inferFodderTier(constraints);
  if (tier === 'bronze') {
    candidates = candidates.filter((p) => p.rating >= 45 && p.rating <= 64);
  } else if (tier === 'silver') {
    candidates = candidates.filter((p) => p.rating >= 65 && p.rating <= 74);
  } else if (tier === 'gold') {
    candidates = candidates.filter((p) => p.rating >= 75 && p.rating <= 82);
  }

  candidates.sort((a, b) => estimatePlayerCost(a) - estimatePlayerCost(b));

  if (candidates.length < required) {
    return { estimatedCost: null, canEstimate: false };
  }

  const chosen = candidates.slice(0, required);
  return {
    estimatedCost: chosen.reduce((sum, p) => sum + estimatePlayerCost(p), 0),
    canEstimate: true,
    avgRating: Math.round(chosen.reduce((s, p) => s + p.rating, 0) / chosen.length),
  };
}

/**
 * @param {Object} entry
 * @param {import('./types.js').ClubPlayer[]} pool
 * @param {Object} options
 */
export function analyzeChallengeEntry(entry, pool, options = {}) {
  const challengeData = {
    ...(entry.rawRequirements || {}),
    challengeId: entry.challengeId,
    setId: entry.setId,
    name: entry.name || entry.setName,
    elgReq: entry.elgReq || entry.rawRequirements?.elgReq || [],
    eligibilityRequirements:
      entry.rawRequirements?.eligibilityRequirements || entry.elgReq || [],
    squadSize: entry.squadSize ?? entry.rawRequirements?.squadSize,
    formation: entry.formation ?? entry.rawRequirements?.formation,
    awards: entry.awards || entry.rawRequirements?.awards || [],
    repeatable: entry.repeatable,
    status: entry.status,
  };

  const constraints = parseSbcRequirements(challengeData);
  constraints.setId = entry.setId;
  constraints.name = entry.name || entry.setName || constraints.name;

  const completed =
    entry.status === 'COMPLETED' ||
    constraints.eligibility?.completed ||
    entry.raw?.status === 'COMPLETED';

  const summary = summarizeConstraints(constraints);
  const rewards = estimateRewards(challengeData);
  const quick = quickFeasibilityCheck(pool, constraints);
  const costEst = estimateCheapestCost(pool, constraints);

  let solution = null;
  let solveStatus = 'not_attempted';

  if (!completed && quick.feasible && options.try_solve) {
    solution = solveSbc(constraints, pool, options);
    solveStatus = solution ? 'solved' : 'failed';
  }

  const estimatedCost = solution
    ? solution.estimatedValue
    : costEst.canEstimate
      ? costEst.estimatedCost
      : null;

  const estimatedBenefit = rewards.totalValue;
  const netValue =
    estimatedCost != null && estimatedBenefit > 0
      ? estimatedBenefit - normalizeCostForScore(estimatedCost)
      : null;

  const score = computeScore({
    completed,
    feasible: quick.feasible,
    solved: Boolean(solution),
    netValue,
    estimatedBenefit,
    estimatedCost,
    repeatable: constraints.eligibility?.repeatable || entry.repeatable,
    requiredCount: quick.requiredCount,
  });

  return {
    challengeId: entry.challengeId,
    setId: entry.setId,
    name: entry.name || entry.setName,
    setName: entry.setName,
    category: entry.category,
    completed,
    repeatable: Boolean(constraints.eligibility?.repeatable || entry.repeatable),
    requirementsSource: entry.requirementsSource || 'unknown',
    requirementsSummary: summary,
    constraints: {
      squadSize: constraints.squadSize,
      requiredPlayers: quick.requiredCount,
      minTeamRating: constraints.minTeamRating,
      minChemistry: constraints.minChemistry,
    },
    rewards: rewards.items,
    estimatedBenefit,
    estimatedCost,
    netValue,
    feasibility: {
      quickCheck: quick.feasible,
      issues: quick.issues,
      solveStatus,
      solutionFound: Boolean(solution),
    },
    score,
    recommendation: buildRecommendation(score, completed, quick.feasible, solution, netValue),
  };
}

function normalizeCostForScore(rawCost) {
  // estimatePlayerCost uses tier offsets — strip to comparable scale
  return rawCost % 10_000_000 || rawCost;
}

function computeScore(ctx) {
  if (ctx.completed) return -1;

  let score = 0;

  if (ctx.solved) score += 50;
  else if (ctx.feasible) score += 25;
  else score -= 20;

  if (ctx.netValue != null) {
    score += Math.min(40, Math.round(ctx.netValue / 500));
  }

  if (ctx.repeatable) score += 15;

  if (ctx.requiredCount <= 5) score += 10;
  else if (ctx.requiredCount === 11) score += 5;

  if (ctx.estimatedBenefit > 0 && ctx.estimatedCost != null) {
    const ratio = ctx.estimatedBenefit / Math.max(normalizeCostForScore(ctx.estimatedCost), 1);
    if (ratio >= 3) score += 20;
    else if (ratio >= 1.5) score += 10;
  }

  return Math.round(score);
}

function buildRecommendation(score, completed, feasible, solution, netValue) {
  if (completed) return 'já_completo';
  if (solution && netValue != null && netValue > 2000) return 'excelente';
  if (solution || (feasible && score >= 40)) return 'recomendado';
  if (feasible) return 'viável';
  return 'difícil';
}

/**
 * @param {Object} options
 */
export async function analyzeAllSbcs(options = {}) {
  const {
    category = null,
    daily_only = false,
    max_sets = 40,
    enrich_requirements = true,
    try_solve = true,
    top_n = 15,
    include_completed = false,
    force_refresh = false,
    use_cache = true,
    use_futbin_prices = false,
    platform = 'pc',
  } = options;

  const entries = await loadAllSbcChallenges({
    force_refresh,
    category,
    daily_only,
    max_sets,
  });

  const enriched = [];
  for (const entry of entries) {
    if (enrich_requirements) {
      enriched.push(await enrichChallengeRequirements(entry));
    } else {
      enriched.push(entry);
    }
  }

  const pool = await fetchPlayerPool({
    min_rating: 45,
    max_rating: 99,
    include_unassigned: true,
    include_sbc_storage: true,
    use_cache,
    force_refresh: options.force_refresh_pool === true,
  });

  if (use_futbin_prices) {
    const { fetchFutbinPrices, resolveMarketValue } = await import('../analytics/futbin-batch.js');
    const assetIds = pool.filter((p) => !p.untradeable && p.assetId).map((p) => p.assetId);
    const prices = await fetchFutbinPrices(assetIds, platform);
    for (const p of pool) {
      p.marketAverage = resolveMarketValue(p, prices);
    }
  }

  const poolStats = {
    total: pool.length,
    bronze: pool.filter((p) => p.rating >= 45 && p.rating <= 64).length,
    silver: pool.filter((p) => p.rating >= 65 && p.rating <= 74).length,
    goldCommon: pool.filter((p) => p.rating >= 75 && p.rating <= 82).length,
    goldRare: pool.filter((p) => p.rating >= 83 && p.rating <= 86).length,
    special: pool.filter((p) => p.rating >= 87).length,
    sbcStorage: pool.filter((p) => p.inSbcStorage).length,
    untradeable: pool.filter((p) => p.untradeable).length,
    tradeable: pool.filter((p) => !p.untradeable).length,
  };

  const analyzed = [];
  for (const entry of enriched) {
    const result = analyzeChallengeEntry(entry, pool, { try_solve });
    if (!include_completed && result.completed) continue;
    analyzed.push(result);
  }

  analyzed.sort((a, b) => b.score - a.score);

  const top = analyzed.slice(0, top_n);
  const recommended = analyzed.filter((a) =>
    ['excelente', 'recomendado'].includes(a.recommendation)
  );
  const feasible = analyzed.filter((a) => a.feasibility.quickCheck && !a.completed);

  return {
    success: true,
    meta: {
      totalSetsScanned: max_sets,
      totalChallenges: entries.length,
      analyzed: analyzed.length,
      poolStats,
      mode: 'requirements_driven',
      futbinPricing: use_futbin_prices,
      note: 'Requisitos lidos da EA (elgReq). Sem heurística por nome de upgrade.',
    },
    bestValue: top,
    recommended,
    feasibleCount: feasible.length,
    all: options.include_all ? analyzed : undefined,
  };
}

/**
 * Validate solution export for tests.
 */
export function analyzeWithConstraints(constraints, pool, challengeData = {}) {
  const entry = {
    challengeId: String(constraints.challengeId || '0'),
    setId: constraints.setId,
    name: constraints.name,
    setName: constraints.name,
    category: 'test',
    elgReq: [],
    rawRequirements: challengeData,
    requirementsSource: 'test',
  };
  return analyzeChallengeEntry(entry, pool, { try_solve: true });
}
