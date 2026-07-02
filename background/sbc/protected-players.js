/**

 * Protected player rules — block titulares, promos, and non-standard fodder from SBC solver.

 */



const DEFAULT_PROTECTED_RATINGS = 87;



/** Standard gold/silver/bronze — common (0) and rare (1) only. */

const STANDARD_FODDER_RARE_FLAGS = new Set([0, 1]);



const UPGRADE_RATING = {

  bronze: { min: 45, max: 64 },

  silver: { min: 65, max: 74 },

  gold: { min: 75, max: 99 },

};



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

    fodderOnly: cfg.fodderOnly !== false,

  };

}



/**

 * Promo / special cards (Future Stars, IF, Icon, etc.) — not bronze/silver/gold fodder.

 * @param {import('./types.js').ClubPlayer} player

 */

export function isSpecialOrPromoCard(player) {

  const flag = Number(player.rareflag ?? player.rareFlag ?? 0);

  if (!STANDARD_FODDER_RARE_FLAGS.has(flag)) return true;



  const groups = player.groups || [];

  if (Array.isArray(groups) && groups.length > 4) return true;



  const name = (player._name || player.name || '').toLowerCase();

  const promoHints = [

    'future stars',

    'future star',

    'icon',

    'heroes',

    'totw',

    'rulebreakers',

    'trailblazers',

    'ucl',

    'fantasy',

  ];

  if (promoHints.some((hint) => name.includes(hint))) return true;



  return false;

}



/**

 * @param {import('./types.js').ClubPlayer} player

 * @param {'bronze'|'silver'|'gold'|null} tier

 */

export function isStandardUpgradeFodder(player, tier = null) {

  const rating = player.rating || 0;



  if (tier && UPGRADE_RATING[tier]) {

    const { min, max } = UPGRADE_RATING[tier];

    if (rating < min || rating > max) return false;

  } else {

    const inBronze = rating >= 45 && rating <= 64;

    const inSilver = rating >= 65 && rating <= 74;

    const inGold = rating >= 75 && rating <= 99;

    if (!inBronze && !inSilver && !inGold) return false;

  }



  return !isSpecialOrPromoCard(player);

}



/**

 * @param {string} challengeName

 * @returns {'bronze'|'silver'|'gold'|null}

 */

export function upgradeTierFromName(challengeName = '') {

  const name = challengeName.toLowerCase();

  if (name.includes('bronze') || name.includes('melhoria de bronze')) return 'bronze';

  if (name.includes('silver') || name.includes('prata')) return 'silver';

  if (name.includes('gold') || name.includes('ouro')) return 'gold';

  return null;

}



/**

 * @param {import('./types.js').ClubPlayer} player

 * @param {{ minRating?: number, assetIds?: number[], names?: string[] }} config

 */

export function isPlayerProtected(player, config = {}) {

  const minRating = config.minRating ?? DEFAULT_PROTECTED_RATINGS;

  const assetIds = new Set(config.assetIds || []);



  if ((player.rating || 0) >= minRating) return true;

  if (assetIds.has(player.assetId)) return true;



  const name = (player._name || player.name || '').toLowerCase();

  for (const protectedName of config.names || []) {

    if (name && name.includes(protectedName.toLowerCase())) return true;

  }



  if (config.fodderOnly !== false && isSpecialOrPromoCard(player)) return true;



  return false;

}



/**

 * @param {import('./types.js').ClubPlayer[]} players

 * @param {Object} filters

 * @param {Object} protection

 */

export function filterPlayerPool(players, filters = {}, protection = {}) {

  const {

    max_rating = 99,

    min_rating = 45,

    allow_tradeable = true,

    allow_untradeable = true,

    upgrade_tier = null,

    fodder_only = protection.fodderOnly !== false,

  } = filters;



  return players.filter((player) => {

    const rating = player.rating || 0;

    if (rating < min_rating || rating > max_rating) return false;

    if (!allow_tradeable && !player.untradeable) return false;

    if (!allow_untradeable && player.untradeable) return false;



    if (fodder_only) {

      if (!isStandardUpgradeFodder(player, upgrade_tier)) return false;

    }



    if (isPlayerProtected(player, { ...protection, fodderOnly: fodder_only })) return false;

    return true;

  });

}



/**

 * Players that could satisfy the DME but are blocked by protection rules.

 * @param {import('./types.js').ClubPlayer[]} allPlayers

 * @param {Object} filters

 * @param {Object} protection

 */

export function getBlockedButEligiblePlayers(allPlayers, filters = {}, protection = {}) {

  const relaxedProtection = { ...protection, fodderOnly: false, minRating: 99 };

  const withoutProtection = filterPlayerPool(allPlayers, { ...filters, fodder_only: false }, relaxedProtection);

  const withProtection = filterPlayerPool(allPlayers, filters, protection);

  const allowedIds = new Set(withProtection.map((p) => p.id));

  return withoutProtection.filter((p) => !allowedIds.has(p.id));

}



export async function saveProtectionConfig(config) {

  await chrome.storage.local.set({ fc26_protected_players: config });

}



export { STANDARD_FODDER_RARE_FLAGS, UPGRADE_RATING };


