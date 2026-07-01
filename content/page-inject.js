/**
 * FC26 Copilot — Page-injected script
 *
 * Runs in the EA web app's page context. Has access to the app's internal
 * JavaScript objects and can call EA APIs directly.
 *
 * Uses Approach C (direct HTTP API calls) as recommended by the BRD for
 * maximum stability across web app updates.
 */

const MESSAGE_REQUEST = 'FC26_COPILOT_REQUEST';
const MESSAGE_RESPONSE = 'FC26_COPILOT_RESPONSE';
const SESSION_UPDATE = 'FC26_COPILOT_SESSION';

// Base URL is captured dynamically from the web app's own requests
let EA_BASE_URL = null;

// Session credentials captured from intercepted requests
let capturedSession = {
  sid: null,
  phishingToken: null,
};

// ── Session + Base URL Capture ───────────────────────────────

// Detect the API base URL from a request URL containing /ut/game/fc2
function captureBaseUrl(url) {
  if (EA_BASE_URL) return;
  try {
    const str = typeof url === 'string' ? url : url.toString();
    const match = str.match(/(https:\/\/[^/]+\/ut\/game\/fc\d+)/);
    if (match) {
      EA_BASE_URL = match[1];
      console.log('[FC26 Copilot] Captured API base URL:', EA_BASE_URL);
    }
  } catch (e) { /* ignore */ }
}

const _originalFetch = window.fetch;
window.fetch = function (url, opts) {
  try {
    captureBaseUrl(url);

    if (opts?.headers) {
      const headers =
        opts.headers instanceof Headers
          ? Object.fromEntries(opts.headers.entries())
          : opts.headers;

      if (headers['X-UT-SID'] && headers['X-UT-SID'] !== capturedSession.sid) {
        capturedSession.sid = headers['X-UT-SID'];
        notifySession();
      }
      if (headers['X-UT-PHISHING-TOKEN'] && headers['X-UT-PHISHING-TOKEN'] !== capturedSession.phishingToken) {
        capturedSession.phishingToken = headers['X-UT-PHISHING-TOKEN'];
        notifySession();
      }
    }
  } catch (e) {
    // Never break the original fetch
  }
  return _originalFetch.apply(this, arguments);
};

const _originalXHROpen = XMLHttpRequest.prototype.open;
const _originalXHRSetHeader = XMLHttpRequest.prototype.setRequestHeader;

XMLHttpRequest.prototype.open = function (method, url) {
  try {
    captureBaseUrl(url);
  } catch (e) { /* ignore */ }
  return _originalXHROpen.apply(this, arguments);
};

XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
  try {
    if (name === 'X-UT-SID' && value !== capturedSession.sid) {
      capturedSession.sid = value;
      notifySession();
    }
    if (name === 'X-UT-PHISHING-TOKEN' && value !== capturedSession.phishingToken) {
      capturedSession.phishingToken = value;
      notifySession();
    }
  } catch (e) {
    // Never break XHR
  }
  return _originalXHRSetHeader.call(this, name, value);
};

function notifySession() {
  window.postMessage(
    {
      type: SESSION_UPDATE,
      sessionId: capturedSession.sid,
      phishingToken: capturedSession.phishingToken,
    },
    '*'
  );
}

// ── EA API Helpers ───────────────────────────────────────────

function getHeaders() {
  if (!capturedSession.sid) {
    throw new Error('No session captured. Please ensure the web app is loaded and logged in.');
  }
  if (!EA_BASE_URL) {
    throw new Error('API base URL not captured yet. Navigate around in the web app to trigger a request.');
  }
  return {
    'X-UT-SID': capturedSession.sid,
    'X-UT-PHISHING-TOKEN': capturedSession.phishingToken || '',
    'Content-Type': 'application/json',
  };
}

