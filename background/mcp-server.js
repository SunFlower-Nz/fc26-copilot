/**
 * FC26 Copilot — MCP Server (Streamable HTTP)
 *
 * Implements the MCP protocol over HTTP, allowing Claude (or any MCP client)
 * to discover and call tools exposed by this extension.
 */

import { sessionMonitor } from './session-monitor.js';
import { rateLimiter } from './rate-limiter.js';
import { logger } from '../shared/logger.js';

import { marketTools } from './tools/market-tools.js';
import { clubTools } from './tools/club-tools.js';
import { tradepileTools } from './tools/tradepile-tools.js';
import { sbcTools } from './tools/sbc-tools.js';
import { priceTools } from './tools/price-tools.js';
import { cacheTools } from './tools/cache-tools.js';
import { analyticsTools } from './tools/analytics-tools.js';
import { checkToolAccess, listToolsWithMeta } from './mode-guard.js';

class MCPServer {
  constructor() {
    /** @type {Map<string, Object>} */
    this.tools = new Map();
    this.serverInfo = {
      name: 'fut-pilot',
      version: '2.4.2',
    };
    this.initialized = false;
  }

  /**
   * Register all tool definitions
   */
  registerTools() {
    const allTools = [
      ...marketTools,
      ...clubTools,
      ...tradepileTools,
      ...sbcTools,
      ...priceTools,
      ...cacheTools,
      ...analyticsTools,
      // Session tools are built-in
      {
        name: 'get_session_status',
        description:
          'Check if the FC26 web app tab is open, the session is authenticated, and the extension is connected.',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => {
          const status = sessionMonitor.getStatus();
          const rateStats = rateLimiter.getStats();
          return {
            success: true,
            data: { session: status, rateLimits: rateStats },
          };
        },
      },
      {
        name: 'reset_rate_limits',
        description:
          'Clear extension rate-limit full stop and backoffs (e.g. after false-positive EA 494). Does not affect EA server limits.',
        inputSchema: {
          type: 'object',
          properties: {
            confirm: { type: 'boolean', description: 'Must be true to reset' },
          },
        },
        handler: async (params) => {
          if (!params.confirm) {
            return {
              success: false,
              error: 'Confirmation required. Re-call with confirm: true.',
            };
          }
          rateLimiter.clearFullStop();
          rateLimiter.clearBackoffs();
          return {
            success: true,
            data: { message: 'Rate limit full stop and backoffs cleared.', stats: rateLimiter.getStats() },
          };
        },
      },
      {
        name: 'keepalive',
        description:
          'Send a keepalive ping to EA servers to prevent session timeout. Should be called every 5-8 minutes during active use.',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => {
          const { callEA } = await import('./bridge.js');

          await rateLimiter.throttle('keepalive');
          try {
            const result = await callEA('keepalive', {});
            sessionMonitor.recordKeepalive();
            logger.info('Keepalive sent');
            return { success: true, data: result };
          } catch (error) {
            logger.error('Keepalive failed', { error: error.message });
            return { success: false, error: error.message };
          }
        },
      },
    ];

    for (const tool of allTools) {
      this.tools.set(tool.name, tool);
    }

    logger.info('MCP tools registered', { count: this.tools.size });
  }

  /**
   * Handle an incoming MCP JSON-RPC request
   * @param {Object} request - JSON-RPC 2.0 request
   * @returns {Object} JSON-RPC 2.0 response
   */
  async handleRequest(request) {
    const { method, params, id } = request;

    try {
      switch (method) {
        case 'initialize':
          return this._handleInitialize(id, params);

        case 'tools/list':
          return this._handleToolsList(id);

        case 'tools/call':
          return await this._handleToolCall(id, params);

        case 'ping':
          return { jsonrpc: '2.0', id, result: {} };

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: ${method}` },
          };
      }
    } catch (error) {
      logger.error('MCP request error', { method, error: error.message });
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: error.message },
      };
    }
  }

  _handleInitialize(id, params) {
    this.initialized = true;
    logger.info('MCP client connected', {
      clientInfo: params?.clientInfo,
    });

    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2025-03-26',
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: this.serverInfo,
      },
    };
  }

  _handleToolsList(id) {
    const tools = listToolsWithMeta(this.tools);

    return {
      jsonrpc: '2.0',
      id,
      result: { tools },
    };
  }

  async _handleToolCall(id, params) {
    const { name, arguments: args } = params;
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: `Unknown tool: ${name}` },
      };
    }

    const access = await checkToolAccess(tool, args || {});
    if (!access.allowed) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                needsConfirmation: access.needsConfirmation || false,
                error: access.error,
              }),
            },
          ],
          isError: !access.needsConfirmation,
        },
      };
    }

    try {
      const result = await tool.handler(args || {});

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success,
        },
      };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error.message,
              }),
            },
          ],
          isError: true,
        },
      };
    }
  }
}

export const mcpServer = new MCPServer();
