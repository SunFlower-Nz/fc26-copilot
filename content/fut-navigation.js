/**
 * FUT Pilot — Web App SBC navigation (page context)
 *
 * Opens SBC hub and challenge screens using EA internal controllers,
 * with DOM click fallbacks when needed.
 */

import {
  FUT_CONTROLLERS,
  FUT_DOM_MAP_VERSION,
  FUT_NAV_TIMEOUTS,
  FUT_SELECTORS,
  futLabelIncludes,
  isSbcHubView,
  isSbcSquadView,
} from '../shared/fut-dom-map.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getGlobal(name) {
  try {
    return window[name];
  } catch {
    return undefined;
  }
}

function getServices() {
  return getGlobal('services') || null;
}

function getAppMainFn() {
  const fn = getGlobal('getAppMain');
  return typeof fn === 'function' ? fn : null;
}

/**
 * Current FUT view controller (same pattern as community scripts).
 */
export function getCurrentController() {
  const getAppMain = getAppMainFn();
  if (!getAppMain) return null;
  try {
    return getAppMain()
      .getRootViewController()
      .getPresentedViewController()
      .getCurrentViewController()
      .getCurrentController();
  } catch {
    return null;
  }
}

function isPhoneLayout() {
  const fn = getGlobal('isPhone');
  if (typeof fn === 'function') {
    try {
      return Boolean(fn());
    } catch {
      return false;
    }
  }
  try {
    const persona = getServices()?.User?.getUser?.()?.getSelectedPersona?.();
    if (persona && 'isPhone' in persona) return Boolean(persona.isPhone);
    if (persona && 'isPC' in persona) return !persona.isPC;
  } catch {
    // ignore
  }
  return false;
}

function observeOnce(observable, context, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    if (!observable?.observe) {
      reject(new Error('Invalid observable'));
      return;
    }
    const timeout = setTimeout(() => {
      reject(new Error('FUT navigation observe timeout'));
    }, timeoutMs);
    observable.observe(context, (sender, response) => {
      try {
        sender.unobserve(context);
      } catch {
        // ignore
      }
      clearTimeout(timeout);
      resolve(response);
    });
  });
}

async function waitFor(predicate, timeoutMs = FUT_NAV_TIMEOUTS.hubMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const value = predicate();
      if (value) return value;
    } catch {
      // retry
    }
    await sleep(FUT_NAV_TIMEOUTS.pollMs);
  }
  return null;
}

function simulateClick(element) {
  if (!element) return false;
  const opts = { bubbles: true, cancelable: true, view: window };
  element.dispatchEvent(new MouseEvent('pointerdown', opts));
  element.dispatchEvent(new MouseEvent('mousedown', opts));
  element.dispatchEvent(new MouseEvent('mouseup', opts));
  element.dispatchEvent(new MouseEvent('click', opts));
  if (typeof element.click === 'function') element.click();
  return true;
}

function tapTile(tile) {
  if (!tile) return false;
  if (typeof tile.tapDetected === 'function') {
    tile.tapDetected();
    return true;
  }
  if (typeof tile._tapDetected === 'function') {
    tile._tapDetected();
    return true;
  }
  if (tile.__root) return simulateClick(tile.__root);
  return simulateClick(tile);
}

function findTileByLabel(selector, label) {
  const nodes = document.querySelectorAll(selector);
  for (const node of nodes) {
    const text = node.textContent || '';
    if (futLabelIncludes(text, label)) return node;
  }
  return null;
}

async function waitForAppReady(timeoutMs = FUT_NAV_TIMEOUTS.appReadyMs) {
  const ready = await waitFor(() => getServices()?.SBC && getCurrentController(), timeoutMs);
  if (!ready) {
    throw new Error('FUT Web App not ready. Open Home in the Web App and wait for it to load.');
  }
  return ready;
}

async function ensureSbcRepository() {
  const services = getServices();
  const controller = getCurrentController();
  if (!services?.SBC) throw new Error('services.SBC unavailable');

  const sets = services.SBC.repository?.getSets?.() || [];
  if (sets.length > 0) return sets;

  const response = await observeOnce(services.SBC.requestSets(), controller);
  if (!response?.success) {
    throw new Error('Failed to load SBC sets from Web App');
  }
  return services.SBC.repository?.getSets?.() || [];
}

