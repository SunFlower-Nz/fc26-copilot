/**
 * Full FUT data cache — club, squad, formation, tradepile, etc.
 * Persists to chrome.storage.local until force_refresh.
 */

import { logger } from '../../shared/logger.js';
import { enrichPlayers } from '../player-catalog.js';

export const CACHE_KEY = 'fc26_fut_cache';

/** @typedef {Object} FutCache
 * @property {number} updatedAt
 * @property {Object|null} coins
 * @property {Object[]} clubPlayers
 * @property {Object[]} unassigned
 * @property {Object|null} tradepile
 * @property {Object|null} watchlist
 * @property {Object|null} activeSbcs
 * @property {Object|null} activeSquad
 * @property {string|null} formation
 * @property {Object[]} sbcStorage
 * @property {Object|null} userInfo
 */

/** @returns {Promise<FutCache|null>} */
export async function getCache() {
  const stored = await chrome.storage.local.get(CACHE_KEY);
  return stored[CACHE_KEY] || null;
}

/** @param {Partial<FutCache>} patch */
export async function updateCache(patch) {
  const current = (await getCache()) || defaultCache();
  const next = {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  };
  await chrome.storage.local.set({ [CACHE_KEY]: next });
  return next;
}

function defaultCache() {
  return {
    updatedAt: 0,
    coins: null,
    clubPlayers: [],
    unassigned: [],
    tradepile: null,
    watchlist: null,
    activeSbcs: null,
    activeSquad: null,
    formation: null,
    sbcStorage: [],
    userInfo: null,
  };
}

/**
 * Refresh all cache sections from EA API.
 * @param {Function} safeEACall
 */
export async function refreshFullCache(safeEACall) {
  logger.info('Refreshing full FUT cache');

  const results = await Promise.allSettled([
    safeEACall('getCoinBalance', {}),
    safeEACall('getClubPlayers', { count: 91, max_total: 1500, sort: 'asc' }),
    safeEACall('getUnassigned', {}),
    safeEACall('getTradepile', {}),
    safeEACall('getWatchlist', {}),
    safeEACall('getActiveSBCs', {}),
    safeEACall('getActiveSquad', {}),
    safeEACall('getUserInfo', {}),
    safeEACall('getSbcStoragePlayers', { max_total: 100 }),
  ]);

  const [coinsR, clubR, unassignedR, tradepileR, watchlistR, sbcsR, squadR, userR, storageR] =
    results;

  let clubPlayers =
    clubR.status === 'fulfilled' && clubR.value.success
      ? clubR.value.data?.itemData || []
      : [];

  clubPlayers = await enrichPlayers(clubPlayers);

  const squadData =
    squadR.status === 'fulfilled' && squadR.value.success ? squadR.value.data : null;

  const cache = await updateCache({
    coins:
      coinsR.status === 'fulfilled' && coinsR.value.success ? coinsR.value.data : null,
    clubPlayers,
    unassigned:
      unassignedR.status === 'fulfilled' && unassignedR.value.success
        ? unassignedR.value.data?.itemData || unassignedR.value.data?.items || []
        : [],
    tradepile:
      tradepileR.status === 'fulfilled' && tradepileR.value.success
        ? tradepileR.value.data
        : null,
    watchlist:
      watchlistR.status === 'fulfilled' && watchlistR.value.success
        ? watchlistR.value.data
        : null,
    activeSbcs:
      sbcsR.status === 'fulfilled' && sbcsR.value.success ? sbcsR.value.data : null,
    activeSquad: squadData,
    formation: extractFormation(squadData),
    userInfo:
      userR.status === 'fulfilled' && userR.value.success ? userR.value.data : null,
    sbcStorage:
      storageR.status === 'fulfilled' && storageR.value.success
        ? storageR.value.data?.itemData || []
        : [],
  });

  return {
    success: true,
    data: {
      ...cache,
      summary: cacheSummary(cache),
    },
  };
}

function extractFormation(squadData) {
  if (!squadData) return null;
  return (
    squadData.formation ||
    squadData.squad?.formation ||
    squadData.data?.formation ||
    null
  );
}

/**
 * @param {FutCache} cache
 */
export function cacheSummary(cache) {
  return {
    updatedAt: cache.updatedAt,
    clubCount: cache.clubPlayers?.length || 0,
    sbcStorageCount: cache.sbcStorage?.length || 0,
    unassignedCount: cache.unassigned?.length || 0,
    formation: cache.formation,
    coins: cache.coins?.credits ?? null,
  };
}

/**
 * Filter cached club players (no EA call).
 */
export function filterCachedClubPlayers(cache, params = {}) {
  let items = [...(cache?.clubPlayers || [])];

  if (params.position) {
    const pos = params.position.toUpperCase();
    items = items.filter(
      (p) =>
        (p.preferredPosition || p.position || '').toUpperCase() === pos ||
        (p.possiblePositions || []).some((x) => String(x).toUpperCase() === pos)
    );
  }
  if (params.min_rating != null) {
    items = items.filter((p) => (p.rating || 0) >= params.min_rating);
  }
  if (params.max_rating != null) {
    items = items.filter((p) => (p.rating || 0) <= params.max_rating);
  }
  if (params.is_untradeable != null) {
    items = items.filter((p) => Boolean(p.untradeable) === params.is_untradeable);
  }

  const max = params.max_total || params.count || items.length;
  return { itemData: items.slice(0, max), total: items.length, fromCache: true };
}

export async function invalidateClubSection() {
  const cache = await getCache();
  if (!cache) return;
  await updateCache({ clubPlayers: [], updatedAt: cache.updatedAt });
}
