/**
 * Shared SBC types (JSDoc only).
 */

/**
 * @typedef {Object} SbcConstraints
 * @property {number|null} challengeId
 * @property {number|null} setId
 * @property {string} name
 * @property {number} squadSize
 * @property {string} formation
 * @property {number|null} minTeamRating
 * @property {number|null} maxTeamRating
 * @property {number|null} minChemistry
 * @property {number|null} playerCount
 * @property {Array<Object>} playerRequirements
 * @property {{ repeatable: boolean, expiresAt: string|null, completed: boolean }} eligibility
 */

/**
 * @typedef {Object} ClubPlayer
 * @property {number} id - item instance id
 * @property {number} assetId
 * @property {number} rating
 * @property {number} nation
 * @property {number} leagueId
 * @property {number} teamid
 * @property {boolean} untradeable
 * @property {boolean} rareflag
 * @property {string} [preferredPosition]
 * @property {string} [_name]
 */

/**
 * @typedef {Object} SbcSolution
 * @property {Array<{ slot: number, player: ClubPlayer }>} players
 * @property {number} teamRating
 * @property {number} chemistry
 * @property {number} estimatedValue
 * @property {string[]} warnings
 */

export {};
