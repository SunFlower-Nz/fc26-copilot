# FC26 Copilot

Chrome extension that acts as an MCP server, allowing Claude (or any MCP-compatible LLM) to interact with the EA SPORTS FC 26 Ultimate Team Web App through natural language.

Instead of DOM automation, the extension intercepts the web app's internal HTTP API calls using a JavaScript injection bridge — making it faster and more reliable across web app updates.

**First time?** See [SETUP.md](SETUP.md) for a detailed step-by-step walkthrough from zero to trading.

## Prerequisites

- Google Chrome (or Chromium-based browser)
- Node.js 18+
- An EA account with access to the [FUT Web App](https://www.ea.com/ea-sports-fc/ultimate-team/web-app)

## Build

```bash
cd fc26-copilot
npm install

# Development build (with source maps, auto-rebuild on change)
npm run dev

# Production build (minified)
npm run build
```

Both commands output to the `dist/` folder.

## Install the Extension

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right)
3. Click **Load unpacked**
4. Select the `dist/` folder
5. The FC26 Copilot icon should appear in your toolbar

## Setup

### Step 1 — Open the FUT Web App

1. Go to https://www.ea.com/ea-sports-fc/ultimate-team/web-app
2. Log in to your EA account
3. Wait for the web app to fully load (you should see your club)

The extension automatically:
- Injects into the web app page
- Captures your session credentials (`X-UT-SID`, `X-UT-PHISHING-TOKEN`) from outgoing requests
- Starts sending keepalive pings to prevent session timeout

Click the extension icon to verify — the popup should show:
- **Web App**: Connected (green)
- **Session**: Authenticated (green)

### Step 2 — Connect Claude

The extension exposes MCP tools via `chrome.runtime` messaging. To connect Claude, you need a **bridge** that translates between HTTP and Chrome's messaging API.

#### Option A: Claude Desktop / Claude Code (via Native Messaging Bridge)

You'll need a small native messaging host that proxies MCP JSON-RPC over stdio to the extension. Create a native messaging host manifest and script:

**native-host.json** (register with Chrome):
```json
{
  "name": "com.fc26copilot.mcp",
  "description": "FC26 Copilot MCP Bridge",
  "path": "/path/to/bridge-script.js",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://<YOUR_EXTENSION_ID>/"]
}
```

Then configure Claude Desktop's `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "fc26-copilot": {
      "command": "node",
      "args": ["/path/to/bridge-script.js"],
      "env": {}
    }
  }
}
```

#### Option B: Direct Extension Messaging (from a web page)

Any page can communicate with the extension using `chrome.runtime.sendMessage` if the extension ID is known:

```javascript
const EXTENSION_ID = '<YOUR_EXTENSION_ID>'; // from chrome://extensions

// List available tools
chrome.runtime.sendMessage(EXTENSION_ID, {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list',
  params: {}
}, (response) => {
  console.log('Available tools:', response.result.tools);
});

// Call a tool
chrome.runtime.sendMessage(EXTENSION_ID, {
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/call',
  params: {
    name: 'search_transfer_market',
    arguments: { max_price: 10000, position: 'ST' }
  }
}, (response) => {
  console.log('Search results:', response.result);
});
```

#### Option C: Long-lived Port Connection

For sustained sessions, use `chrome.runtime.connect` for a persistent channel:

```javascript
const port = chrome.runtime.connect(EXTENSION_ID, { name: 'mcp' });

port.onMessage.addListener((response) => {
  console.log('Response:', response);
});

// Initialize
port.postMessage({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { clientInfo: { name: 'my-client' } }
});