export function getNavigationState() {
  const controller = getCurrentController();
  return {
    ready: Boolean(getServices()?.SBC && controller),
    controller: controller?.className || null,
    onSbcHub: isSbcHubView(controller?.className),
    onSbcSquad: isSbcSquadView(controller?.className),
    challengeId: controller?._challengeId ?? controller?._challenge?.id ?? null,
    setId: controller?._set?.id ?? null,
    mapVersion: FUT_DOM_MAP_VERSION,
  };
}

/**
 * Navigate to the SBC hub screen.
 * @param {Object} [options]
 * @param {string} [options.setName] — optional, open set list after hub
 */
export async function navigateToSbcHub(options = {}) {
  await waitForAppReady();

  let controller = getCurrentController();
  if (isSbcHubView(controller?.className)) {
    return { success: true, method: 'already_open', controller: controller.className };
  }

  if (controller?.className === FUT_CONTROLLERS.HOME) {
    const sbcTile = controller.getView?.()?._sbcTile;
    if (tapTile(sbcTile)) {
      const hub = await waitFor(() => {
        const c = getCurrentController();
        return isSbcHubView(c?.className) ? c : null;
      }, FUT_NAV_TIMEOUTS.hubMs);
      if (hub) {
        return { success: true, method: 'home_tile', controller: hub.className };
      }
    }
  }

  const domTile =
    document.querySelector(FUT_SELECTORS.homeSbcTile)
    || findTileByLabel('.ut-tile-view', 'squad building')
    || findTileByLabel('.ut-tile-view', 'desafios de elenco')
    || findTileByLabel('.ut-tile-view', 'dme');

  if (domTile && simulateClick(domTile)) {
    const hub = await waitFor(() => {
      const c = getCurrentController();
      return isSbcHubView(c?.className) ? c : null;
    }, FUT_NAV_TIMEOUTS.hubMs);
    if (hub) {
      return { success: true, method: 'dom_home_tile', controller: hub.className };
    }
  }

  return {
    success: false,
    error: 'Could not open SBC hub. Navigate to Home in the Web App and retry.',
    controller: controller?.className || null,
  };
}

/**
 * Open a specific SBC challenge squad screen.
 * @param {number|string} setId
 * @param {number|string} challengeId
 * @param {Object} [options]
 * @param {string} [options.setName]
 * @param {string} [options.challengeName]
 */
