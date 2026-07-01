/**
 * Protected player rules — block titulares and high-rated cards from SBC solver.
 */

const DEFAULT_PROTECTED_RATINGS = 87;
const DEFAULT_PROTECTED_ASSET_IDS = new Set([
  // User titulares (assetId) — extend via popup storage
]);

/**
 * @returns {Promise<{ minRating: number, assetIds: number[], names: string[] }>}
 */
export async function getProtectionConfig() {
  const data = await chrome.storage.local.get('fc26_protected_players');
  const cfg = data.fc26_protected_players || {};
  return {
    minRating: cfg.minRating ?? DEFAULT_PROTECTED_RATINGS,
    assetIds: Array.isArray(cfg.assetIds) ? cfg.assetIds : [],
    names: Array.isArray(cfg.names) ? cfg.names : [],
  };
}

/**
 * @param {import('./types.js').ClubPlayer} player
 * @param {{ minRating?: number, assetIds?: number[], names?: string[] }} config
 */
export function isPlayerProtected(player, config = {}) {
  const minRating = config.minRating ?? DEFAULT_PROTECTED_RATINGS;
  const assetIds = new Set([
    ...DEFAULT_PROTECTED_ASSET_IDS,
    ...(config.assetIds || []),
  ]);

  if ((player.rating || 0) >= minRating) return true;
  if (assetIds.has(player.assetId)) return true;

  const name = (player._name || player.name || '').toLowerCase();
  for (const protectedName of config.names || []) {
    if (name && name.includes(protectedName.toLowerCase())) return true;
  }

  return false;
}

/**
 * @param {import('./types.js').ClubPlayer[]} players
 * @param {Object} filters
 */
export function filterPlayerPool(players, filters = {}, protection = {}) {
  const {
    max_rating = 99,
    min_rating = 45,
    allow_tradeable = true,
    allow_untradeable = true,
    allow_special = true,
    allow_rare = true,
  } = filters;

  return players.filter((player) => {
    const rating = player.rating || 0;
    if (rating < min_rating || rating > max_rating) return false;
    if (!allow_tradeable && !player.untradeable) return false;
    if (!allow_untradeable && player.untradeable) return false;
    if (!allow_special && rating >= 75 && (player.rareflag === 1 || player.rareflag === true)) {
      // keep common gold when allow_special false only blocks high specials — use rating heuristic
      if (rating >= 83) return false;
    }
    if (!allow_rare && (player.rareflag === 1 || player.rareflag === true)) return false;
    if (isPlayerProtected(player, protection)) return false;
    return true;
  });
}

export async function saveProtectionConfig(config) {
  await chrome.storage.local.set({ fc26_protected_players: config });
}