async function eaGet(path, params = {}) {
  const url = new URL(EA_BASE_URL + path);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  }

  const response = await _originalFetch(url.toString(), {
    method: 'GET',
    headers: getHeaders(),


  });

  if (!response.ok) {
    const error = new Error(`EA API error: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function eaPost(path, body = {}) {
  const response = await _originalFetch(EA_BASE_URL + path, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = new Error(`EA API error: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function eaPut(path, body = {}) {
  const response = await _originalFetch(EA_BASE_URL + path, {
    method: 'PUT',
    headers: getHeaders(),


    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = new Error(`EA API error: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function eaDelete(path) {
  const response = await _originalFetch(EA_BASE_URL + path, {
    method: 'DELETE',
    headers: getHeaders(),


  });

  if (!response.ok) {
    const error = new Error(`EA API error: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  // Some DELETE endpoints return empty body
  const text = await response.text();
  return text ? JSON.parse(text) : { success: true };
}

// ── Method Implementations ───────────────────────────────────

async function searchMarket(params) {
  const queryParams = {};

  if (params.type) queryParams.type = params.type;
  if (params.player_name) queryParams.maskedDefId = params.player_name;
  if (params.quality) queryParams.rarityIds = params.quality;
  if (params.position) queryParams.position = params.position;
  if (params.chemistry_style) queryParams.chemistryStyle = params.chemistry_style;
  if (params.nation_id) queryParams.nat = params.nation_id;
  if (params.league_id) queryParams.leag = params.league_id;
  if (params.club_id) queryParams.team = params.club_id;
  if (params.min_price) queryParams.minb = params.min_price;
  if (params.max_price) queryParams.maxb = params.max_price;
  if (params.min_bid) queryParams.micr = params.min_bid;
  if (params.max_bid) queryParams.macr = params.max_bid;
  if (params.min_rating) queryParams.minrating = params.min_rating;
  if (params.max_rating) queryParams.maxrating = params.max_rating;
  if (params.page) queryParams.start = params.page * 20;

  queryParams.num = 20;

  return eaGet('/transfermarket', queryParams);
}

async function buyItem(tradeId, maxPrice) {
  return eaPut(`/trade/${tradeId}/bid`, {
    bid: maxPrice,
  });
}

async function bidOnItem(tradeId, bidAmount) {
  return eaPut(`/trade/${tradeId}/bid`, {
    bid: bidAmount,
  });
}

async function listItem(itemId, startPrice, buyNowPrice, duration = 3600) {
  return eaPost('/auctionhouse', {
    buyNowPrice: buyNowPrice,
    startingBid: startPrice,
    duration: duration,
    itemData: {
      id: itemId,
    },
  });
}

async function getTradepile() {
  return eaGet('/tradepile');
}

async function getWatchlist() {
  return eaGet('/watchlist');
}

async function getClubPlayers(params = {}) {
  const pageSize = Math.min(params.count || 91, 91);
  const maxTotal = params.max_total || 1000;
  let start = 0;
  const allItems = [];

  while (allItems.length < maxTotal) {
    const queryParams = {
      sort: params.sort || 'desc',
      type: 'player',
      count: pageSize,
      start,
    };
    if (params.position) queryParams.position = params.position;
    if (params.min_rating) queryParams.minrating = params.min_rating;
    if (params.max_rating) queryParams.maxrating = params.max_rating;

    const page = await eaGet('/club', queryParams);
    const items = page?.itemData || page?.items || [];
    allItems.push(...items);

    if (items.length < pageSize) break;
    start += pageSize;
  }

  return { itemData: allItems.slice(0, maxTotal), total: allItems.length };
}

async function getCoinBalance() {
  return eaGet('/user/credits');
}

async function doKeepalive() {
  return eaGet('/phishing/validate');
}

async function relistAll() {
  return eaPut('/auctionhouse/relist');
}

async function clearSold() {
  return eaDelete('/tradepile');
}

async function getUnassigned() {
  return eaGet('/purchased/items');
}

async function sendToTradepile(itemId) {
  return eaPut(`/item/${itemId}`, { pile: 'trade' });
}

async function sendToClub(itemId) {
  return eaPut(`/item/${itemId}`, { pile: 'club' });
}

async function getActiveSBCs() {
  return eaGet('/sbs/challenge');
}

async function getSBCRequirements(sbcId) {
  return eaGet(`/sbs/challenge/${sbcId}`);
}

async function getSBCSets() {
  return eaGet('/sbs/sets');
}

async function getSBCSetChallenges(setId) {
  return eaGet(`/sbs/setId/${setId}/challenges`);
}

async function getSBCSquad(challengeId) {
  return eaGet(`/sbs/challenge/${challengeId}/squad`);
}

function buildSquadPayload(existingSquad, itemIdsBySlot) {
  const slots = existingSquad?.squad?.players || existingSquad?.players || [];
  const slotCount = slots.length || itemIdsBySlot.length || 11;

  const players = [];
  for (let index = 0; index < slotCount; index += 1) {
    const id = itemIdsBySlot[index] ?? slots[index]?.itemData?.id ?? 0;
    players.push({
      index,
      itemData: {
        id: id || 0,
        dream: false,
      },
    });
  }
  return { players };
}

async function setSBCSquad(challengeId, itemIdsBySlot) {
  const current = await getSBCSquad(challengeId);
  const body = buildSquadPayload(current, itemIdsBySlot);
  return eaPut(`/sbs/challenge/${challengeId}/squad`, body);
}

async function clearSBCSquad(challengeId) {
  const current = await getSBCSquad(challengeId);
  const slots = current?.squad?.players || current?.players || [];
  const emptyIds = slots.map(() => 0);
  return setSBCSquad(challengeId, emptyIds);
}

async function submitSBC(challengeId, setId) {
  const body = { challengeId: parseInt(challengeId, 10) };
  if (setId !== undefined && setId !== null) {
    body.setId = parseInt(setId, 10);
  }
  return eaPut(`/sbs/challenge/${challengeId}`, body);
}

async function removeFromWatchlist(tradeId) {
  return eaDelete(`/trade/${tradeId}`);
}

// ── Request Router ───────────────────────────────────────────

async function executeMethod(method, params) {
  switch (method) {
    case 'searchTransferMarket':
      return searchMarket(params);
    case 'buyNow':
      return buyItem(params.tradeId, params.maxPrice);
    case 'placeBid':
      return bidOnItem(params.tradeId, params.bidAmount);
    case 'listItem':
      return listItem(params.itemId, params.startPrice, params.buyNowPrice, params.duration);
    case 'getTradepile':
      return getTradepile();
    case 'getWatchlist':
      return getWatchlist();
    case 'getClubPlayers':
      return getClubPlayers(params);
    case 'getCoinBalance':
      return getCoinBalance();
    case 'keepalive':
      return doKeepalive();
    case 'relistAll':
      return relistAll();
    case 'clearSold':
      return clearSold();
    case 'getUnassigned':
      return getUnassigned();
    case 'sendToTradepile':
      return sendToTradepile(params.itemId);
    case 'sendToClub':
      return sendToClub(params.itemId);
    case 'getActiveSBCs':
      return getActiveSBCs();
    case 'getSBCRequirements':
      return getSBCRequirements(params.sbcId);
    case 'getSBCSets':
      return getSBCSets();
    case 'getSBCSetChallenges':
      return getSBCSetChallenges(params.setId);
    case 'getSBCSquad':
      return getSBCSquad(params.challengeId);
    case 'setSBCSquad':
      return setSBCSquad(params.challengeId, params.itemIdsBySlot);
    case 'clearSBCSquad':
      return clearSBCSquad(params.challengeId);
    case 'submitSBC':
      return submitSBC(params.challengeId, params.setId);
    case 'removeFromWatchlist':
      return removeFromWatchlist(params.tradeId);
    default:
      throw new Error(`Unknown method: ${method}`);
  }
}

// ── Message Listener ─────────────────────────────────────────

window.addEventListener('message', async (event) => {
  if (event.source !== window || event.data?.type !== MESSAGE_REQUEST) return;

  const { requestId, method, params } = event.data;

  try {
    const result = await executeMethod(method, params);
    window.postMessage(
      { type: MESSAGE_RESPONSE, requestId, result },
      '*'
    );
  } catch (error) {
    window.postMessage(
      {
        type: MESSAGE_RESPONSE,
        requestId,
        error: error.message,
        errorCode: error.status || null,
      },
      '*'
    );
  }
});

console.log('[FC26 Copilot] Page script injected and listening');
