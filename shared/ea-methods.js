/**
 * EA API method implementations — shared between page-inject and background direct client.
 * @param {{ get: Function, post: Function, put: Function, del: Function }} api
 */

function buildSquadPayload(existingSquad, itemIdsBySlot) {
  const slots = existingSquad?.squad?.players || existingSquad?.players || [];
  const slotCount = slots.length || itemIdsBySlot.length || 11;
  const players = [];

  for (let index = 0; index < slotCount; index += 1) {
    const id = itemIdsBySlot[index] ?? slots[index]?.itemData?.id ?? 0;
    players.push({
      index,
      itemData: { id: id || 0, dream: false },
    });
  }
  return { players };
}

export async function executeEaMethod(api, method, params = {}) {
  switch (method) {
    case 'searchTransferMarket':
      return searchMarket(api, params);
    case 'buyNow':
      return api.put(`/trade/${params.tradeId}/bid`, { bid: params.maxPrice });
    case 'placeBid':
      return api.put(`/trade/${params.tradeId}/bid`, { bid: params.bidAmount });
    case 'listItem':
      return api.post('/auctionhouse', {
        buyNowPrice: params.buyNowPrice,
        startingBid: params.startPrice,
        duration: params.duration || 3600,
        itemData: { id: params.itemId },
      });
    case 'getTradepile':
      return api.get('/tradepile');
    case 'getWatchlist':
      return api.get('/watchlist');
    case 'getClubPlayers':
      return getClubPlayers(api, params);
    case 'getSbcStoragePlayers':
      return getSbcStoragePlayers(api, params);
    case 'getCoinBalance':
      return api.get('/user/credits');
    case 'keepalive':
      return api.get('/phishing/validate');
    case 'relistAll':
      return api.put('/auctionhouse/relist');
    case 'clearSold':
      return api.del('/tradepile');
    case 'getUnassigned':
      return api.get('/purchased/items');
    case 'sendToTradepile':
      return api.put(`/item/${params.itemId}`, { pile: 'trade' });
    case 'sendToClub':
      return api.put(`/item/${params.itemId}`, { pile: 'club' });
    case 'getActiveSBCs':
      return api.get('/sbs/sets');
    case 'getSBCRequirements':
      return api.get(`/sbs/challenge/${params.sbcId}`);
    case 'getSBCSets':
      return api.get('/sbs/sets');
    case 'getSBCSetChallenges':
      return getSbcSetChallenges(api, params.setId);
    case 'getSBCSquad':
      return api.get(`/sbs/challenge/${params.challengeId}/squad`);
    case 'setSBCSquad': {
      const current = await api.get(`/sbs/challenge/${params.challengeId}/squad`);
      const body = buildSquadPayload(current, params.itemIdsBySlot);
      return api.put(`/sbs/challenge/${params.challengeId}/squad`, body);
    }
    case 'clearSBCSquad': {
      const current = await api.get(`/sbs/challenge/${params.challengeId}/squad`);
      const slots = current?.squad?.players || current?.players || [];
      const emptyIds = slots.map(() => 0);
      return executeEaMethod(api, 'setSBCSquad', {
        challengeId: params.challengeId,
        itemIdsBySlot: emptyIds,
      });
    }
    case 'submitSBC': {
      const body = { challengeId: parseInt(params.challengeId, 10) };
      if (params.setId !== undefined && params.setId !== null) {
        body.setId = parseInt(params.setId, 10);
      }
      return api.put(`/sbs/challenge/${params.challengeId}`, body);
    }
    case 'removeFromWatchlist':
      return api.del(`/trade/${params.tradeId}`);
    case 'getUserInfo':
      return api.get('/usermassinfo');
    case 'getActiveSquad':
      return getActiveSquad(api, params);
    default:
      throw new Error(`Unknown method: ${method}`);
  }
}

async function getActiveSquad(api, params = {}) {
  let personaId = params.personaId;

  if (!personaId) {
    const info = await api.get('/usermassinfo');
    personaId =
      info?.userInfo?.personaId ??
      info?.personas?.[0]?.personaId ??
      info?.userInfo?.id ??
      null;
  }

  if (!personaId) {
    const active = await api.get('/squad/active').catch(() => null);
    if (active) return active;
    throw new Error('Could not resolve personaId for active squad');
  }

  const squadId = params.squadId ?? 0;
  try {
    return await api.get(`/squad/${squadId}/user/${personaId}`);
  } catch {
    try {
      return await api.get('/squad/active');
    } catch (error) {
      throw error;
    }
  }
}

async function searchMarket(api, params) {
  const queryParams = { num: 20 };
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
  return api.get('/transfermarket', queryParams);
}

async function getClubPlayers(api, params = {}) {
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

    const page = await api.get('/club', queryParams);
    const items = page?.itemData || page?.items || [];
    allItems.push(...items);
    if (items.length < pageSize) break;
    start += pageSize;
  }

  return { itemData: allItems.slice(0, maxTotal), total: allItems.length };
}

/** EA ItemPile.STORAGE — SBC / duplicate storage pile. */
const SBC_STORAGE_PILE = 10;

async function getSbcStoragePlayers(api, params = {}) {
  const pageSize = Math.min(params.count || 91, 91);
  const maxTotal = params.max_total || 100;
  const pileCandidates = [SBC_STORAGE_PILE, 9, 8];
  let lastError;

  for (const pile of pileCandidates) {
    try {
      let start = 0;
      const allItems = [];
      while (allItems.length < maxTotal) {
        const queryParams = {
          sort: params.sort || 'asc',
          type: 'player',
          count: pageSize,
          start,
          pile,
        };
        if (params.min_rating) queryParams.minrating = params.min_rating;
        if (params.max_rating) queryParams.maxrating = params.max_rating;

        const page = await api.get('/club', queryParams);
        const items = page?.itemData || page?.items || [];
        allItems.push(...items);
        if (items.length < pageSize) break;
        start += pageSize;
      }

      if (allItems.length) {
        return { itemData: allItems.slice(0, maxTotal), total: allItems.length, pile };
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return { itemData: [], total: 0 };
}

async function getSbcSetChallenges(api, setId) {
  const paths = [
    `/sbs/setId/${setId}/challenges`,
    `/sbs/sets/${setId}/challenges`,
    `/sbs/setid/${setId}/challenges`,
  ];

  let lastError;
  for (const path of paths) {
    try {
      return await api.get(path);
    } catch (error) {
      lastError = error;
      if (error.status !== 404) throw error;
    }
  }
  throw lastError || new Error(`No challenges found for set ${setId}`);
}
