/**
 * FC26 Copilot — Background service worker (entry point)
 *
 * Initializes the MCP server, handles chrome.runtime messages from
 * content scripts, manages tab lifecycle, and serves MCP HTTP requests.
 */

import { mcpServer } from './mcp-server.js';
import { sessionMonitor } from './session-monitor.js';
import { rateLimiter } from './rate-limiter.js';
import { logger } from '../shared/logger.js';

// ── Initialize ───────────────────────────────────────────────

mcpServer.registerTools();
logger.info('FC26 Copilot service worker started');

// ── Chrome Runtime Message Handler ───────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'contentScriptReady':
      logger.info('Content script ready', { tabId: sender.tab?.id });
      break;

    case 'sessionUpdate':
      sessionMonitor.updateSession(
        message.sessionId,
        message.phishingToken,
        sender.tab?.id
      );
      break;

    case 'getStatus':
      sendResponse({
        session: sessionMonitor.getStatus(),
        rateLimits: rateLimiter.getStats(),
        mcpConnected: mcpServer.initialized,
      });
      return true;

    case 'getLogs':
      logger.getLogs(message.count || 20).then((logs) => {
        sendResponse({ logs });
      });
      return true;

    case 'getCoinBalance': {
      const coinTool = mcpServer.tools.get('get_coin_balance');
      if (coinTool) {
        coinTool.handler({}).then((result) => {
          sendResponse(result);
        });
      } else {
        sendResponse({ success: false, error: 'Tool not available' });
      }
      return true;
    }
  }
});

// ── Tab Lifecycle ────────────────────────────────────────────

chrome.tabs.onRemoved.addListener((tabId) => {
  sessionMonitor.onTabClosed(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (
    tabId === sessionMonitor.webAppTabId &&
    changeInfo.url &&
    !changeInfo.url.includes('ea.com/ea-sports-fc/ultimate-team/web-app')
  ) {
    // User navigated away from the web app
    sessionMonitor.onTabClosed(tabId);
  }
});

// ── Keepalive Alarm ──────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'fc26_keepalive') return;

  if (!sessionMonitor.state.isAuthenticated) return;

  try {
    const keepaliveTool = mcpServer.tools.get('keepalive');
    if (keepaliveTool) {
      await keepaliveTool.handler({});
    }
  } catch (error) {
    logger.error('Auto-keepalive failed', { error: error.message });
  }
});

// ── MCP HTTP Server ──────────────────────────────────────────
//
// Chrome extensions can't directly create HTTP servers. We use two approaches:
//
// 1. Native messaging host (requires separate install)
// 2. chrome.runtime.onMessageExternal for extension-to-extension communication
// 3. A companion "MCP bridge" page that Claude connects to
//
// For now, we implement approach 2+3: the extension exposes MCP via
// chrome.runtime messaging, and a local bridge page handles HTTP.

/**
 * Handle external messages (from MCP bridge page or other extensions)
 */
chrome.runtime.onMessageExternal.addListener(
  (message, sender, sendResponse) => {
    if (!message.jsonrpc) {
      sendResponse({ error: 'Not a JSON-RPC request' });
      return true;
    }

    mcpServer.handleRequest(message).then((response) => {
      sendResponse(response);
    });
    return true;
  }
);

/**
 * Handle connections via chrome.runtime.connect (long-lived)
 */
chrome.runtime.onConnectExternal.addListener((port) => {
  logger.info('MCP client connected via port', { name: port.name });

  port.onMessage.addListener(async (message) => {
    if (!message.jsonrpc) {
      port.postMessage({ error: 'Not a JSON-RPC request' });
      return;
    }

    const response = await mcpServer.handleRequest(message);
    port.postMessage(response);
  });

  port.onDisconnect.addListener(() => {
    logger.info('MCP client disconnected');
  });
});

// NOTE: Extension service workers cannot intercept fetch events.
// MCP communication uses chrome.runtime.onMessageExternal and
// chrome.runtime.onConnectExternal (see above).
// A companion native messaging host or bridge page can be used
// to expose an HTTP endpoint if needed.

console.log('[FC26 Copilot] Service worker initialized');