// Call tools
port.postMessage({
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/call',
  params: { name: 'get_coin_balance', arguments: {} }
});
```

## Available Tools

### Transfer Market
| Tool | Description | Confirmation |
|------|-------------|:---:|
| `search_transfer_market` | Search the market with filters (player, price, rating, position, etc.) | No |
| `buy_now` | Buy an item at its BIN price | Yes |
| `place_bid` | Place a bid on an auction | Yes |
| `list_on_market` | List a tradepile item for sale (set start price, BIN, duration) | Yes |

### Club & Inventory
| Tool | Description | Confirmation |
|------|-------------|:---:|
| `get_club_players` | Get players in your club (filter by position, rating) | No |
| `get_unassigned` | Get unassigned items (post-pack opening, etc.) | No |
| `send_to_tradepile` | Move an item to the tradepile | No |
| `send_to_club` | Move an item to the club | No |

### Tradepile & Watchlist
| Tool | Description | Confirmation |
|------|-------------|:---:|
| `get_tradepile` | Get all tradepile items (listed, sold, expired) | No |
| `get_watchlist` | Get watchlist / transfer targets | No |
| `relist_all` | Relist all expired tradepile items at previous prices | Yes |
| `clear_sold` | Clear sold items from tradepile | No |

### SBC
| Tool | Description | Confirmation |
|------|-------------|:---:|
| `get_active_sbcs` | List all active Squad Building Challenges | No |
| `get_sbc_requirements` | Get detailed requirements for a specific SBC | No |

### Data & Utility
| Tool | Description | Confirmation |
|------|-------------|:---:|
| `get_coin_balance` | Get current coin balance | No |
| `get_player_market_data` | Get price data from FutBin (does NOT hit EA servers) | No |
| `get_session_status` | Check web app connection, auth state, rate limit usage | No |
| `keepalive` | Ping EA servers to prevent session timeout | No |

**"Confirmation: Yes"** means the tool involves spending coins or modifying your account. Claude should always ask you before executing these.

## Extension Popup

Click the extension icon to see:

- **Connection status** — Web App / Session / MCP server health
- **Session info** — How long you've been active, last keepalive, coin balance
- **Rate limits** — Visual bars showing hourly usage vs. limits for each action type
- **Mode selector** — Monitor / Assisted / Semi-Auto / Auto
- **Activity log** — Recent operations with timestamps

## Operation Modes

| Mode | Behavior |
|------|----------|
| **Monitor** | Read-only. Market data and prices only, no buy/sell. |
| **Assisted** | Claude suggests actions, you confirm each one. **(default)** |
| **Semi-Auto** | Claude executes pre-approved filter trades, confirms big purchases. |
| **Auto** | Full automation within defined parameters. Use carefully. |

## Account Safety

The extension is built around keeping your account safe. All EA API calls go through a rate limiter that enforces:

| Action | Min delay | Max/hour | Max/day |
|--------|-----------|----------|---------|
| Market search | 7-15s | 200 | 2,500 |
| Buy / Bid | 1-3s | 50 | 400 |
| List item | 2-5s | 40 | 300 |
| Relist all | 30-60s | 4 | 20 |
| Club/tradepile read | 3-8s | 80 | 800 |
| Any request (global) | 2-4s | 300 | 3,000 |

All delays include random jitter to avoid fixed-interval patterns. Rate limit state is persisted to storage so it survives browser restarts.

### Automatic protections

- **429 (Rate Limited)** — 5-minute global backoff, rate reduced by 50%
- **461 (Transfer Ban)** — Full stop for 24 hours, no requests at all
- **401 (Session Expired)** — Stops and notifies you to re-login
- **Captcha** — Immediate full stop, manual resolution required
- **Session timer** — Warns you to take a break after 60 minutes

### Things to avoid

- Don't run continuously for more than 60 minutes without a break
- Don't search the same filter repeatedly without variation
- Don't operate between 3:00 AM - 6:00 AM local time
- Don't ignore the break warnings in the popup

## Project Structure

```
fc26-copilot/
├── manifest.json                     # Chrome Manifest V3
├── package.json
├── webpack.config.js
├── background/
│   ├── service-worker.js             # Entry point, message routing, alarms
│   ├── mcp-server.js                 # MCP JSON-RPC protocol handler
│   ├── bridge.js                     # Background -> content script messaging
│   ├── ea-call.js                    # Shared EA API error handling
│   ├── rate-limiter.js               # Per-action + global throttling
│   ├── session-monitor.js            # Auth state, keepalive scheduling
│   └── tools/
│       ├── market-tools.js           # search, buy, bid, list
│       ├── club-tools.js             # club players, unassigned, move items
│       ├── tradepile-tools.js        # tradepile, watchlist, relist, clear
│       ├── sbc-tools.js              # SBC challenges
│       └── price-tools.js            # FutBin lookups, coin balance
├── content/
│   ├── content-script.js             # Bridge: background <-> page
│   └── page-inject.js                # Runs in page context, calls EA HTTP API
├── shared/
│   ├── constants.js                  # Rate limits, error codes, config
│   ├── logger.js                     # Structured logging with rotation
│   └── types.js                      # JSDoc type definitions
└── ui/
    ├── popup.html
    ├── popup.js
    └── popup.css
```

## How It Works

```
Claude / MCP Client
    |
    |  JSON-RPC 2.0 (via chrome.runtime messaging)
    v
Background Service Worker
    |  - MCP protocol handling
    |  - Rate limiting (every call throttled)
    |  - Error code routing (401, 429, 461, etc.)
    |
    |  chrome.tabs.sendMessage
    v
Content Script (isolated world)
    |
    |  window.postMessage
    v
Page Script (EA page context)
    |  - Captures session from intercepted fetch/XHR headers
    |  - Makes direct HTTP calls to EA API using captured session
    v
