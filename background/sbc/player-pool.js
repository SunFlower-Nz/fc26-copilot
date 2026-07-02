/**

 * Build candidate player pool from club + unassigned piles.

 * Uses FUT cache by default; force_refresh hits EA API.

 */



import { safeEACall } from '../ea-call.js';

import { filterPlayerPool, getProtectionConfig } from './protected-players.js';

import { getCache, filterCachedClubPlayers, updateCache } from '../cache/fut-cache.js';

import { enrichPlayers } from '../player-catalog.js';



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
    preferredPosition: item.preferredPosition || item.position,
    position: item.preferredPosition || item.position,
    _name: item._name || item.name || null,
    name: item._name || item.name || null,
    positionLabel: item.positionLabel || null,
    pile: item.pile || 'club',
    duplicateId: item.duplicateId,
    resourceId: item.resourceId,
    groups: item.groups || [],
    marketAverage: item.marketAverage ?? item.marketData?.average ?? null,
    marketDataMinPrice: item.marketDataMinPrice ?? item.marketData?.minPrice ?? null,
    discardValue: item.discardValue ?? null,
    inSbcStorage: Boolean(item.inSbcStorage),
  };
}

/**
 * Selection priority for SBC fodder (lower tier = preferred first).
 * 0 = SBC storage, 1 = untradeable club/unassigned, 2 = tradeable (cheapest market value).
 * @param {import('./types.js').ClubPlayer} player
 */
export function getPlayerSelectionTier(player) {
  if (player.inSbcStorage || player.pile === 'sbc_storage' || player.pile === 10) return 0;
  if (player.untradeable) return 1;
  return 2;
}

function tradeableMarketValue(player) {
  const market =
    player.marketAverage ??
    player.marketDataMinPrice ??
    player.discardValue ??
    null;
  if (market != null && market > 0) return market;
  return (player.rating || 0) * 100;
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
    include_sbc_storage = true,

    filters = {},

    force_refresh = false,

    use_cache = true,

  } = options;



  const protection = await getProtectionConfig();

  const players = [];



  if (use_cache && !force_refresh) {

    const cache = await getCache();

    if (cache?.clubPlayers?.length) {

      const filtered = filterCachedClubPlayers(cache, {

        min_rating,

        max_rating,

        ...filters,

      });

      for (const item of filtered.itemData) {

        players.push({ ...normalizeClubPlayer(item), pile: item.pile || 'club' });

      }



      if (include_unassigned && cache.unassigned?.length) {
        for (const item of cache.unassigned) {
          if (item.itemType !== 'player' && item.type !== 'player' && item.rating) {
            // still player cards in unassigned pile
          }
          const rating = item.rating || 0;
          if (rating && (rating < min_rating || rating > max_rating)) continue;
          if (!item.rating && item.itemType !== 'player' && item.type !== 'player') continue;
          players.push({ ...normalizeClubPlayer(item), pile: 'unassigned' });
        }
      }

      if (include_sbc_storage && cache.sbcStorage?.length) {
        for (const item of cache.sbcStorage) {
          const rating = item.rating || 0;
          if (rating && (rating < min_rating || rating > max_rating)) continue;
          players.push({
            ...normalizeClubPlayer(item),
            pile: 'sbc_storage',
            inSbcStorage: true,
          });
        }
      }

    }

  }



  if (!players.length || force_refresh) {

    const clubResult = await safeEACall('getClubPlayers', {

      min_rating,

      max_rating,

      count: 91,

      max_total: 1000,

      sort: 'asc',

    });



    players.length = 0;



    if (clubResult.success) {

      const items = await enrichPlayers(clubResult.data?.itemData || []);

      players.push(...items.map((item) => ({ ...normalizeClubPlayer(item), pile: 'club' })));

      await updateCache({ clubPlayers: items.map((i) => normalizeClubPlayer(i)) });

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
        await updateCache({ unassigned: items });
      }
    }

    if (include_sbc_storage) {
      const storageResult = await safeEACall('getSbcStoragePlayers', {
        min_rating,
        max_rating,
        max_total: 100,
      });
      if (storageResult.success) {
        const items = storageResult.data?.itemData || [];
        for (const item of items) {
          const rating = item.rating || 0;
          if (rating < min_rating || rating > max_rating) continue;
          players.push({
            ...normalizeClubPlayer(item),
            pile: 'sbc_storage',
            inSbcStorage: true,
          });
        }
        if (items.length) {
          await updateCache({ sbcStorage: items });
        }
      }
    }

  }



  const seen = new Set();

  const unique = [];

  for (const p of players) {
    if (!p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    unique.push(p);
  }

  if (options._skipProtectionFilter) {
    return unique.filter((p) => {
      const r = p.rating || 0;
      return r >= min_rating && r <= max_rating;
    });
  }

  return filterPlayerPool(unique, { min_rating, max_rating, ...filters }, protection);
}

/**
 * Raw club pool before protection (for last-resort detection).
 * @param {Object} options
 */
export async function fetchRawPlayerPool(options = {}) {
  const players = await fetchPlayerPool({ ...options, _skipProtectionFilter: true });
  return players;
}



/**

 * Estimate fodder value for solver objective (lower is better).

 * @param {import('./types.js').ClubPlayer} player

 */

export function estimatePlayerCost(player) {
  const tier = getPlayerSelectionTier(player);
  const tierBase = tier * 10_000_000;

  if (tier === 2) {
    return tierBase + tradeableMarketValue(player);
  }

  return tierBase + (player.rating || 0);
}


