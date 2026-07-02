/**
 * Club portfolio analytics (FutNext-style).
 */

import { getCache, refreshFullCache } from '../cache/fut-cache.js';
import { isSpecialOrPromoCard } from '../sbc/protected-players.js';
import { fetchFutbinPrices, resolveMarketValue, resolveInvested } from './futbin-batch.js';
import { safeEACall } from '../ea-call.js';
import { rateLimiter } from '../rate-limiter.js';
import { fetchPlayerPool } from '../sbc/player-pool.js';

function tierFromRating(rating) {
  if (rating <= 64) return 'bronze';
  if (rating <= 74) return 'silver';
  return 'gold';
}

function isFodderCard(player) {
  const r = player.rating || 0;
  if (r >= 83) return false;
  if (isSpecialOrPromoCard(player)) return false;
  return r >= 45;
}

function isInvestmentCard(player) {
  const r = player.rating || 0;
  if (isSpecialOrPromoCard(player)) return true;
  if (r >= 83) return true;
  return false;
}

function tradepileValue(tradepile) {
  if (!tradepile) return { total: 0, listed: 0 };
  const items = tradepile.auctionInfo || tradepile.items || tradepile.itemData || [];
  let total = 0;
  let listed = 0;
  for (const row of items) {
    const item = row.itemData || row;
    const state = row.tradeState || item.tradeState;
    if (state === 'closed' || state === 'expired') continue;
    const bin = row.buyNowPrice ?? item.buyNowPrice ?? 0;
    const bid = row.currentBid ?? item.currentBid ?? row.startingBid ?? 0;
    const val = bin || bid;
    if (val > 0) {
      total += val;
      listed += 1;
    }
  }
  return { total, listed };
}

function buildPlayerRow(player, futbinPrices) {
  const current = resolveMarketValue(player, futbinPrices);
  const invested = resolveInvested(player);
  const profit = current - invested;
  return {
    id: player.id,
    assetId: player.assetId,
    name: player.name || player._name || `Jogador ${player.assetId || player.id}`,
    rating: player.rating,
    tier: tierFromRating(player.rating || 0),
    untradeable: Boolean(player.untradeable),
    invested,
    currentValue: current,
    profitLoss: profit,
    rareflag: player.rareflag,
    inSbcStorage: Boolean(player.inSbcStorage),
  };
}

/**
 * @param {Object} options
 */
export async function computeClubAnalytics(options = {}) {
  const {
    force_refresh = false,
    use_futbin = true,
    platform = 'pc',
    top_n = 10,
  } = options;

  let cache = await getCache();

  if (force_refresh || !cache?.clubPlayers?.length) {
    await rateLimiter.throttle('read');
    const refreshed = await refreshFullCache(safeEACall);
    if (refreshed.success) {
      cache = refreshed.data;
    }
  }

  const pool = await fetchPlayerPool({
    min_rating: 45,
    max_rating: 99,
    include_unassigned: true,
    include_sbc_storage: true,
    use_cache: true,
    force_refresh: false,
    _skipProtectionFilter: true,
  });

  const tradeableAssetIds = pool
    .filter((p) => !p.untradeable && p.assetId)
    .map((p) => p.assetId);

  const futbinPrices =
    use_futbin && tradeableAssetIds.length
      ? await fetchFutbinPrices(tradeableAssetIds, platform)
      : new Map();

  const rows = pool.map((p) => buildPlayerRow(p, futbinPrices));

  const coins = cache?.coins?.credits ?? cache?.summary?.coins ?? 0;
  const clubValue = rows.reduce((s, r) => s + r.currentValue, 0);
  const tp = tradepileValue(cache?.tradepile);
  const portfolio = coins + clubValue + tp.total;

  const playerById = new Map(pool.map((p) => [p.id, p]));
  const fodderRows = rows.filter((r) => {
    const p = playerById.get(r.id);
    return p && isFodderCard(p);
  });
  const investmentRows = rows.filter((r) => {
    const p = playerById.get(r.id);
    return p && isInvestmentCard(p);
  });

  const fodderValue = fodderRows.reduce((s, r) => s + r.currentValue, 0);
  const investedTotal = investmentRows.reduce((s, r) => s + r.invested, 0);
  const investmentCurrent = investmentRows.reduce((s, r) => s + r.currentValue, 0);
  const unrealizedPl = investmentCurrent - investedTotal;

  const tierCounts = { bronze: 0, silver: 0, gold: 0 };
  const ratingHistogram = {};
  for (const r of rows) {
    tierCounts[r.tier] += 1;
    const key = String(r.rating);
    ratingHistogram[key] = (ratingHistogram[key] || 0) + 1;
  }

  const investmentByRating = {};
  for (const r of investmentRows) {
    const key = String(r.rating);
    if (!investmentByRating[key]) {
      investmentByRating[key] = { rating: r.rating, invested: 0, currentValue: 0, count: 0 };
    }
    investmentByRating[key].invested += r.invested;
    investmentByRating[key].currentValue += r.currentValue;
    investmentByRating[key].count += 1;
  }

  const movers = rows.filter((r) => r.currentValue >= 500 || r.invested > 0);
  const topGainers = [...movers]
    .sort((a, b) => b.profitLoss - a.profitLoss)
    .slice(0, top_n);
  const topLosers = [...movers]
    .filter((r) => r.profitLoss < 0)
    .sort((a, b) => a.profitLoss - b.profitLoss)
    .slice(0, top_n);

  const futbinHits = futbinPrices.size;
  const futbinCoverage =
    tradeableAssetIds.length > 0
      ? Math.round((futbinHits / tradeableAssetIds.length) * 100)
      : 0;

  return {
    success: true,
    data: {
      updatedAt: cache?.updatedAt || Date.now(),
      coins,
      summary: {
        portfolio,
        investments: investmentCurrent,
        investedTotal,
        unrealizedProfitLoss: unrealizedPl,
        fodder: fodderValue,
        transferList: tp.total,
        transferListCount: tp.listed,
        clubValue,
        playerCount: rows.length,
      },
      tierCounts,
      ratingDistribution: Object.entries(ratingHistogram)
        .map(([rating, count]) => ({ rating: Number(rating), count }))
        .sort((a, b) => a.rating - b.rating),
      investmentByRating: Object.values(investmentByRating).sort(
        (a, b) => a.rating - b.rating
      ),
      topGainers,
      topLosers,
      pricing: {
        futbinUsed: use_futbin,
        futbinPricesLoaded: futbinHits,
        futbinCoveragePct: futbinCoverage,
        platform,
      },
    },
  };
}
