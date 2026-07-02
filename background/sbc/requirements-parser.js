/**
 * Parse EA SBC challenge payloads into normalized constraints for the solver.
 */

const PLAYER_LEVEL_MAP = {
  0: 'bronze',
  1: 'silver',
  2: 'gold',
  3: 'special',
  bronze: 'bronze',
  silver: 'silver',
  gold: 'gold',
  special: 'special',
};

function toInt(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}

function normalizeLevel(level) {
  if (level === undefined || level === null) return null;
  if (typeof level === 'string') return PLAYER_LEVEL_MAP[level.toLowerCase()] || level.toLowerCase();
  return PLAYER_LEVEL_MAP[level] || null;
}

function ratingFromLevel(level) {
  switch (level) {
    case 'bronze':
      return { min: 45, max: 64 };
    case 'silver':
      return { min: 65, max: 74 };
    case 'gold':
      return { min: 75, max: 99 };
    default:
      return null;
  }
}

/**
 * @param {Object} challengeData - Raw EA challenge response
 * @returns {import('./types.js').SbcConstraints}
 */
export function parseSbcRequirements(challengeData) {
  const challenge = challengeData?.challenge || challengeData;
  const elgReq =
    challenge?.elgReq ||
    challengeData?.elgReq ||
    challenge?.eligibilityRequirements ||
    challengeData?.eligibilityRequirements ||
    [];
  const formation = challenge?.formation || challengeData?.formation || 'f433';

  const constraints = {
    challengeId: toInt(challenge?.challengeId ?? challengeData?.challengeId),
    setId: toInt(challenge?.setId ?? challengeData?.setId),
    name: challenge?.name || challengeData?.name || challenge?.description || 'SBC',
    squadSize: toInt(challenge?.squadSize ?? challengeData?.squadSize, 11),
    formation,
    minTeamRating: null,
    maxTeamRating: null,
    minChemistry: null,
    playerCount: null,
    minPlayerCount: null,
    maxPlayerCount: null,
    playerRequirements: [],
    eligibility: {
      repeatable: Boolean(challenge?.repeatable ?? challengeData?.repeatable),
      expiresAt: challenge?.endTime ?? challengeData?.endTime ?? null,
      completed: Boolean(challenge?.status === 'COMPLETED' || challengeData?.status === 'COMPLETED'),
    },
  };

  for (const req of elgReq) {
    const type = (req.type || req.eligibilityType || '').toUpperCase();
    const value = req.value ?? req.eligibilityValue;
    const count = toInt(req.count ?? req.eligibilityCount, 1);

    switch (type) {
      case 'PLAYER_COUNT':
      case 'SQUAD_SIZE': {
        const scope = (req.scope || req.eligibilityScope || '').toLowerCase();
        if (scope) {
          constraints.playerRequirements.push({
            type: 'SCOPE_COUNT',
            scope,
            value: toInt(value),
            count,
          });
        } else {
          constraints.playerCount = count;
          constraints.squadSize = count;
        }
        break;
      }
      case 'TEAM_RATING':
      case 'SQUAD_RATING':
        constraints.minTeamRating = toInt(value, constraints.minTeamRating);
        break;
      case 'CHEMISTRY_POINTS':
      case 'TEAM_CHEMISTRY':
        constraints.minChemistry = toInt(value, constraints.minChemistry);
        break;
      case 'PLAYER_LEVEL':
      case 'PLAYER_QUALITY':
      case 'EXACT_PLAYER_QUALITY': {
        const level = normalizeLevel(value);
        const reqCount = toInt(req.count ?? req.eligibilityCount, constraints.squadSize || 11);
        constraints.playerRequirements.push({
          type: 'PLAYER_LEVEL',
          level,
          count: reqCount,
          ratingRange: ratingFromLevel(level),
        });
        if (reqCount > 1) {
          constraints.playerCount = Math.max(constraints.playerCount || 0, reqCount);
          constraints.squadSize = Math.max(constraints.squadSize || 0, reqCount);
        }
        break;
      }
      case 'NUMBER_OF_PLAYERS_IN_THE_SQUAD':
      case 'SQUAD_PLAYER_COUNT': {
        const squadCount = toInt(value ?? count, 11);
        constraints.playerCount = squadCount;
        constraints.squadSize = squadCount;
        break;
      }
      case 'PLAYER_RARITY':
      case 'PLAYER_RARITY_GROUP':
        constraints.playerRequirements.push({
          type: 'PLAYER_RARITY',
          rarity: toInt(value),
          count,
        });
        break;
      case 'SCOPE':
      case 'PLAYER_SCOPE': {
        const scope = (req.scope || req.eligibilityScope || '').toLowerCase();
        constraints.playerRequirements.push({
          type: 'SCOPE_COUNT',
          scope,
          value: toInt(value),
          count,
        });
        break;
      }
      case 'SAME_LEAGUE_COUNT':
      case 'SAME_NATION_COUNT':
      case 'SAME_CLUB_COUNT':
        constraints.playerRequirements.push({
          type,
          count: toInt(value, count),
        });
        break;
      case 'LEAGUE_COUNT':
      case 'NATION_COUNT':
      case 'CLUB_COUNT':
        constraints.playerRequirements.push({
          type,
          minUnique: toInt(value, count),
        });
        break;
      default:
        constraints.playerRequirements.push({
          type: type || 'UNKNOWN',
          raw: req,
        });
        break;
    }
  }

  // Upgrade challenges often only specify implicit squad size via formation slots
  if (!constraints.playerCount && constraints.squadSize) {
    constraints.playerCount = constraints.squadSize;
  }

  // Daily upgrade SBCs: single slot — cap mis-parsed level counts
  if ((constraints.playerCount || constraints.squadSize) === 1) {
    constraints.playerCount = 1;
    constraints.squadSize = 1;
    for (const req of constraints.playerRequirements) {
      if (req.type === 'PLAYER_LEVEL' && req.count > 1) {
        req.count = 1;
      }
    }
  }

  return constraints;
}

