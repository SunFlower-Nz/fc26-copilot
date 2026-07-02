/**
 * List premium bronze/silver cards at EA market average (BIN).
 */

import { safeEACall } from '../ea-call.js';
import { rateLimiter } from '../rate-limiter.js';
import { fetchPlayerPool } from '../sbc/player-pool.js';
import { enrichPlayers } from '../player-catalog.js';
import {
  isPremiumLowTierCard,
  listingPricesFromAverage,
  marketAverage,
  tierFromRating,
} from './market-pricing.js';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function tradepileIndex(tradepile) {
  const items = tradepile?.auctionInfo || tradepile?.items || [];
  const map = new Map();
  for (const row of items) {
    const item = row.itemData || row;
    if (item?.id) map.set(item.id, row);
  }
  return map;
}

/**
 * @param {Object} options
 * @param {boolean} [options.dry_run]
 * @param {boolean} [options.confirm]
 */
export async function sellPremiumFodder(options = {}) {
  const dryRun = options.dry_run === true || options.confirm !== true;
  const minBronze = options.min_bronze ?? 300;
  const minSilver = options.min_silver ?? 300;
  const minMultiplier = options.min_multiplier ?? 1.5;
  const duration = options.duration ?? 3600;
  const delayMs = options.delay_ms ?? 1000;

  const pool = await fetchPlayerPool({
    min_rating: 45,
    max_rating: 74,
    include_unassigned: true,
    include_sbc_storage: false,
    use_cache: options.use_cache !== false,
    force_refresh: options.force_refresh === true,
    _skipProtectionFilter: true,
  });

  const filterOpts = { min_bronze: minBronze, min_silver: minSilver, min_multiplier: minMultiplier };
  const candidates = pool
    .filter((p) => isPremiumLowTierCard(p, filterOpts))
    .sort((a, b) => marketAverage(b) - marketAverage(a));

  const enriched = await enrichPlayers(candidates);

  const preview = enriched.map((p, i) => {
    const raw = candidates[i];
    const avg = marketAverage(raw);
    const { buyNow, start } = listingPricesFromAverage(avg);
    return {
      itemId: raw.id,
      assetId: raw.assetId,
      name: p.name || p._name || `Jogador ${raw.assetId || raw.id}`,
      rating: raw.rating,
      tier: tierFromRating(raw.rating || 0),
      marketAverage: avg,
      buyNowPrice: buyNow,
      startPrice: start,
    };
  });

  if (dryRun) {
    return {
      success: true,
      data: {
        dryRun: true,
        count: preview.length,
        totalEstimatedValue: preview.reduce((s, r) => s + r.buyNowPrice, 0),
        players: preview,
        note:
          'Preview only. Re-call with confirm: true to send to tradepile and list at market average (BIN).',
      },
    };
  }

  await rateLimiter.throttle('read');
  const tpResult = await safeEACall('getTradepile', {});
  const tpMap = tpResult.success ? tradepileIndex(tpResult.data) : new Map();

  const results = { sent: 0, listed: 0, skipped: 0, errors: [], players: [] };

  for (const row of preview) {
    const tpRow = tpMap.get(row.itemId);
    const tradeState = tpRow?.tradeState;

    try {
      if (tradeState === 'active') {
        results.skipped += 1;
        results.players.push({ ...row, status: 'already_listed' });
        continue;
      }

      if (!tpRow) {
        await rateLimiter.throttle('read');
        const sent = await safeEACall('sendToTradepile', { itemId: row.itemId });
        if (!sent.success) {
          results.errors.push({ itemId: row.itemId, name: row.name, step: 'send', error: sent.error });
          continue;
        }
        results.sent += 1;
        await sleep(delayMs);
      }

      await rateLimiter.throttle('list');
      const listed = await safeEACall('listItem', {
        itemId: row.itemId,
        startPrice: row.startPrice,
        buyNowPrice: row.buyNowPrice,
        duration,
      });

      if (listed.success) {
        results.listed += 1;
        results.players.push({ ...row, status: 'listed' });
      } else {
        results.errors.push({ itemId: row.itemId, name: row.name, step: 'list', error: listed.error });
      }

      await sleep(delayMs);
    } catch (error) {
      results.errors.push({ itemId: row.itemId, name: row.name, step: 'unknown', error: error.message });
    }
  }

  return {
    success: true,
    data: {
      dryRun: false,
      ...results,
      totalListedValue: results.players
        .filter((p) => p.status === 'listed')
        .reduce((s, r) => s + r.buyNowPrice, 0),
    },
  };
}
