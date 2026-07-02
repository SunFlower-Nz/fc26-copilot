/**
 * FC26 MCP Bridge — connects Claude (stdio MCP) to the Chrome extension (chrome.runtime messaging)
 *
 * How it works:
 * 1. This server reads JSON-RPC from stdin (Claude sends MCP requests this way)
 * 2. A bridge page (served at http://localhost:3926) runs in Chrome and connects via WebSocket
 * 3. The bridge page forwards requests to the extension using chrome.runtime.sendMessage
 * 4. Responses flow back: extension → bridge page → WebSocket → stdout
 *
 * Usage:
 *   node server.js [--extension-id=<id>] [--port=3926]
 */

const http = require('http');
const fs = require('path');
const { WebSocketServer } = require('ws');

const args = process.argv.slice(2);
const PORT = parseInt(getArg('--port') || '3926', 10);
const extensionId = getArg('--extension-id') || '';

function getArg(name) {
  const arg = args.find((a) => a.startsWith(name + '='));
  return arg ? arg.split('=')[1] : null;
}

// ── State ────────────────────────────────────────────────────

let bridgeSocket = null;
const pendingRequests = new Map();
let requestCounter = 0;

// ── HTTP Server ──────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // Serve the bridge page
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(getBridgeHTML());
    return;
  }

  // MCP over HTTP (alternative to stdio)
  if (req.url === '/mcp' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const request = JSON.parse(body);
        handleRequest(request).then((response) => {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(JSON.stringify(response));
        });
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' } }));
      }
    });
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// ── WebSocket Server ─────────────────────────────────────────

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  bridgeSocket = ws;
  log('Bridge page connected');

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'response') {
        const pending = pendingRequests.get(msg.requestId);
        if (pending) {
          clearTimeout(pending.timeout);
          pending.resolve(msg.response);
          pendingRequests.delete(msg.requestId);
        }
      }

      if (msg.type === 'status') {
        log(`Extension status: ${msg.connected ? 'connected' : 'not reachable'}`);
      }
    } catch (err) {
      log(`WebSocket parse error: ${err.message}`);
    }
  });

  ws.on('close', () => {
    bridgeSocket = null;
    log('Bridge page disconnected');
    // Reject all pending requests
    for (const [id, pending] of pendingRequests) {
      clearTimeout(pending.timeout);
      pending.resolve({
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: 'Bridge disconnected' },
      });
    }
    pendingRequests.clear();
  });
});

// ── Local MCP Handlers ───────────────────────────────────────
// initialize, tools/list, and ping are handled locally so Claude Code
// can discover tools even before the bridge page is connected.

