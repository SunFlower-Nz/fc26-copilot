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
import {
  upgradeTierFromName,
  getBlockedButEligiblePlayers,
  UPGRADE_RATING,
  isSpecialOrPromoCard,
  getProtectionConfig,
} from './protected-players.js';

import { solveFromChallengeData, solveSbc, solutionToItemIds } from './solver.js';

import { extractEaValidation } from './chemistry-engine.js';

import { enrichPlayers } from '../player-catalog.js';

import { formatPosition } from '../../shared/positions.js';

import { validateAgainstEa } from './ea-validator.js';

import { resolveChallengeId } from './challenge-lookup.js';
import { ensureSbcChallengeOpen } from '../dom-bridge.js';
import { debugIngest } from '../../shared/debug-ingest.js';
import { invalidateClubSection } from '../cache/fut-cache.js';



function isNotFoundError(result) {
  if (!result || result.success) return false;
  const msg = String(result.error || '');
  return msg.includes('404') || result.status === 404;
}



async function openChallengeInWebApp(challengeId, options = {}) {
  const setId = options.setId ?? options.set_id;
  if (!setId || options.open_ui === false) {
    return { success: false, skipped: true };
  }

  return ensureSbcChallengeOpen({
    setId,
    challengeId,
    setName: options.setName ?? options.set_name,
    challengeName: options.challenge_name ?? options.challengeName,
  });
}

/**
 * Load challenge requirements from EA (direct challenge or set challenges fallback).
 * @param {string|number} challengeId
 * @param {Object} options
 */
async function loadChallengeData(challengeId, options = {}) {
  const reqResult = await safeEACall('getSBCRequirements', { sbcId: String(challengeId) });
  if (reqResult.success) {
    const data = reqResult.data?.challenge || reqResult.data;
    return {
      ...data,
      challengeId: data.challengeId ?? data.id ?? challengeId,
      setId: options.setId ?? data.setId,
      elgReq: data.elgReq || data.eligibilityRequirements || [],
      eligibilityRequirements: data.eligibilityRequirements || data.elgReq || [],
    };
  }

  if (options.setId) {
    const setResult = await safeEACall('getSBCSetChallenges', { setId: options.setId });
    if (setResult.success) {
      const challenges =
        setResult.data?.challenges ||
        setResult.data?.SBCChallengeResponse?.challenges ||
        (Array.isArray(setResult.data) ? setResult.data : []);
      const match =
        challenges.find(
          (c) => String(c.challengeId ?? c.id) === String(challengeId)
        ) || challenges[0];
      if (match) {
        return {
          ...match,
          challengeId: match.challengeId ?? match.id ?? challengeId,
          setId: options.setId,
          name: match.name || options.challenge_name,
        };
      }
    }
  }

  if (options.challenge_name) {
    return {
      challengeId,
      name: options.challenge_name,
      eligibilityRequirements: [],
      _heuristic: true,
    };
  }

  return null;
}



/**

 * @param {string|number} challengeId

 * @param {Object} options

 */