/**
 * Infer simple upgrade constraints when elgReq is sparse.
 * @param {import('./types.js').SbcConstraints} constraints
 * @param {string} challengeName
 */
function hasParsedSquadRequirements(constraints) {
  if ((constraints.playerCount || 0) > 1) return true;
  if ((constraints.squadSize || 0) > 1 && constraints.playerRequirements.length > 0) return true;
  return constraints.playerRequirements.some(
    (r) => r.type === 'PLAYER_LEVEL' && (r.count || 0) > 1
  );
}

function setLevelRequirement(constraints, level, count) {
  const range = ratingFromLevel(level);
  constraints.squadSize = count;
  constraints.playerCount = count;
  constraints.playerRequirements = [
    ...constraints.playerRequirements.filter((r) => r.type !== 'PLAYER_LEVEL'),
    { type: 'PLAYER_LEVEL', level, count, ratingRange: range },
  ];
}

/**
 * Infer upgrade constraints when elgReq is sparse.
 * FC26 Silver Upgrade = 11 pratas exatas (não 1 carta).
 * @param {import('./types.js').SbcConstraints} constraints
 * @param {string} challengeName
 */
export function applyUpgradeHeuristics(constraints, challengeName = '') {
  const name = (challengeName || constraints.name || '').toLowerCase();

  if (hasParsedSquadRequirements(constraints)) {
    return constraints;
  }

  if (name.includes('daily')) {
    if (name.includes('bronze')) {
      setLevelRequirement(constraints, 'bronze', 1);
    } else if (name.includes('silver') || name.includes('prata')) {
      setLevelRequirement(constraints, 'silver', 1);
    } else if (name.includes('gold') || name.includes('ouro')) {
      setLevelRequirement(constraints, 'gold', 1);
    }
    return constraints;
  }

  if (name.includes('bronze upgrade') || name.includes('melhoria de bronze')) {
    setLevelRequirement(constraints, 'bronze', 1);
  } else if (name.includes('silver upgrade') || name.includes('melhoria de prata')) {
    setLevelRequirement(constraints, 'silver', 11);
  } else if (name.includes('gold upgrade') || name.includes('melhoria de ouro')) {
    setLevelRequirement(constraints, 'gold', 5);
  }

  return constraints;
}

export function getRequiredPlayerCount(constraints) {
  if (constraints.playerCount) return constraints.playerCount;
  const levelReqs = constraints.playerRequirements.filter((r) => r.type === 'PLAYER_LEVEL');
  if (levelReqs.length === 1 && levelReqs[0].count) return levelReqs[0].count;
  if (levelReqs.length > 0) {
    const maxLevelCount = Math.max(...levelReqs.map((r) => r.count || 0));
    if (maxLevelCount > 0) return maxLevelCount;
  }
  return constraints.squadSize || 11;
}