const TOOL_DEFINITIONS = [
  { name: 'search_transfer_market', description: 'Search the FUT transfer market for player or item listings. Returns auctions with trade IDs, prices, time remaining, and player details.', inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['player','consumable','development'], default: 'player' }, player_name: { type: 'string', description: 'Player name (fuzzy match)' }, quality: { type: 'string', enum: ['bronze','silver','gold','special'] }, position: { type: 'string', description: 'e.g. ST, CAM, CB, GK' }, chemistry_style: { type: 'string' }, nation_id: { type: 'integer' }, league_id: { type: 'integer' }, club_id: { type: 'integer' }, min_price: { type: 'integer' }, max_price: { type: 'integer' }, min_bid: { type: 'integer' }, max_bid: { type: 'integer' }, min_rating: { type: 'integer' }, max_rating: { type: 'integer' }, page: { type: 'integer', default: 0 } } } },
  { name: 'buy_now', description: 'Buy an item at its Buy Now price. IMPORTANT: Always confirm with the user before executing.', inputSchema: { type: 'object', properties: { trade_id: { type: 'integer', description: 'Trade ID from search results' }, max_price: { type: 'integer', description: 'Maximum price willing to pay' } }, required: ['trade_id','max_price'] } },
  { name: 'place_bid', description: 'Place a bid on an active auction. Requires confirmation.', inputSchema: { type: 'object', properties: { trade_id: { type: 'integer' }, bid_amount: { type: 'integer' } }, required: ['trade_id','bid_amount'] } },
  { name: 'list_on_market', description: 'List an item on the transfer market for sale. Item must be in tradepile.', inputSchema: { type: 'object', properties: { item_id: { type: 'integer' }, start_price: { type: 'integer' }, buy_now_price: { type: 'integer' }, duration: { type: 'integer', enum: [3600,10800,21600,43200,86400,259200], default: 3600 } }, required: ['item_id','start_price','buy_now_price'] } },
  { name: 'sell_premium_fodder', description: 'List high-value bronze/silver (Nilsen, Bounou, Guendouzi, Diop…) at EA market average. confirm: true to execute.', inputSchema: { type: 'object', properties: { confirm: { type: 'boolean', default: false }, dry_run: { type: 'boolean', default: false }, min_bronze: { type: 'integer', default: 350 }, min_silver: { type: 'integer', default: 650 }, min_multiplier: { type: 'number', default: 2.5 }, duration: { type: 'integer', enum: [3600,10800,21600,43200,86400,259200], default: 3600 }, use_cache: { type: 'boolean', default: true }, force_refresh: { type: 'boolean', default: false } } } },
  { name: 'get_club_players', description: 'Get players in club (cache by default). force_refresh hits EA.', inputSchema: { type: 'object', properties: { position: { type: 'string' }, min_rating: { type: 'integer' }, max_rating: { type: 'integer' }, is_untradeable: { type: 'boolean' }, count: { type: 'integer', default: 50 }, use_cache: { type: 'boolean', default: true }, force_refresh: { type: 'boolean', default: false } } } },
  { name: 'get_fut_cache', description: 'Read local FUT cache (club, squad, formation, tradepile, etc.).', inputSchema: { type: 'object', properties: { refresh_if_empty: { type: 'boolean', default: false } } } },
  { name: 'refresh_fut_cache', description: 'Manually refresh full FUT cache from EA.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_active_squad', description: 'Get active squad and formation (cache unless force_refresh).', inputSchema: { type: 'object', properties: { force_refresh: { type: 'boolean', default: false } } } },
  { name: 'get_unassigned', description: 'Get all unassigned items (not yet sent to club or tradepile).', inputSchema: { type: 'object', properties: {} } },
  { name: 'send_to_tradepile', description: 'Move an item to the tradepile for selling.', inputSchema: { type: 'object', properties: { item_id: { type: 'integer' } }, required: ['item_id'] } },
  { name: 'send_to_club', description: 'Send an item to the club.', inputSchema: { type: 'object', properties: { item_id: { type: 'integer' } }, required: ['item_id'] } },
  { name: 'get_tradepile', description: 'Get all tradepile items — listed, sold, and expired.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_watchlist', description: 'Get watchlist / transfer targets and their current status.', inputSchema: { type: 'object', properties: {} } },
  { name: 'relist_all', description: 'Relist all expired tradepile items at their previous prices. Requires confirmation.', inputSchema: { type: 'object', properties: {} } },
  { name: 'clear_sold', description: 'Remove all sold items from the tradepile.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_active_sbcs', description: 'Get all currently active SBCs with requirements, rewards, and expiry.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_sbc_sets', description: 'Get SBC categories and sets.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_sbc_requirements', description: 'Get detailed requirements for a specific SBC challenge.', inputSchema: { type: 'object', properties: { sbc_id: { type: 'string' } }, required: ['sbc_id'] } },
  { name: 'get_sbc_squad', description: 'Get current draft squad for an SBC challenge.', inputSchema: { type: 'object', properties: { challenge_id: { type: 'string' } }, required: ['challenge_id'] } },
  { name: 'solve_sbc', description: 'Solve SBC — preview with names and bilingual positions. Use challenge_id (reads EA elgReq).', inputSchema: { type: 'object', properties: { challenge_id: { type: 'string' }, challenge_name: { type: 'string' }, min_rating: { type: 'integer' }, max_rating: { type: 'integer' }, include_unassigned: { type: 'boolean' }, use_cache: { type: 'boolean', default: true }, use_heuristics: { type: 'boolean', default: false } } } },
  { name: 'analyze_sbcs', description: 'Scan all active SBCs, read EA requirements per challenge, rank by feasibility and cost-benefit for your club.', inputSchema: { type: 'object', properties: { category: { type: 'string' }, daily_only: { type: 'boolean', default: false }, max_sets: { type: 'integer', default: 40 }, top_n: { type: 'integer', default: 15 }, try_solve: { type: 'boolean', default: true }, include_completed: { type: 'boolean', default: false }, include_all: { type: 'boolean', default: false }, force_refresh: { type: 'boolean', default: false }, use_cache: { type: 'boolean', default: true } } } },
  { name: 'solve_sbc_set', description: 'Solve all challenges in one SBC set (preview). Reserves players across challenges.', inputSchema: { type: 'object', properties: { set_id: { type: 'string' }, set_name: { type: 'string' }, min_rating: { type: 'integer' }, max_rating: { type: 'integer' }, use_cache: { type: 'boolean', default: true } } } },
  { name: 'apply_sbc_solution', description: 'Apply squad to SBC. Requires confirm: true.', inputSchema: { type: 'object', properties: { challenge_id: { type: 'string' }, item_ids: { type: 'array', items: { type: 'integer' } }, confirm: { type: 'boolean' } }, required: ['challenge_id', 'item_ids'] } },
  { name: 'submit_sbc', description: 'Submit SBC after squad applied. Requires confirm: true.', inputSchema: { type: 'object', properties: { challenge_id: { type: 'string' }, set_id: { type: 'integer' }, confirm: { type: 'boolean' } }, required: ['challenge_id'] } },
  { name: 'complete_sbc', description: 'Single SBC run: solve → apply → submit. confirm: true to execute.', inputSchema: { type: 'object', properties: { challenge_id: { type: 'string' }, challenge_name: { type: 'string' }, set_id: { type: 'integer' }, confirm: { type: 'boolean' }, apply_only: { type: 'boolean' }, min_rating: { type: 'integer' }, max_rating: { type: 'integer' }, use_cache: { type: 'boolean', default: true } } } },
  { name: 'get_club_analytics', description: 'Portfolio analytics: value, investments, P/L, fodder, rating distribution, top gainers/losers.', inputSchema: { type: 'object', properties: { force_refresh: { type: 'boolean', default: false }, use_futbin: { type: 'boolean', default: true }, platform: { type: 'string', enum: ['pc','ps','xbox'], default: 'pc' }, top_n: { type: 'integer', default: 10 } } } },
  { name: 'get_coin_balance', description: 'Get current FUT coin balance.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_player_market_data', description: 'Get price data from FutBin. Does NOT hit EA servers.', inputSchema: { type: 'object', properties: { player_name: { type: 'string' }, asset_id: { type: 'integer' }, platform: { type: 'string', enum: ['pc','ps','xbox'], default: 'pc' } } } },
  { name: 'get_session_status', description: 'Check if web app is open, session is authenticated, and rate limit usage.', inputSchema: { type: 'object', properties: {} } },
  { name: 'keepalive', description: 'Send keepalive ping to EA servers to prevent session timeout.', inputSchema: { type: 'object', properties: {} } },
];

