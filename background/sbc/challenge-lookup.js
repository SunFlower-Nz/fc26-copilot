/**

 * Resolve SBC challenge by human-readable name (optional; ID remains primary).

 */



import { safeEACall } from '../ea-call.js';

import { getCache, updateCache } from '../cache/fut-cache.js';



/**

 * @param {string} nameQuery

 * @param {Object} options

 */

export async function findChallengeByName(nameQuery, options = {}) {

  const query = (nameQuery || '').toLowerCase().trim();

  if (!query) return null;



  const sets = await loadSbcSets(options.force_refresh);

  if (!sets.length) return null;



  const exactSets = sets.filter((s) => s.name.toLowerCase() === query);

  const partialSets =

    exactSets.length > 0

      ? exactSets

      : sets.filter((s) => s.name.toLowerCase().includes(query));



  if (!partialSets.length) return null;



  if (partialSets.length > 1 && !exactSets.length) {

    return {

      ambiguous: true,

      matches: partialSets.map((s) => ({

        setId: s.setId,

        name: s.name,

        challengeId: s.challengeId || null,

      })),

    };

  }



  const set = partialSets[0];

  const challenge = await resolveChallengeForSet(set);

  if (!challenge) return null;



  return {

    challengeId: challenge.challengeId,

    setId: set.setId,

    name: set.name,

  };

}



async function loadSbcSets(forceRefresh = false) {

  if (!forceRefresh) {

    const cache = await getCache();

    const cached = flattenSets(cache?.activeSbcs);

    if (cached.length) return cached;

  }



  const result = await safeEACall('getSBCSets', {});

  if (!result.success) return [];



  await updateCache({ activeSbcs: result.data });

  return flattenSets(result.data);

}



function flattenSets(data) {

  const out = [];

  const categories = data?.categories || data?.SBCSetResponse?.SBCSets || [];



  for (const cat of categories) {

    for (const set of cat.sets || []) {

      out.push({

        setId: set.setId ?? set.id,

        name: set.name || set.description || 'SBC',

        category: cat.name,

        challengesCount: set.challengesCount ?? 1,

      });

    }

  }



  return out.filter((s) => s.setId);

}



async function resolveChallengeForSet(set) {

  const result = await safeEACall('getSBCSetChallenges', { setId: set.setId });

  if (result.success) {

    const challenges =

      result.data?.challenges ||

      result.data?.SBCChallengeResponse?.challenges ||

      (Array.isArray(result.data) ? result.data : []);



    const first = challenges[0];

    if (first) {

      return {

        challengeId: String(first.challengeId ?? first.id),

        name: first.name || set.name,

      };

    }

  }



  if ((set.challengesCount ?? 1) === 1) {

    return {

      challengeId: String(set.setId),

      name: set.name,

    };

  }



  return null;

}



/**

 * @param {string|number|null} challengeId

 * @param {string|null} challengeName

 */

export async function resolveChallengeId(challengeId, challengeName) {

  if (challengeId) return { challengeId: String(challengeId), setId: null };



  if (!challengeName) {

    return { error: 'Provide challenge_id or challenge_name' };

  }



  const found = await findChallengeByName(challengeName);

  if (!found) {

    return { error: `No SBC found matching "${challengeName}"` };

  }

  if (found.ambiguous) {

    return { error: 'Multiple SBCs match name', matches: found.matches };

  }



  return {

    challengeId: found.challengeId,

    setId: found.setId,

    name: found.name,

  };

}