EA Backend (utas.mob.aem.ea.com)
```

The page script uses **direct HTTP calls** (not internal JS objects) to EA's API. This is more stable across web app updates since the backend API changes less frequently than the frontend code.

## Development Guide

### Adding a new MCP tool

1. **Add the EA API call** in `content/page-inject.js` — add a case to the `executeMethod` switch and write the implementation function using `eaGet`/`eaPut`/`eaDelete`.
2. **Define the tool** in the appropriate file under `background/tools/`:
   ```javascript
   {
     name: 'tool_name',
     description: '...',
     inputSchema: { type: 'object', properties: { ... } },
     handler: async (params) => {
       await rateLimiter.throttle('action_type'); // REQUIRED
       const result = await safeEACall('methodName', params);
       if (result.success) logger.info('...', { ... });
       return result;
     },
   }
   ```
3. The tool auto-registers — `mcp-server.js` imports the tool arrays and registers everything in `registerTools()`. No changes needed there.
4. No changes needed in `content-script.js` — the bridge is generic.

### Critical development rules

**Every EA call must be throttled.** Call `rateLimiter.throttle(actionType)` before every `safeEACall()`. The action type must be a key from `RATE_LIMITS` in `shared/constants.js`. Never change rate limit values without explicit instruction — they are calibrated to avoid detection.

**Always use `safeEACall` from `background/ea-call.js`.** Never call `callEA()` directly from tool handlers. `safeEACall` handles all EA error codes (401, 403, 409, 429, 461, 521) in one place. Never duplicate this error handling.

**Write operations need `requiresConfirmation: true`.** Any tool that spends coins or modifies the account must set this flag so the LLM asks the user before executing.

**Don't use `async` callbacks with `chrome.runtime.onMessage`.** Chrome closes the `sendResponse` channel before async functions resolve. Use `.then()` with `return true`:
```javascript
// Correct
doWork().then((result) => sendResponse(result));
return true;
```

**Extension service workers can't intercept fetch events.** `self.addEventListener('fetch')` is a no-op. MCP uses `chrome.runtime.onMessageExternal` only.

**Persist stateful modules.** Chrome kills idle service workers. Both the rate limiter and session monitor persist to `chrome.storage.local` and restore on startup. Follow this pattern for any new stateful module.

### Error code chain

Error codes must survive the full path: `page-inject` → `content-script` → `bridge` → `ea-call`. If you touch error handling anywhere in the chain, verify that HTTP status codes reach `safeEACall` by checking:

- `page-inject.js` — `error.status` set from `response.status`
- `content-script.js` — `errorCode` included in message to background
- `bridge.js` — `error.status` and `error.code` set from `response.errorCode`

### EA API reference

Base URL: `https://utas.mob.aem.ea.com/ut/game/fc26`

All requests require headers: `X-UT-SID`, `X-UT-PHISHING-TOKEN`, `Content-Type: application/json`.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/transfermarket` | GET | Search with query params |
| `/trade/{tradeId}/bid` | PUT | Buy now or place bid |
| `/item` | PUT | List item for sale |
| `/tradepile` | GET | Get tradepile items |
| `/tradepile` | DELETE | Clear sold items |
| `/watchlist` | GET | Get watchlist |
| `/auctionhouse/relist` | PUT | Relist expired items |
| `/club?type=1` | GET | Get club players |
| `/item/{itemId}` | PUT | Move item (to club/tradepile) |
| `/user/credits` | GET | Coin balance |
| `/sbs/challenge` | GET | Active SBCs |
| `/sbs/challenge/{id}` | GET | SBC requirements |
| `/sbs/challenge/{id}/squad` | GET/PUT | Read/apply SBC squad |
| `/sbs/challenge/{id}` | PUT | Submit SBC |
| `/sbs/sets` | GET | SBC categories |
| `/purchased/items` | GET | Unassigned items |

EA charges **5% tax** on all transfer market sales. Use `calculateProfit()` and `calculateMinSellPrice()` from `shared/constants.js`.

### Updating for a new web app version

When EA updates the web app:
1. Open the web app with Chrome DevTools Network tab open
2. Check if the base URL or endpoint paths changed
3. Verify session capture still works (check for `X-UT-SID` in request headers)
4. Test read-only tools first (`get_session_status`, `get_coin_balance`, `search_transfer_market`)
5. Update endpoint paths in `content/page-inject.js` and `EA_BASE_URL` in `shared/constants.js` if needed

### Logging

Use the `logger` singleton from `shared/logger.js`. Levels: `debug`, `info`, `trade`, `warn`, `error`. Stores last 1000 entries in `chrome.storage.local` with automatic rotation.

```javascript
logger.info('Market search', { tool: 'search_transfer_market', results: 15 });
logger.trade('Buy Now', { tradeId: 123, price: 95000 });
logger.warn('Rate limit approaching', { actionType: 'market_search', hourlyCount: 180 });
```

### Claude Code skill

A Claude Code skill file is available at `SKILL.md` in the project root. It provides Claude with the development rules, architecture, and patterns needed to work on this codebase correctly. The skill triggers automatically on keywords like "FC26 extension", "FUT MCP", or "transfer market automation".

## Disclaimer

This extension interacts with EA's services in ways not officially supported. Using automated tools may violate EA's Terms of Service. Account penalties including permanent bans are possible. The extension is for personal educational use and the developers are not responsible for any account actions taken by EA. Use at your own risk.
