/**

 * Operation mode and confirmation guards for write MCP tools.

 *

 * Semi-auto (default): MCP runs everything autonomously EXCEPT irreversible SBC submit.

 * User confirms DME in chat via confirm: true on complete_sbc / submit_sbc.

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



/** Tools that permanently consume players — always need explicit confirm. */

const SBC_SUBMIT_TOOLS = new Set(['apply_sbc_solution', 'submit_sbc']);



/**

 * @returns {Promise<string>}

 */

export async function getOperationMode() {

  const data = await chrome.storage.local.get('fc26_mode');

  return data.fc26_mode || OPERATION_MODES.SEMI_AUTO;

}



/**

 * @param {Object} tool

 * @param {Object} params

 */

export async function checkToolAccess(tool, params = {}) {

  const mode = await getOperationMode();

  const isWrite = WRITE_TOOLS.has(tool.name) || tool.isWrite;



  if (mode === OPERATION_MODES.MONITOR && isWrite) {

    return {

      allowed: false,

      error: 'Monitor mode is active. Switch to Semi-Auto to run MCP operations.',

    };

  }



  if (!tool.requiresConfirmation || params.confirm) {

    return { allowed: true };

  }



  // complete_sbc without confirm → preview only (handler never submits)

  if (tool.name === 'complete_sbc') {

    return { allowed: true };

  }



  // solve_sbc is read-only preview

  if (tool.name === 'solve_sbc' || tool.name === 'analyze_sbcs' || tool.name === 'solve_sbc_set' || tool.name === 'get_club_analytics') {

    return { allowed: true };

  }



  // SBC submit always requires human confirmation

  if (SBC_SUBMIT_TOOLS.has(tool.name)) {

    return {

      allowed: false,

      needsConfirmation: true,

      error:

        'DME submit requires confirmation. Review solve_sbc preview, then re-call with confirm: true.',

    };

  }



  // Semi-auto / auto: allow market and other writes without confirm

  if (mode === OPERATION_MODES.SEMI_AUTO || mode === OPERATION_MODES.AUTO) {

    return { allowed: true };

  }



  // Assisted mode: confirm other writes

  return {

    allowed: false,

    needsConfirmation: true,

    error: 'Confirmation required. Re-call with confirm: true or switch to Semi-Auto mode.',

  };

}



/**

 * @param {Map<string, Object>} tools

 */

export function listToolsWithMeta(tools) {

  const result = [];

  for (const [, tool] of tools) {

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

