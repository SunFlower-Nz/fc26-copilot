/**
 * EA transfer market price steps + premium fodder detection.
 */

export function roundMarketPrice(price) {
  const p = Math.max(200, Math.round(price));
  if (p < 1000) return Math.round(p / 50) * 50;
  if (p < 10000) return Math.round(p / 100) * 100;
  if (p < 50000) return Math.round(p / 250) * 250;
  return Math.round(p / 500) * 500;
}

export function marketAverage(player) {
  return (
    player.marketAverage ??
    player.marketData?.average ??
    player.marketDataMinPrice ??
    player.marketData?.minPrice ??
    0
  );
}

export function tierFromRating(rating) {
  if (rating <= 64) return 'bronze';
  if (rating <= 74) return 'silver';
  return 'gold';
}

/** Typical discard / quick-sell baseline by tier. */
export function tierBaseline(rating) {
  const t = tierFromRating(rating);
  if (t === 'bronze') return 200;
  if (t === 'silver') return 400;
  return 800;
}

/**
 * Premium bronze/silver = tradeable low-tier card worth listing (Nilsen, Bounou, Guendouzi, Diop…).
 * Uses EA market average vs tier baseline — catches outliers without a fixed name list.
 */
export function isPremiumLowTierCard(player, options = {}) {
  const rating = player.rating || 0;
  const tier = tierFromRating(rating);
  if (tier !== 'bronze' && tier !== 'silver') return false;
  if (player.untradeable) return false;

  const avg = marketAverage(player);
  if (!avg || avg <= 0) return false;

  const baseline = tierBaseline(rating);
  const fodderDiscard = tier === 'bronze' ? 200 : 200;
  const minBronze = options.min_bronze ?? 300;
  const minSilver = options.min_silver ?? 300;
  const minMultiplier = options.min_multiplier ?? 1.5;

  const floor = tier === 'bronze' ? minBronze : minSilver;
  const relative = avg >= fodderDiscard * minMultiplier;

  return avg >= floor && relative;
}

export function listingPricesFromAverage(avg) {
  const buyNow = roundMarketPrice(avg);
  const start = roundMarketPrice(Math.max(200, buyNow * 0.9));
  return { buyNow, start };
}
