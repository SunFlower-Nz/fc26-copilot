/**
 * Operation mode and confirmation guards for write MCP tools.
 */

import { OPERATION_MODES } from '../shared/constants.js';

const WRITE_TOOLS = new Set([
  'buy_now',
  'place_bid',
  'list_on_market',
  'relist_all',
  'apply_sbc_solution',
  'submit_sbc',
  'complete_sbc',
]);

/**
 * @param {string} toolName
 * @returns {Promise<string>}
 */
export async function getOperationMode() {
  const data = await chrome.storage.local.get('fc26_mode');
  return data.fc26_mode || OPERATION_MODES.ASSISTED;
}

/**
 * @param {Object} tool
 * @param {Object} params
 * @returns {Promise<{ allowed: boolean, needsConfirmation?: boolean, error?: string }>}
 */
export async function checkToolAccess(tool, params = {}) {
  const mode = await getOperationMode();
  const isWrite = WRITE_TOOLS.has(tool.name) || tool.isWrite;

  if (mode === OPERATION_MODES.MONITOR && isWrite) {
    return {
      allowed: false,
      error: 'Monitor mode is active. Switch to Assisted or Semi-Auto to perform write operations.',
    };
  }

  if (tool.requiresConfirmation && !params.confirm) {
    if (mode === OPERATION_MODES.AUTO) {
      return { allowed: true };
    }

    if (mode === OPERATION_MODES.SEMI_AUTO && tool.autoConfirmCheap) {
      const cheap = isCheapOperation(tool, params);
      if (cheap) return { allowed: true };
    }

    return {
      allowed: false,
      needsConfirmation: true,
      error:
        'Confirmation required. Review the preview and re-call this tool with confirm: true.',
    };
  }

  return { allowed: true };
}

function isCheapOperation(tool, params) {
  if (tool.name === 'complete_sbc' || tool.name === 'apply_sbc_solution') {
    const maxRating = params.max_rating ?? 82;
    return maxRating <= 82;
  }
  return false;
}

/**
 * @param {Map<string, Object>} tools
 */
export function listToolsWithMeta(tools) {
  const result = [];
  for (const [name, tool] of tools) {
    result.push({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      requiresConfirmation: Boolean(tool.requiresConfirmation),
      isWrite: WRITE_TOOLS.has(tool.name) || Boolean(tool.isWrite),
    });
  }
  return result;
}