export async function previewSbcSolution(challengeId, options = {}) {

  await rateLimiter.throttle('sbc_read');



  const challengeName = options.challenge_name || '';

  const challengeData = await loadChallengeData(challengeId, {
    challenge_name: challengeName,
    setId: options.set_id ?? options.setId ?? null,
  });

  if (!challengeData) {
    return { success: false, error: 'Could not load SBC challenge requirements.' };
  }



  let constraints = parseSbcRequirements(challengeData);

  const hasEaRequirements = Boolean(
    challengeData?.elgReq?.length ||
      challengeData?.eligibilityRequirements?.length ||
      constraints.playerRequirements.length > 0
  );

  if (!hasEaRequirements && options.use_heuristics === true) {
    constraints = applyUpgradeHeuristics(
      constraints,
      challengeName || constraints.name
    );
  } else if (!hasEaRequirements) {
    return {
      success: false,
      error:
        'Requisitos do DME não disponíveis na EA. Abra o Web App, use analyze_sbcs, ou passe challenge_id após carregar o set.',
      data: { challengeId, challengeName: challengeName || constraints.name },
    };
  }



  const tier = upgradeTierFromName(challengeName || constraints.name);
  const levelReqs = constraints.playerRequirements.filter((r) => r.type === 'PLAYER_LEVEL');
  const reqLevel = levelReqs.length === 1 ? levelReqs[0].level : null;
  const effectiveTier = reqLevel || tier;
  const tierRange = effectiveTier ? UPGRADE_RATING[effectiveTier] : null;
  if (levelReqs.length === 1 && tier && reqLevel && reqLevel !== tier) {
    logger.info('SBC pool tier from EA requirements overrides challenge name', {
      challenge: constraints.name,
      nameTier: tier,
      reqLevel,
    });
  }
  const poolFilters = {
    ...(options.filters || {}),
    upgrade_tier: effectiveTier,
    fodder_only: options.allow_last_resort ? false : true,
  };

  const pool = await fetchPlayerPool({
    min_rating: options.min_rating ?? tierRange?.min ?? 45,
    max_rating: options.max_rating ?? tierRange?.max ?? 99,
    include_unassigned: options.include_unassigned !== false,
    filters: poolFilters,
    use_cache: options.use_cache !== false,
    force_refresh: options.force_refresh === true,
  });

  const rawPool = await fetchPlayerPool({
    min_rating: options.min_rating ?? tierRange?.min ?? 45,
    max_rating: options.max_rating ?? tierRange?.max ?? 99,
    include_unassigned: options.include_unassigned !== false,
    filters: { ...poolFilters, fodder_only: false },
    use_cache: options.use_cache !== false,
    force_refresh: false,
    _skipProtectionFilter: true,
  });

  let solution = solveSbc(constraints, pool, {
    challengeName: constraints.name,
  });

  if (!solution && !options.allow_last_resort) {
    const protection = await getProtectionConfig();
    const blocked = getBlockedButEligiblePlayers(
      rawPool,
      { min_rating: tierRange?.min, max_rating: tierRange?.max, upgrade_tier: tier, fodder_only: false },
      protection
    );

    if (blocked.length) {
      return {
        success: false,
        needsLastResortConfirmation: true,
        error:
          'Sem fodder padrão (bronze/prata/ouro comum/raro). Cartas especiais/titulares bloqueadas.',
        data: {
          challenge: constraints.name,
          challengeId: constraints.challengeId,
          blockedPlayers: blocked.slice(0, 8).map((p) => ({
            itemId: p.id,
            assetId: p.assetId,
            rating: p.rating,
            rareflag: p.rareflag,
            name: p.name || p._name,
            reason: isSpecialOrPromoCard(p) ? 'special/promo' : 'protected',
          })),
          hint: 'Se for a única opção, re-chame com allow_last_resort: true após confirmar.',
        },
      };
    }
  }

  if (!solution && options.allow_last_resort) {
    const relaxedPool = await fetchPlayerPool({
      min_rating: options.min_rating ?? tierRange?.min ?? 45,
      max_rating: options.max_rating ?? tierRange?.max ?? 99,
      include_unassigned: options.include_unassigned !== false,
      filters: { ...poolFilters, fodder_only: false },
      use_cache: options.use_cache !== false,
    });
    solution = solveSbc(constraints, relaxedPool, {
      challengeName: constraints.name,
    });
  }



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



  const preview = await formatPreview(solution, constraints, {
    lastResort: Boolean(options.allow_last_resort),
    fodderOnly: !options.allow_last_resort,
  });



  return {

    success: true,

    needsConfirmation: true,

    data: preview,

  };

}



/**

 * @param {string|number} challengeId

 * @param {number[]} itemIdsBySlot

 * @param {Object} options

 */

