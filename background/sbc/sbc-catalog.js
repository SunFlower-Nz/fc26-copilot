/**
 * Load all active SBC sets and challenges from EA (no name-based heuristics).
 */

import { safeEACall } from '../ea-call.js';
import { getCache, updateCache } from '../cache/fut-cache.js';
import { rateLimiter } from '../rate-limiter.js';

export function flattenSbcSets(data) {
  const out = [];
  const categories = data?.categories || data?.SBCSetResponse?.SBCSets || [];

  for (const cat of categories) {
    for (const set of cat.sets || []) {
      out.push({
        setId: set.setId ?? set.id,
        name: set.name || set.description || 'SBC',
        category: cat.name || cat.categoryName || 'Outros',
        challengesCount: set.challengesCount ?? set.challenges?.length ?? 1,
        repeatable: Boolean(set.repeatable),
        endTime: set.endTime ?? null,
        raw: set,
      });
    }
  }

  return out.filter((s) => s.setId != null);
}

export async function loadSbcSets(forceRefresh = false) {
  if (!forceRefresh) {
    const cache = await getCache();
    const cached = flattenSbcSets(cache?.activeSbcs);
    if (cached.length) return cached;
  }

  await rateLimiter.throttle('sbc_read');
  const result = await safeEACall('getSBCSets', {});
  if (!result.success) return [];

  await updateCache({ activeSbcs: result.data });
  return flattenSbcSets(result.data);
}

function extractChallenges(setResult) {
  return (
    setResult?.challenges ||
    setResult?.SBCChallengeResponse?.challenges ||
    (Array.isArray(setResult) ? setResult : [])
  );
}

/**
 * @param {Object} options
 * @param {boolean} [options.force_refresh]
 * @param {string|null} [options.category] - filter by category name (partial match)
 * @param {number} [options.max_sets]
 */
export async function loadAllSbcChallenges(options = {}) {
  const sets = await loadSbcSets(options.force_refresh === true);
  const categoryFilter = (options.category || '').toLowerCase().trim();
  const dailyOnly = options.daily_only === true;
  const maxSets = options.max_sets ?? sets.length;

  const filteredSets = sets
    .filter((s) => !categoryFilter || (s.category || '').toLowerCase().includes(categoryFilter))
    .filter((s) => {
      if (!dailyOnly) return true;
      const n = (s.name || '').toLowerCase();
      return n.includes('daily') || n.includes('diári') || n.includes('diario');
    })
    .slice(0, maxSets);

  const challenges = [];

  for (const set of filteredSets) {
    await rateLimiter.throttle('sbc_read');
    const result = await safeEACall('getSBCSetChallenges', { setId: set.setId });

    let setChallenges = [];
    if (result.success) {
      setChallenges = extractChallenges(result.data);
    }

    if (!setChallenges.length && (set.challengesCount ?? 1) === 1) {
      setChallenges = [{ challengeId: set.setId, name: set.name, setId: set.setId }];
    }

    for (const ch of setChallenges) {
      const challengeId = ch.challengeId ?? ch.id ?? set.setId;
      challenges.push({
        challengeId: String(challengeId),
        setId: set.setId,
        setName: set.name,
        category: set.category,
        name: ch.name || set.name,
        repeatable: Boolean(ch.repeatable ?? set.repeatable),
        endTime: ch.endTime ?? set.endTime ?? null,
        status: ch.status ?? ch.challengeStatus ?? null,
        awards: ch.awards || ch.rewards || set.raw?.awards || [],
        elgReq: ch.elgReq || ch.eligibilityRequirements || [],
        squadSize: ch.squadSize,
        formation: ch.formation,
        raw: ch,
      });
    }
  }

  return challenges;
}

/**
 * Enrich a challenge with full requirements from GET /sbs/challenge/{id}
 * @param {Object} entry - from loadAllSbcChallenges
 */
export async function enrichChallengeRequirements(entry) {
  await rateLimiter.throttle('sbc_read');
  const result = await safeEACall('getSBCRequirements', { sbcId: entry.challengeId });
  if (result.success) {
    const data = result.data?.challenge || result.data;
    return {
      ...entry,
      elgReq: data?.elgReq || data?.eligibilityRequirements || entry.elgReq || [],
      awards: data?.awards || data?.rewards || entry.awards || [],
      squadSize: data?.squadSize ?? entry.squadSize,
      formation: data?.formation ?? entry.formation,
      status: data?.status ?? entry.status,
      repeatable: Boolean(data?.repeatable ?? entry.repeatable),
      requirementsSource: 'ea_challenge',
      rawRequirements: data || result.data,
    };
  }

  return {
    ...entry,
    requirementsSource: entry.elgReq?.length ? 'set_challenges' : 'incomplete',
  };
}
