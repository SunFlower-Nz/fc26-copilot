/**
 * FC26 Copilot — Background service worker (entry point)
 */

import { mcpServer } from './mcp-server.js';
import { sessionMonitor } from './session-monitor.js';
import { rateLimiter } from './rate-limiter.js';
import { logger } from '../shared/logger.js';
import { discoverFutTabsOnStartup, ensureFutTab } from './tab-manager.js';
import { connectNativeHost, getNativeStatus } from './native-messaging.js';
import {
  getStoredSbcAnalysis,
  startAnalyzeSbcsJob,
  getAnalyzeJobStatus,
  runCompleteSbcFromPopup,
} from './popup-sbc.js';

mcpServer.registerTools();
logger.info('FUT Pilot service worker started');

discoverFutTabsOnStartup();
connectNativeHost();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'contentScriptReady':
      if (sender.tab?.id) {
        sessionMonitor.attachTab(sender.tab.id);
        logger.info('Content script ready', { tabId: sender.tab.id });
      }
      break;

    case 'sessionUpdate':
      sessionMonitor.updateSession(
        message.sessionId,
        message.phishingToken,
        sender.tab?.id,
        message.eaBaseUrl
      );
      break;

    case 'getSessionRestore':
      sendResponse({ payload: sessionMonitor.getRestorePayload() });
      return true;

    case 'getStatus':
      sendResponse({
        session: sessionMonitor.getStatus(),
        rateLimits: rateLimiter.getStats(),
        mcpConnected: mcpServer.initialized,
        nativeMessaging: getNativeStatus(),
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

    case 'getClubAnalytics': {
      const tool = mcpServer.tools.get('get_club_analytics');
      if (tool) {
        tool
          .handler({
            force_refresh: Boolean(message.force_refresh),
            use_futbin: message.use_futbin !== false,
          })
          .then((result) => sendResponse(result));
      } else {
        sendResponse({ success: false, error: 'Analytics not available' });
      }
      return true;
    }

    case 'getSbcAnalysis': {
      getStoredSbcAnalysis().then((data) => {
        sendResponse({ success: true, data });
      });
      return true;
    }

    case 'analyzeSbcs': {
      startAnalyzeSbcsJob({
        daily_only: message.daily_only !== false,
        force_refresh: message.force_refresh === true,
      })
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case 'getAnalyzeJobStatus': {
      getAnalyzeJobStatus()
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case 'completeSbc': {
      runCompleteSbcFromPopup({
        challenge_id: message.challenge_id,
        set_id: message.set_id,
        challenge_name: message.challenge_name,
        refresh_pool: message.refresh_pool === true,
      })
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  sessionMonitor.onTabClosed(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('ultimate-team/web-app')) {
    sessionMonitor.attachTab(tabId);
  }

  if (
    tabId === sessionMonitor.webAppTabId &&
    changeInfo.url &&
    !changeInfo.url.includes('ea.com/ea-sports-fc/ultimate-team/web-app')
  ) {
    sessionMonitor.onTabClosed(tabId);
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'fc26_keepalive') return;
  if (!sessionMonitor.hasCredentials()) return;

  try {
    const keepaliveTool = mcpServer.tools.get('keepalive');
    if (keepaliveTool) {
      await keepaliveTool.handler({});
    }
  } catch (error) {
    logger.error('Auto-keepalive failed', { error: error.message });
    if (!sessionMonitor.tabConnected) {
      await ensureFutTab({ openIfMissing: true });
    }
  }
});

chrome.runtime.onStartup.addListener(() => {
  discoverFutTabsOnStartup();
  connectNativeHost();
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!message.jsonrpc) {
    sendResponse({ error: 'Not a JSON-RPC request' });
    return true;
  }

  mcpServer.handleRequest(message).then((response) => {
    sendResponse(response);
  });
  return true;
});

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

console.log('[FUT Pilot] Service worker initialized');