export async function openSbcChallenge(setId, challengeId, options = {}) {
  await waitForAppReady();
  await ensureSbcRepository();

  const services = getServices();
  const numericSetId = Number(setId);
  const numericChallengeId = Number(challengeId);
  let controller = getCurrentController();

  const alreadyOpen =
    isSbcSquadView(controller?.className)
    && String(controller?._challengeId ?? controller?._challenge?.id) === String(challengeId);

  if (alreadyOpen) {
    return {
      success: true,
      method: 'already_open',
      setId: numericSetId,
      challengeId: numericChallengeId,
      controller: controller.className,
    };
  }

  const setEntity = services.SBC.repository.getSetById(numericSetId);
  if (!setEntity) {
    return {
      success: false,
      error: `SBC set ${setId} not found in Web App repository`,
    };
  }

  // Wrong squad screen open — pop so loadChallenge targets the right context
  if (
    isSbcSquadView(controller?.className)
    && String(controller?._challengeId ?? controller?._challenge?.id) !== String(challengeId)
  ) {
    const nav = controller.getNavigationController?.();
    if (nav?.popViewController) {
      nav.popViewController();
      await waitFor(() => {
        const c = getCurrentController();
        return c && !isSbcSquadView(c?.className) ? c : null;
      }, FUT_NAV_TIMEOUTS.hubMs);
      controller = getCurrentController();
    }
  }

  let challengeResponse;
  try {
    challengeResponse = await observeOnce(
      services.SBC.requestChallengesForSet(setEntity),
      controller,
      FUT_NAV_TIMEOUTS.challengeMs
    );
  } catch (err) {
    return { success: false, error: err.message };
  }

  if (!challengeResponse?.success || !challengeResponse.data?.challenges?.length) {
    return { success: false, error: 'Failed to load challenges for SBC set' };
  }

  const challenge =
    challengeResponse.data.challenges.find((c) => String(c.id) === String(challengeId))
    || (options.challengeName
      ? challengeResponse.data.challenges.find((c) => futLabelIncludes(c.name, options.challengeName))
      : null)
    || challengeResponse.data.challenges[0];

  if (!challenge) {
    return { success: false, error: `Challenge ${challengeId} not found in set ${setId}` };
  }

  let loadResponse;
  try {
    loadResponse = await observeOnce(
      services.SBC.loadChallenge(challenge),
      controller,
      FUT_NAV_TIMEOUTS.challengeMs
    );
  } catch (err) {
    return { success: false, error: err.message };
  }

  if (!loadResponse?.success) {
    return { success: false, error: 'Failed to load SBC challenge in Web App' };
  }

  controller = getCurrentController();
  const currentId = controller?._challengeId ?? controller?._challenge?.id;
  if (String(currentId) === String(challenge.id) && isSbcSquadView(controller?.className)) {
    return {
      success: true,
      method: 'load_challenge_only',
      setId: numericSetId,
      challengeId: challenge.id,
      challengeName: challenge.name || options.challengeName || null,
      controller: controller.className,
    };
  }

  const nav = controller?.getNavigationController?.();
  if (!nav) {
    return { success: false, error: 'Navigation controller unavailable' };
  }

  let challengeEntity = setEntity.getChallenge?.(challenge.id);
  if (!challengeEntity && typeof setEntity.addChallenge === 'function') {
    setEntity.addChallenge(challenge);
    challengeEntity = setEntity.getChallenge?.(challenge.id);
  }
  if (challengeEntity) {
    try {
      challengeEntity.update(challenge);
    } catch {
      // EA internal update can fail if squad state is stale — continue to squad open
    }
  }

  const phone = isPhoneLayout();
  const SquadController = phone
    ? getGlobal('UTSBCSquadOverviewViewController')
    : getGlobal('UTSBCSquadSplitViewController');

  if (!SquadController) {
    const domSetTile =
      findTileByLabel(FUT_SELECTORS.sbcSetTile, options.setName || setEntity.name)
      || document.querySelector(FUT_SELECTORS.sbcSetTile);
    if (domSetTile) simulateClick(domSetTile);
    return {
      success: false,
      error: 'SBC squad controller classes not found — Web App may still be loading',
      partial: Boolean(domSetTile),
    };
  }

  const squadController = new SquadController();
  try {
    squadController.initWithSBCSet(setEntity, challenge.id);
  } catch (err) {
    return {
      success: false,
      error: `Failed to open squad view: ${err.message}`,
      setId: numericSetId,
      challengeId: challenge.id,
    };
  }
  nav.pushViewController(squadController);

  const opened = await waitFor(() => {
    const c = getCurrentController();
    if (!isSbcSquadView(c?.className)) return null;
    const openId = c?._challengeId ?? c?._challenge?.id;
    if (openId != null && String(openId) !== String(challenge.id)) return null;
    return c;
  }, FUT_NAV_TIMEOUTS.challengeMs);

  if (!opened) {
    return {
      success: false,
      error: 'Challenge navigation dispatched but squad view did not open',
      setId: numericSetId,
      challengeId: challenge.id,
    };
  }

  return {
    success: true,
    method: 'internal_api',
    setId: numericSetId,
    challengeId: challenge.id,
    challengeName: challenge.name || options.challengeName || null,
    controller: opened.className,
  };
}

/**
 * @param {string} method
 * @param {Object} params
 */
export async function executeDomMethod(method, params = {}) {
  switch (method) {
    case 'getNavigationState':
      return getNavigationState();
    case 'openSbcHub':
      return navigateToSbcHub(params);
    case 'openSbcChallenge':
      return openSbcChallenge(params.setId, params.challengeId, params);
    default:
      throw new Error(`Unknown DOM method: ${method}`);
  }
}
