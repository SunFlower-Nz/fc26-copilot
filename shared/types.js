/**
 * FC26 Copilot — JSDoc type definitions
 */

/**
 * @typedef {Object} AuctionItem
 * @property {number} tradeId
 * @property {number} buyNowPrice
 * @property {number} currentBid
 * @property {number} startingBid
 * @property {number} expires - seconds remaining
 * @property {string} tradeState - 'active' | 'closed' | 'expired'
 * @property {ItemData} itemData
 */

/**
 * @typedef {Object} ItemData
 * @property {number} assetId
 * @property {number} id - unique item instance ID
 * @property {string} name
 * @property {number} rating
 * @property {string} position
 * @property {string} nation
 * @property {string} league
 * @property {string} club
 * @property {boolean} untradeable
 */

/**
 * @typedef {Object} SearchParams
 * @property {string} [type] - 'player' | 'consumable' | 'development'
 * @property {string} [player_name]
 * @property {string} [quality] - 'bronze' | 'silver' | 'gold' | 'special'
 * @property {string} [position]
 * @property {string} [chemistry_style]
 * @property {number} [nation_id]
 * @property {number} [league_id]
 * @property {number} [club_id]
 * @property {number} [min_price]
 * @property {number} [max_price]
 * @property {number} [min_bid]
 * @property {number} [max_bid]
 * @property {number} [min_rating]
 * @property {number} [max_rating]
 * @property {number} [page]
 */

/**
 * @typedef {Object} RateLimitConfig
 * @property {number} minDelay
 * @property {number} maxDelay
 * @property {number} maxPerHour
 * @property {number} maxPerDay
 */

/**
 * @typedef {Object} SessionState
 * @property {boolean} isAuthenticated
 * @property {string|null} sessionId
 * @property {string|null} phishingToken
 * @property {number|null} sessionStartTime
 * @property {number|null} lastKeepalive
 * @property {number|null} lastActivity
 */

/**
 * @typedef {Object} BridgeRequest
 * @property {string} type - MESSAGE_TYPES.REQUEST
 * @property {string} requestId - UUID
 * @property {string} method
 * @property {Object} params
 */

/**
 * @typedef {Object} BridgeResponse
 * @property {string} type - MESSAGE_TYPES.RESPONSE
 * @property {string} requestId
 * @property {*} [result]
 * @property {string} [error]
 */

/**
 * @typedef {Object} ToolResult
 * @property {boolean} success
 * @property {*} [data]
 * @property {string} [error]
 * @property {boolean} [requiresConfirmation]
 * @property {string} [message]
 */

/**
 * @typedef {Object} TransactionLog
 * @property {string} timestamp
 * @property {string} action
 * @property {number} [tradeId]
 * @property {string} [player]
 * @property {number} [rating]
 * @property {number} [purchasePrice]
 * @property {number} [sellPrice]
 * @property {number} [marketValue]
 * @property {number} [expectedProfit]
 * @property {number} [coinBalanceAfter]
 */

export {};
