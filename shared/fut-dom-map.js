/**
 * FUT Pilot — Web App DOM / controller map (FC26)
 *
 * Selectors and controller class names for navigating SBC/DME screens.
 * Update this file when EA patches the Web App UI.
 */

export const FUT_DOM_MAP_VERSION = 'fc26-2026-06';

/** @readonly */
export const FUT_CONTROLLERS = {
  HOME: 'UTHomeHubViewController',
  SBC_HUB: 'UTSBCHubViewController',
  SBC_CHALLENGES: 'UTSBCGroupChallengeSplitViewController',
  SBC_CHALLENGES_PHONE: 'UTSBCChallengesViewController',
  SBC_SQUAD: 'UTSBCSquadSplitViewController',
  SBC_SQUAD_PHONE: 'UTSBCSquadOverviewViewController',
  SBC_SQUAD_DETAIL: 'UTSBCSquadDetailPanelViewController',
};

/** CSS selectors — DOM fallback when internal controllers are unavailable */
export const FUT_SELECTORS = {
  clickShield: '.ut-click-shield',
  loader: '.loaderIcon',
  homeSbcTile: '.ut-tile-view--sbc',
  sbcSetTile: '.ut-sbc-set-tile-view',
  sbcChallengeTile: '.ut-sbc-challenge-tile-view',
  challengeRow: '.ut-sbc-challenge-content-view',
  navBack: '.ut-navigation-button-control',
};

export const FUT_NAV_TIMEOUTS = {
  appReadyMs: 60_000,
  hubMs: 15_000,
  challengeMs: 20_000,
  pollMs: 200,
};

/** View controller class names that indicate an open challenge squad screen */
export const SBC_SQUAD_CONTROLLER_NAMES = new Set([
  FUT_CONTROLLERS.SBC_SQUAD,
  FUT_CONTROLLERS.SBC_SQUAD_PHONE,
  FUT_CONTROLLERS.SBC_SQUAD_DETAIL,
]);

/**
 * @param {string|null|undefined} className
 * @returns {boolean}
 */
export function isSbcSquadView(className) {
  if (!className) return false;
  return SBC_SQUAD_CONTROLLER_NAMES.has(className)
    || className.includes('UTSBCSquad');
}

/**
 * @param {string|null|undefined} className
 * @returns {boolean}
 */
export function isSbcHubView(className) {
  return className === FUT_CONTROLLERS.SBC_HUB;
}

/**
 * Normalize set/challenge names for fuzzy DOM text matching.
 * @param {string} value
 */
export function normalizeFutLabel(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * @param {string} haystack
 * @param {string} needle
 */
export function futLabelIncludes(haystack, needle) {
  const h = normalizeFutLabel(haystack);
  const n = normalizeFutLabel(needle);
  if (!h || !n) return false;
  return h.includes(n) || n.includes(h);
}
