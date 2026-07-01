/**
 * Build candidate player pool from club + unassigned piles.
 */

import { safeEACall } from '../ea-call.js';
import { filterPlayerPool, getProtectionConfig } from './protected-players.js';

/**
 * Normalize raw EA item to ClubPlayer shape.
 * @param {Object} item
 */
export function normalizeClubPlayer(item) {
  return {
    id: item.id,
    assetId: item.assetId,
    rating: item.rating,
    nation: item.nation ?? item.nationId,
    leagueId: item.leagueId,
    teamid: item.teamid ?? item.teamId,
    untradeable: Boolean(item.untradeable),
    rareflag: item.rareflag ?? item.rareFlag ?? 0,
    preferredPosition: item.preferredPosition,
    _name: item._name || item.name || null,
    pile: item.pile || 'club',
    duplicateId: item.duplicateId,
    resourceId: item.resourceId,
  };
}

/**
 * @param {Object} options
 * @returns {Promise<import('./types.js').ClubPlayer[]>}
 */
export async function fetchPlayerPool(options = {}) {
  const {
    min_rating = 45,
    max_rating = 99,
    include_unassigned = true,
    filters = {},
  } = options;

  const protection = await getProtectionConfig();

  const clubResult = await safeEACall('getClubPlayers', {
    min_rating,
    max_rating,
    count: 91,
    max_total: 1000,
    sort: 'asc',
  });

  const players = [];
  if (clubResult.success) {
    const items = clubResult.data?.itemData || [];
    players.push(...items.map((item) => ({ ...normalizeClubPlayer(item), pile: 'club' })));
  }

  if (include_unassigned) {
    const unassignedResult = await safeEACall('getUnassigned', {});
    if (unassignedResult.success) {
      const items = unassignedResult.data?.itemData || unassignedResult.data?.items || [];
      for (const item of items) {
        if (item.itemType !== 'player' && item.type !== 'player') continue;
        const rating = item.rating || 0;
        if (rating < min_rating || rating > max_rating) continue;
        players.push({ ...normalizeClubPlayer(item), pile: 'unassigned' });
      }
    }
  }

  // Deduplicate by item instance id
  const seen = new Set();
  const unique = [];
  for (const p of players) {
    if (!p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    unique.push(p);
  }

  return filterPlayerPool(unique, { min_rating, max_rating, ...filters }, protection);
}

/**
 * Estimate fodder value for solver objective (lower is better).
 * @param {import('./types.js').ClubPlayer} player
 */
export function estimatePlayerCost(player) {
  if (player.untradeable) return player.rating || 0;
  return (player.rating || 0) * 10;
}
