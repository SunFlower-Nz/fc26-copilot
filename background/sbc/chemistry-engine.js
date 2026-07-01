/**
 * FC26 chemistry and squad rating calculations (approximation).
 * EA PUT/GET validation is used as the source of truth when available.
 */

const STORAGE_KEY = 'fc26_sbc_config';

/**
 * @param {import('./types.js').ClubPlayer} player
 */
export function getPlayerNation(player) {
  return player.nation ?? player.nationId ?? 0;
}

/**
 * @param {import('./types.js').ClubPlayer} player
 */
export function getPlayerLeague(player) {
  return player.leagueId ?? player.league ?? 0;
}

/**
 * @param {import('./types.js').ClubPlayer} player
 */
export function getPlayerClub(player) {
  return player.teamid ?? player.teamId ?? player.club ?? 0;
}

/**
 * FC26-style chemistry link: count matching players for nation/league/club.
 * @param {import('./types.js').ClubPlayer[]} players
 */
export function calculateSquadChemistry(players) {
  if (!players.length) return 0;

  let total = 0;
  for (const player of players) {
    total += calculatePlayerChemistry(player, players);
  }
  return total;
}

/**
 * @param {import('./types.js').ClubPlayer} player
 * @param {import('./types.js').ClubPlayer[]} squad
 */
export function calculatePlayerChemistry(player, squad) {
  const nation = getPlayerNation(player);
  const league = getPlayerLeague(player);
  const club = getPlayerClub(player);

  let chem = 0;

  const nationCount = squad.filter((p) => getPlayerNation(p) === nation).length;
  const leagueCount = squad.filter((p) => getPlayerLeague(p) === league).length;
  const clubCount = squad.filter((p) => getPlayerClub(p) === club).length;

  // Simplified FC chemistry thresholds (2/4/7 players for +1/+2/+3 style links)
  chem += chemistryFromCount(nationCount);
  chem += chemistryFromCount(leagueCount);
  chem += chemistryFromCount(clubCount);

  return Math.min(3, chem);
}

function chemistryFromCount(count) {
  if (count >= 7) return 3;
  if (count >= 4) return 2;
  if (count >= 2) return 1;
  return 0;
}

/**
 * EA squad rating: rounded average of starting players.
 * @param {import('./types.js').ClubPlayer[]} players
 */
export function calculateTeamRating(players) {
  if (!players.length) return 0;
  const sum = players.reduce((acc, p) => acc + (p.rating || 0), 0);
  return Math.round(sum / players.length);
}

/**
 * Extract validation hints from EA challenge/squad response after PUT.
 * @param {Object} eaResponse
 */
export function extractEaValidation(eaResponse) {
  const squad = eaResponse?.squad || eaResponse;
  const rating = squad?.rating ?? squad?.squadRating ?? eaResponse?.squadRating ?? null;
  const chemistry = squad?.chemistry ?? squad?.squadChemistry ?? eaResponse?.chemistry ?? null;
  const valid = eaResponse?.status !== 'INVALID' && eaResponse?.squadValid !== false;

  return {
    teamRating: rating !== null ? Number(rating) : null,
    chemistry: chemistry !== null ? Number(chemistry) : null,
    valid,
    raw: eaResponse,
  };
}

export { STORAGE_KEY };
