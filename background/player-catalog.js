/**
 * Player name lookup (EA localization) + position formatting.
 */

import { formatPosition } from '../shared/positions.js';
import { logger } from '../shared/logger.js';

const LOC_STORAGE_KEY = 'fc26_player_loc_pt';
const LOC_URL =
  'https://www.ea.com/ea-sports-fc/ultimate-team/web-app/loc/pt-BR.json';

/** @type {Map<number, string>|null} */
let nameByAssetId = null;
let locLoadPromise = null;

async function loadLocalization() {
  if (nameByAssetId) return nameByAssetId;
  if (locLoadPromise) return locLoadPromise;

  locLoadPromise = (async () => {
    nameByAssetId = new Map();

    try {
      const stored = await chrome.storage.local.get(LOC_STORAGE_KEY);
      if (stored[LOC_STORAGE_KEY]?.names) {
        for (const [id, name] of Object.entries(stored[LOC_STORAGE_KEY].names)) {
          nameByAssetId.set(parseInt(id, 10), name);
        }
        if (nameByAssetId.size > 1000) return nameByAssetId;
      }
    } catch {
      // continue to fetch
    }

    try {
      const response = await fetch(LOC_URL);
      if (!response.ok) throw new Error(`loc fetch ${response.status}`);
      const data = await response.json();

      const names = {};
      extractPlayerNames(data, names);
      for (const [id, name] of Object.entries(names)) {
        nameByAssetId.set(parseInt(id, 10), name);
      }

      await chrome.storage.local.set({
        [LOC_STORAGE_KEY]: {
          names,
          updatedAt: Date.now(),
        },
      });

      logger.info('Player localization loaded', { count: nameByAssetId.size });
    } catch (error) {
      logger.warn('Player localization fetch failed', { error: error.message });
    }

    return nameByAssetId;
  })();

  return locLoadPromise;
}

function extractPlayerNames(obj, out, depth = 0) {
  if (!obj || depth > 8) return;

  if (typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [key, value] of Object.entries(obj)) {
      if (/^\d{4,7}$/.test(key) && typeof value === 'string' && value.length > 1) {
        out[key] = value;
      } else if (typeof value === 'object') {
        extractPlayerNames(value, out, depth + 1);
      }
    }
  }
}

/**
 * @param {Object} player
 */
export async function enrichPlayer(player) {
  await loadLocalization();
  const assetId = player.assetId || player.resourceId;
  const pos = player.preferredPosition || player.position;

  let name = player._name || player.name || null;
  if (!name && assetId && nameByAssetId?.has(assetId)) {
    name = nameByAssetId.get(assetId);
  }
  if (!name && assetId) {
    name = `Jogador ${assetId}`;
  }

  return {
    ...player,
    _name: name,
    name,
    positionCode: pos || null,
    positionLabel: formatPosition(pos),
  };
}

/**
 * @param {Object[]} players
 */
export async function enrichPlayers(players) {
  await loadLocalization();
  return Promise.all(players.map((p) => enrichPlayer(p)));
}

export { formatPosition };