function handleLocally(request) {
  const { method, id, params } = request;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'fut-pilot', version: '2.3.1' },
      },
    };
  }

  if (method === 'notifications/initialized') {
    return null; // notification, no response needed
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0', id,
      result: { tools: TOOL_DEFINITIONS },
    };
  }

  if (method === 'ping') {
    return { jsonrpc: '2.0', id, result: {} };
  }

  return undefined; // not handled locally
}

// ── Forward to Extension ─────────────────────────────────────

function handleRequest(request) {
  // Try local handling first (initialize, tools/list, ping)
  const local = handleLocally(request);
  if (local !== undefined) return Promise.resolve(local);

  // Everything else (tools/call) goes to the extension
  return forwardToExtension(request);
}

function forwardToExtension(request) {
  return new Promise((resolve) => {
    if (!bridgeSocket || bridgeSocket.readyState !== 1) {
      resolve({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Bridge page not connected. Open http://localhost:' + PORT + ' in Chrome, paste your extension ID, and click Connect.' }) }],
          isError: true,
        },
      });
      return;
    }

    const requestId = ++requestCounter;

    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve({
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32000, message: 'Request timeout (120s)' },
      });
    }, 120000);

    pendingRequests.set(requestId, { resolve, timeout });

    bridgeSocket.send(
      JSON.stringify({
        type: 'request',
        requestId,
        mcpRequest: request,
      })
    );
  });
}

