/**
 * Native Messaging bridge — optional alternative to localhost WebSocket bridge.
 */

import { mcpServer } from './mcp-server.js';
import { logger } from '../shared/logger.js';

const NATIVE_HOST = 'com.fc26.copilot';
let nativePort = null;
let reconnectTimer = null;

export function connectNativeHost() {
  if (nativePort) return;

  try {
    nativePort = chrome.runtime.connectNative(NATIVE_HOST);

    nativePort.onMessage.addListener(async (message) => {
      if (!message?.jsonrpc) {
        nativePort?.postMessage({
          jsonrpc: '2.0',
          error: { code: -32600, message: 'Not a JSON-RPC request' },
          id: message?.id ?? null,
        });
        return;
      }

      const response = await mcpServer.handleRequest(message);
      nativePort?.postMessage(response);
    });

    nativePort.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError?.message;
      logger.info('Native host disconnected', { error: err || null });
      nativePort = null;
      scheduleReconnect();
    });

    logger.info('Native Messaging host connected', { host: NATIVE_HOST });
  } catch (error) {
    logger.warn('Native Messaging unavailable', { error: error.message });
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectNativeHost();
  }, 15000);
}

export function getNativeStatus() {
  return {
    connected: Boolean(nativePort),
    host: NATIVE_HOST,
  };
}
