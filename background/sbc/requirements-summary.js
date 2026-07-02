/**
 * Human-readable summaries of parsed SBC constraints (from EA elgReq).
 */

import { getRequiredPlayerCount } from './requirements-parser.js';

const LEVEL_LABELS = {
  bronze: 'bronze',
  silver: 'prata',
  gold: 'ouro',
  special: 'especial',
};

/**
 * @param {import('./types.js').SbcConstraints} constraints
 * @returns {string[]}
 */
export function summarizeConstraints(constraints) {
  const lines = [];
  const required = getRequiredPlayerCount(constraints);

  if (required) {
    lines.push(`Jogadores no elenco: ${required}`);
  }

  if (constraints.minTeamRating) {
    lines.push(`Overall do time: mín. ${constraints.minTeamRating}`);
  }

  if (constraints.minChemistry) {
    lines.push(`Química: mín. ${constraints.minChemistry}`);
  }

  for (const req of constraints.playerRequirements) {
    switch (req.type) {
      case 'PLAYER_LEVEL': {
        const label = LEVEL_LABELS[req.level] || req.level || 'nível';
        const exact = req.count >= required ? 'exatamente' : 'mín.';
        lines.push(
          `Qualidade: ${exact} ${req.count} ${label}${req.count > 1 ? 's' : ''} (${req.ratingRange?.min ?? '?'}-${req.ratingRange?.max ?? '?'})`
        );
        break;
      }
      case 'PLAYER_RARITY':
        lines.push(`Raridade ${req.rarity}: mín. ${req.count}`);
        break;
      case 'SCOPE_COUNT':
        lines.push(`${req.scope} ${req.value}: mín. ${req.count}`);
        break;
      case 'SAME_LEAGUE_COUNT':
        lines.push(`Mesma liga: mín. ${req.count}`);
        break;
      case 'SAME_NATION_COUNT':
        lines.push(`Mesma nação: mín. ${req.count}`);
        break;
      case 'SAME_CLUB_COUNT':
        lines.push(`Mesmo clube: mín. ${req.count}`);
        break;
      case 'LEAGUE_COUNT':
        lines.push(`Ligas distintas: mín. ${req.minUnique}`);
        break;
      case 'NATION_COUNT':
        lines.push(`Nações distintas: mín. ${req.minUnique}`);
        break;
      case 'CLUB_COUNT':
        lines.push(`Clubes distintos: mín. ${req.minUnique}`);
        break;
      default:
        if (req.type && req.type !== 'UNKNOWN') {
          lines.push(`${req.type}${req.count ? `: ${req.count}` : ''}`);
        }
        break;
    }
  }

  if (constraints.eligibility?.repeatable) {
    lines.push('Repetível');
  }

  return lines;
}

/**
 * @param {import('./types.js').SbcConstraints} constraints
 */
export function inferFodderTier(constraints) {
  const levelReqs = constraints.playerRequirements.filter((r) => r.type === 'PLAYER_LEVEL');
  if (levelReqs.length === 1 && levelReqs[0].level) {
    return levelReqs[0].level;
  }
  if (constraints.minTeamRating) {
    if (constraints.minTeamRating <= 64) return 'bronze';
    if (constraints.minTeamRating <= 74) return 'silver';
    if (constraints.minTeamRating <= 84) return 'gold';
    return 'high';
  }
  const required = getRequiredPlayerCount(constraints);
  if (required === 1) return null;
  return null;
}
