/**
 * Cross-check local solver output with EA squad validation response.
 */

import { calculateSquadChemistry, calculateTeamRating } from './chemistry-engine.js';
import { satisfiesConstraints } from './solver.js';
import { getRequiredPlayerCount } from './requirements-parser.js';

/**
 * @param {import('./types.js').SbcConstraints} constraints
 * @param {import('./types.js').ClubPlayer[]} squadPlayers
 * @param {Object} eaValidation from extractEaValidation()
 */
export function validateAgainstEa(constraints, squadPlayers, eaValidation) {
  const issues = [];
  const localRating = calculateTeamRating(squadPlayers);
  const localChemistry = calculateSquadChemistry(squadPlayers);
  const localOk = satisfiesConstraints(constraints, squadPlayers);

  if (!localOk) {
    const required = getRequiredPlayerCount(constraints);
    const eaSaysValid = eaValidation.valid !== false;
    const trustEa =
      eaSaysValid &&
      squadPlayers.length > 0 &&
      (required <= 1 || squadPlayers.length <= required);
    if (!trustEa) {
      issues.push('Solução local não atende todos os requisitos parseados.');
    }
  }

  if (constraints.minTeamRating) {
    const eaRating = eaValidation.teamRating;
    if (eaRating !== null && eaRating < constraints.minTeamRating) {
      issues.push(
        `Rating EA (${eaRating}) abaixo do mínimo (${constraints.minTeamRating}). Local: ${localRating}.`
      );
    }
  }

  if (constraints.minChemistry) {
    const eaChem = eaValidation.chemistry;
    if (eaChem !== null && eaChem < constraints.minChemistry) {
      issues.push(
        `Química EA (${eaChem}) abaixo do mínimo (${constraints.minChemistry}). Local: ${localChemistry}.`
      );
    }
  }

  if (eaValidation.valid === false) {
    issues.push('EA marcou o elenco como inválido (squadValid/status).');
  }

  const eaChallengeStatus = eaValidation.raw?.challenge?.status ?? eaValidation.raw?.status;
  if (eaChallengeStatus === 'INVALID' || eaChallengeStatus === 'NOT_VALID') {
    issues.push(`Status do desafio EA: ${eaChallengeStatus}`);
  }

  return {
    valid: issues.length === 0,
    issues,
    local: {
      teamRating: localRating,
      chemistry: localChemistry,
      constraintsOk: localOk,
    },
    ea: {
      teamRating: eaValidation.teamRating,
      chemistry: eaValidation.chemistry,
      valid: eaValidation.valid,
    },
  };
}

/**
 * Merge EA GET squad response into validation payload for preview.
 * @param {Object} squadResponse
 */
export function buildEaValidationReport(squadResponse) {
  const squad = squadResponse?.squad || squadResponse;
  const players = squad?.players || squadResponse?.players || [];

  const itemIds = players
    .map((p) => p?.itemData?.id || p?.id || 0)
    .filter(Boolean);

  return {
    playerCount: itemIds.length,
    itemIds,
    rating: squad?.rating ?? squad?.squadRating ?? null,
    chemistry: squad?.chemistry ?? squad?.squadChemistry ?? null,
    valid: squadResponse?.squadValid !== false && squadResponse?.status !== 'INVALID',
  };
}