// ── stdio MCP Transport ──────────────────────────────────────

let stdinBuffer = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  stdinBuffer += chunk;
  const lines = stdinBuffer.split('\n');
  stdinBuffer = lines.pop(); // keep incomplete line in buffer

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const request = JSON.parse(line);
      handleRequest(request).then((response) => {
        if (response !== null) {
          process.stdout.write(JSON.stringify(response) + '\n');
        }
      });
    } catch (err) {
      // skip unparseable lines
    }
  }
});

process.stdin.on('end', () => {
  log('stdin closed, shutting down');
  process.exit(0);
});

// ── Start ────────────────────────────────────────────────────

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Another bridge server is already running — connect to it as a client
    log(`Port ${PORT} already in use — connecting to existing bridge server`);
    connectAsClient();
    return;
  }
  throw err;
});

server.listen(PORT, () => {
  log(`MCP Bridge running on http://localhost:${PORT}`);
  log(`Open http://localhost:${PORT} in Chrome to connect the bridge`);
  log('Waiting for bridge page...');
});

function connectAsClient() {
  const WebSocket = require('ws');
  const ws = new WebSocket(`ws://localhost:${PORT}`);

  ws.on('open', () => {
    bridgeSocket = ws;
    log('Connected to existing bridge server as client');
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'response') {
        const pending = pendingRequests.get(msg.requestId);
        if (pending) {
          clearTimeout(pending.timeout);
          pending.resolve(msg.response);
          pendingRequests.delete(msg.requestId);
        }
      }
    } catch (err) { /* ignore */ }
  });

  ws.on('close', () => {
    bridgeSocket = null;
    log('Lost connection to bridge server, reconnecting...');
    setTimeout(connectAsClient, 3000);
  });

  ws.on('error', () => {
    log('Cannot reach bridge server — start it manually: node server.js');
  });
}

function log(msg) {
  process.stderr.write(`[FC26 Bridge] ${msg}\n`);
}

// ── Bridge Page HTML ─────────────────────────────────────────

function getBridgeHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>FUT Pilot — MCP Bridge</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f1117; color: #e4e4e7;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #18181b; border-radius: 12px; padding: 32px;
      width: 420px; box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .subtitle { color: #71717a; font-size: 13px; margin-bottom: 24px; }
    label { display: block; font-size: 12px; color: #a1a1aa; margin-bottom: 4px; }
    input {
      width: 100%; padding: 10px 12px; background: #27272a; border: 1px solid #3f3f46;
      border-radius: 6px; color: #fafafa; font-size: 14px; font-family: monospace;
      margin-bottom: 16px; outline: none;
    }
    input:focus { border-color: #60a5fa; }
    button {
      width: 100%; padding: 10px; background: #3b82f6; color: white; border: none;
      border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer;
    }
    button:hover { background: #2563eb; }
    button:disabled { background: #3f3f46; cursor: not-allowed; }
    .status { margin-top: 20px; }
    .status-row {
      display: flex; align-items: center; gap: 8px; padding: 8px 0;
      border-bottom: 1px solid #27272a; font-size: 13px;
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .dot.green { background: #22c55e; }
    .dot.red { background: #ef4444; }
    .dot.yellow { background: #eab308; }
    .log {
      margin-top: 16px; background: #0f1117; border-radius: 6px; padding: 12px;
      font-size: 11px; font-family: monospace; color: #71717a;
      max-height: 150px; overflow-y: auto;
    }
    .log div { padding: 2px 0; }
    .log .ok { color: #4ade80; }
    .log .err { color: #f87171; }
    .log .info { color: #60a5fa; }
  </style>
</head>
<body>
  <div class="card">
    <h1>FUT Pilot</h1>
    <p class="subtitle">MCP Bridge — connects Claude to your extension</p>

    <label for="extId">Extension ID</label>
    <input type="text" id="extId" placeholder="e.g. abcdefghijklmnopqrstuvwxyz123456"
           value="${extensionId}" />

    <button id="connectBtn" onclick="startBridge()">Connect</button>

    <div class="status">
      <div class="status-row">
        <span class="dot" id="dot-ws"></span>
        <span>Bridge Server</span>
        <span style="flex:1"></span>
        <span id="status-ws" style="color:#71717a">--</span>
      </div>
      <div class="status-row">
        <span class="dot" id="dot-ext"></span>
        <span>Extension</span>
        <span style="flex:1"></span>
        <span id="status-ext" style="color:#71717a">--</span>
      </div>
    </div>

    <div class="log" id="log"></div>
  </div>

  <script>
    let ws = null;
    let extId = '';

    // Restore saved extension ID
    const saved = localStorage.getItem('fc26_ext_id');
    if (saved && !document.getElementById('extId').value) {
      document.getElementById('extId').value = saved;
    }

    function addLog(msg, cls = '') {
      const log = document.getElementById('log');
      const div = document.createElement('div');
      div.className = cls;
      div.textContent = new Date().toLocaleTimeString() + ' ' + msg;
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
    }

    function setStatus(id, color, text) {
      document.getElementById('dot-' + id).className = 'dot ' + color;
      document.getElementById('status-' + id).textContent = text;
    }

    function startBridge() {
      extId = document.getElementById('extId').value.trim();
      if (!extId) { alert('Paste your extension ID first'); return; }
      localStorage.setItem('fc26_ext_id', extId);

      document.getElementById('connectBtn').disabled = true;
      connectWebSocket();
    }

    function connectWebSocket() {
      if (ws) { ws.close(); }

      ws = new WebSocket('ws://' + location.host);
      setStatus('ws', 'yellow', 'Connecting...');

      ws.onopen = () => {
        setStatus('ws', 'green', 'Connected');
        addLog('Connected to bridge server', 'ok');
        testExtension();
      };

      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === 'request') {
          addLog('MCP: ' + (msg.mcpRequest.method || 'tools/call'), 'info');

          try {
            const response = await sendToExtension(msg.mcpRequest);
            ws.send(JSON.stringify({
              type: 'response',
              requestId: msg.requestId,
              response: response,
            }));
          } catch (error) {
            ws.send(JSON.stringify({
              type: 'response',
              requestId: msg.requestId,
              response: {
                jsonrpc: '2.0',
                id: msg.mcpRequest.id,
                error: { code: -32000, message: error.message },
              },
            }));
            addLog('Error: ' + error.message, 'err');
          }
        }
      };

      ws.onclose = () => {
        setStatus('ws', 'red', 'Disconnected');
        addLog('Bridge server disconnected, reconnecting...', 'err');
        setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = () => {
        setStatus('ws', 'red', 'Error');
      };
    }

    function sendToExtension(request) {
      return new Promise((resolve, reject) => {
        if (!chrome.runtime || !chrome.runtime.sendMessage) {
          reject(new Error('chrome.runtime not available — is this page open in Chrome?'));
          return;
        }

        chrome.runtime.sendMessage(extId, request, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        });
      });
    }

    function testExtension() {
      setStatus('ext', 'yellow', 'Testing...');

      sendToExtension({ jsonrpc: '2.0', id: 0, method: 'ping', params: {} })
        .then(() => {
          setStatus('ext', 'green', 'Connected');
          addLog('Extension reachable', 'ok');
          ws.send(JSON.stringify({ type: 'status', connected: true }));
        })
        .catch((err) => {
          setStatus('ext', 'red', 'Not reachable');
          addLog('Extension error: ' + err.message, 'err');
          addLog('Make sure the extension is installed and the ID is correct', 'err');
        });
    }

    // Auto-connect if extension ID is available
    const autoId = document.getElementById('extId').value;
    if (autoId) { startBridge(); }
  </script>
</body>
</html>`;
}