export async function applySbcSolution(challengeId, itemIdsBySlot, options = {}) {

  let uiNavigation = await openChallengeInWebApp(challengeId, options);

  const setId = options.setId ?? options.set_id;
  if (
    options.open_ui !== false
    && setId
    && !uiNavigation?.success
    && !uiNavigation?.skipped
  ) {
    return {
      success: false,
      error:
        `Não foi possível abrir o DME no Web App: ${uiNavigation?.error || 'Web App não pronto'}. Mantenha o Ultimate Team aberto na Home.`,
      data: { uiNavigation, challengeId },
    };
  }

  await rateLimiter.throttle('sbc_write');

  let putResult = await safeEACall('setSBCSquad', {

    challengeId: String(challengeId),

    itemIdsBySlot,

  });



  if (!putResult.success && isNotFoundError(putResult) && options.open_ui !== false) {
    uiNavigation = await openChallengeInWebApp(challengeId, options);
    if (uiNavigation.success) {
      await rateLimiter.throttle('sbc_write');
      putResult = await safeEACall('setSBCSquad', {
        challengeId: String(challengeId),
        itemIdsBySlot,
      });
    }
  }



  if (!putResult.success) {

    debugIngest('sbc-service.js:applySbcSolution', 'apply_fail', {
      challengeId,
      error: putResult.error,
      uiNavigation,
      setId: options.setId ?? options.set_id,
    }, 'H2,H3');

    return {
      ...putResult,
      data: {
        ...(putResult.data || {}),
        uiNavigation,
      },
    };

  }



  await rateLimiter.throttle('sbc_read');

  let squadResult = await safeEACall('getSBCSquad', { challengeId: String(challengeId) });

  if (!squadResult.success && isNotFoundError(squadResult) && options.open_ui !== false) {
    uiNavigation = await openChallengeInWebApp(challengeId, options);
    if (uiNavigation.success) {
      await rateLimiter.throttle('sbc_read');
      squadResult = await safeEACall('getSBCSquad', { challengeId: String(challengeId) });
    }
  }

  const eaValidation = squadResult.success

    ? extractEaValidation(squadResult.data)

    : extractEaValidation(putResult.data);



  let crossCheck = null;

  if (options.constraints && squadResult.success) {

    const squadPlayers = extractSquadPlayers(squadResult.data);

    crossCheck = validateAgainstEa(options.constraints, squadPlayers, eaValidation);

  }



  return {

    success: true,

    data: {

      applied: true,

      challengeId,

      itemIdsBySlot,

      validation: eaValidation,

      crossCheck,

      uiNavigation,

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

 * Full flow: solve → apply → optional submit (single run; no auto repeat).

 * @param {string|number|null} challengeId

 * @param {Object} options

 */

export async function completeSbc(challengeId, options = {}) {

  const resolved = await resolveChallengeId(challengeId, options.challenge_name);

  if (resolved.error) {

    return { success: false, error: resolved.error, matches: resolved.matches };

  }



  const id = resolved.challengeId;

  const setIdFromLookup = resolved.setId;



  const preview = await previewSbcSolution(id, {
    ...options,
    challenge_name: resolved.name || options.challenge_name,
    set_id: setIdFromLookup ?? options.set_id,
    force_refresh: options.refresh_pool === true || options.force_refresh === true,
  });

  if (!preview.success) return preview;



  if (!options.confirm) {
    return {
      success: false,
      needsConfirmation: true,
      error: 'Confirmation required. Re-call with confirm: true to apply and submit.',
      data: preview.data,
    };
  }

  if (preview.data?.needsLastResortConfirmation && !options.allow_last_resort) {
    return {
      success: false,
      needsLastResortConfirmation: true,
      error: 'Solution uses a blocked card. Set allow_last_resort: true after confirming.',
      data: preview.data,
    };
  }



  const itemIds = previewToItemIds(preview.data);



  const reqResult = await loadChallengeData(id, {
    challenge_name: options.challenge_name || preview.data.challenge,
    setId: setIdFromLookup ?? options.set_id,
  });
  const constraints = reqResult ? parseSbcRequirements(reqResult) : null;



  const applyResult = await applySbcSolution(id, itemIds, {
    constraints,
    setId: setIdFromLookup ?? options.set_id,
    set_id: setIdFromLookup ?? options.set_id,
    challenge_name: options.challenge_name || preview.data.challenge,
    open_ui: options.open_ui,
  });

  if (!applyResult.success) return applyResult;



  if (applyResult.data.crossCheck && !applyResult.data.crossCheck.valid) {

    return {

      success: false,

      error: 'EA validation failed after applying squad.',

      data: {

        preview: preview.data,

        applied: true,

        validation: applyResult.data.validation,

        crossCheck: applyResult.data.crossCheck,

      },

    };

  }



  if (options.apply_only) {

    return {

      success: true,

      data: {

        ...preview.data,

        applied: true,

        submitted: false,

        validation: applyResult.data.validation,

        crossCheck: applyResult.data.crossCheck,

      },

    };

  }



  const setId = options.set_id ?? setIdFromLookup ?? preview.data.setId ?? null;

  const submitResult = await submitSbcChallenge(id, setId);

  if (!submitResult.success) {

    return {

      success: false,

      error: submitResult.error,

      data: {

        preview: preview.data,

        applied: true,

        submitted: false,

        crossCheck: applyResult.data.crossCheck,

      },

    };

  }



  await invalidateClubSection();

  return {

    success: true,

    data: {

      preview: preview.data,

      applied: true,

      submitted: true,

      validation: applyResult.data.validation,

      crossCheck: applyResult.data.crossCheck,

      reward: submitResult.data,

    },

  };

}



async function formatPreview(solution, constraints, meta = {}) {
  const enriched = await enrichPlayers(solution.players.map((p) => p.player));

  const warnings = [...(solution.warnings || [])];
  if (meta.fodderOnly) {
    warnings.push('Apenas bronze/prata/ouro padrão (rareflag 0–1). Promos/Future Stars bloqueados.');
  }
  if (meta.lastResort) {
    warnings.push('LAST_RESORT: carta fora da regra padrão — você confirmou allow_last_resort.');
  }

  const players = solution.players.map(({ slot, player }, index) => {
    const e = enriched[index] || player;
    const pos = e.preferredPosition || e.position || player.preferredPosition;
    const special = isSpecialOrPromoCard(player);
    return {
      slot,
      itemId: player.id,
      assetId: player.assetId,
      rating: player.rating,
      untradeable: player.untradeable,
      rareflag: player.rareflag,
      nation: player.nation,
      leagueId: player.leagueId,
      teamid: player.teamid,
      name: e.name || e._name || null,
      position: formatPosition(pos),
      positionCode: pos || null,
      isSpecial: special,
    };
  });

  return {
    challenge: constraints.name,
    challengeId: constraints.challengeId,
    setId: constraints.setId,
    players,
    teamRating: solution.teamRating,
    chemistry: solution.chemistry,
    estimatedValue: solution.estimatedValue,
    slotCount: constraints.squadSize || solution.players.length,
    warnings,
    solver: solution.warnings?.includes('Solved with CSP engine') ? 'csp' : 'backtrack',
    needsConfirmation: true,
    needsLastResortConfirmation: Boolean(meta.lastResort),
    fodderOnly: meta.fodderOnly !== false,
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



function extractSquadPlayers(squadResponse) {

  const slots = squadResponse?.squad?.players || squadResponse?.players || [];

  return slots

    .map((slot) => slot?.itemData || slot)

    .filter((p) => p?.id && p.rating)

    .map((item) => ({

      id: item.id,

      rating: item.rating,

      nation: item.nation ?? item.nationId,

      leagueId: item.leagueId,

      teamid: item.teamid ?? item.teamId,

      rareflag: item.rareflag ?? 0,

      untradeable: item.untradeable,

    }));

}



export { resolveChallengeId };


