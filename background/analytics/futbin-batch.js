/**
 * Batch FutBin price lookups (no EA rate limit).
 */

const BATCH_SIZE = 40;
const PRICE_CACHE_KEY = 'fc26_futbin_prices';
const CACHE_TTL_MS = 15 * 60 * 1000;

async function readCache() {
  const stored = await chrome.storage.local.get(PRICE_CACHE_KEY);
  return stored[PRICE_CACHE_KEY] || {};
}

async function writeCache(map) {
  await chrome.storage.local.set({ [PRICE_CACHE_KEY]: map });
}

/**
 * @param {number[]} assetIds
 * @param {string} platform
 * @returns {Promise<Map<number, number>>}
 */
export async function fetchFutbinPrices(assetIds, platform = 'pc') {
  const unique = [...new Set(assetIds.filter(Boolean))];
  const result = new Map();
  if (!unique.length) return result;

  const cache = await readCache();
  const now = Date.now();
  const toFetch = [];

  for (const id of unique) {
    const entry = cache[String(id)];
    if (entry && now - entry.ts < CACHE_TTL_MS) {
      result.set(id, entry.price);
    } else {
      toFetch.push(id);
    }
  }

  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const chunk = toFetch.slice(i, i + BATCH_SIZE);
    const ids = chunk.join(',');
    try {
      const response = await fetch(
        `https://www.futbin.com/stc/cheapest?type=player&platform=${platform}&ids=${ids}`
      );
      if (!response.ok) continue;
      const data = await response.json();
      for (const id of chunk) {
        const row = data?.[String(id)] ?? data?.[id];
        const price =
          row?.LCPrice ??
          row?.lc_price ??
          row?.price ??
          row?.min_price ??
          (Array.isArray(row) ? row[0]?.price : null);
        if (price != null && price > 0) {
          result.set(id, Number(price));
          cache[String(id)] = { price: Number(price), ts: now };
        }
      }
    } catch {
      // skip chunk on network error
    }
  }

  await writeCache(cache);
  return result;
}

/**
 * Resolve market value for a player item.
 * @param {Object} player
 * @param {Map<number, number>} futbinPrices
 */
export function resolveMarketValue(player, futbinPrices) {
  const assetId = player.assetId ?? player.assetid;
  if (assetId && futbinPrices.has(assetId)) {
    return futbinPrices.get(assetId);
  }
  if (player.marketAverage > 0) return player.marketAverage;
  if (player.marketDataMinPrice > 0) return player.marketDataMinPrice;
  if (player.discardValue > 0 && !player.untradeable) return player.discardValue;
  return estimateFallback(player);
}

function estimateFallback(player) {
  const r = player.rating || 0;
  if (r <= 64) return 200;
  if (r <= 74) return 400;
  if (r <= 82) return 800 + (r - 75) * 200;
  if (r <= 86) return 5000 + (r - 83) * 3000;
  return 15000 + (r - 87) * 8000;
}

export function resolveInvested(player) {
  const bought =
    player.purchasePrice ??
    player.lastSalePrice ??
    player.boughtFor ??
    player.acquiredPrice ??
    null;
  if (bought != null && bought > 0) return bought;
  if (player.untradeable) return 0;
  return 0;
}
