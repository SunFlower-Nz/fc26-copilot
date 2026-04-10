---
name: fc26-copilot
description: "Skill for developing the FC26 Copilot Chrome extension — an MCP server that connects LLMs to the EA FC 26 Ultimate Team Web App. Trigger when working on Chrome extension code for FC26/FUT, MCP tools, JS injection bridges, rate limiters, or transfer market logic. Keywords: FC26 extension, FUT MCP, EA web app API, transfer market automation, sniping bot, trading assistant."
---

# FC26 Copilot — Development Skill

## Architecture

Chrome extension (Manifest V3) acting as an MCP server. Data flows:

```
MCP Client → service-worker.js → bridge.js → content-script.js → page-inject.js → EA HTTP API
```

- **page-inject.js** — runs in EA page context, intercepts fetch/XHR to capture session (`X-UT-SID`, `X-UT-PHISHING-TOKEN`), makes direct HTTP calls to `utas.mob.aem.ea.com`
- **content-script.js** — bridges background ↔ page via `window.postMessage`, 30s timeout per request
- **bridge.js** — sends `chrome.tabs.sendMessage` to content script, extracts error codes from responses
- **ea-call.js** — single `safeEACall(method, params)` with error code routing (401/403/409/429/461/521)
- **rate-limiter.js** — per-action + global throttling with jitter, hourly/daily caps, persisted to `chrome.storage.local`
- **session-monitor.js** — auth state tracking, keepalive via `chrome.alarms`, persisted to storage
- **mcp-server.js** — JSON-RPC 2.0 handler (`initialize`, `tools/list`, `tools/call`)
- **service-worker.js** — entry point, wires everything, exposes MCP via `onMessageExternal` and `onConnectExternal`

## Project structure

```
fc26-copilot/
├── manifest.json
├── background/
│   ├── service-worker.js          # Entry point, chrome.runtime listeners, alarms
│   ├── mcp-server.js              # MCP JSON-RPC protocol
│   ├── bridge.js                  # Background → content script messaging
│   ├── ea-call.js                 # Shared safeEACall with error code handling
│   ├── rate-limiter.js            # Throttling engine (persisted)
│   ├── session-monitor.js         # Auth state + keepalive (persisted)
│   └── tools/
│       ├── market-tools.js        # search, buy, bid, list
│       ├── club-tools.js          # club players, unassigned, move items
│       ├── tradepile-tools.js     # tradepile, watchlist, relist, clear sold
│       ├── sbc-tools.js           # SBC challenges
│       └── price-tools.js         # FutBin lookups, coin balance
├── content/
│   ├── content-script.js          # Bridge: background ↔ page
│   └── page-inject.js             # Runs in EA page context, calls EA HTTP API
├── shared/
│   ├── constants.js               # Rate limits, error codes, config
│   ├── logger.js                  # Structured logging with storage rotation
│   └── types.js                   # JSDoc type definitions
├── ui/
│   ├── popup.html / popup.js / popup.css
└── webpack.config.js
```

## Critical rules

### 1. Every EA call goes through rate limiter — no exceptions

```javascript
// In tool handler: throttle THEN call
await rateLimiter.throttle('market_search');
const result = await safeEACall('searchTransferMarket', params);
```

Never call `callEA()` or `safeEACall()` without `rateLimiter.throttle()` first. The action type must match a key in `RATE_LIMITS` from `shared/constants.js`. Never change rate limit values without explicit user instruction.

### 2. All EA calls use safeEACall — never raw callEA

`safeEACall` (in `background/ea-call.js`) handles every error code. Tool files import it:

```javascript
import { safeEACall } from '../ea-call.js';
```

Never duplicate the error handling switch. Never catch EA errors in tool handlers — let `safeEACall` handle them.

### 3. Write operations need requiresConfirmation: true

Any tool that spends coins or modifies the account (`buy_now`, `place_bid`, `list_on_market`, `relist_all`) must set `requiresConfirmation: true` in the tool definition. The LLM should ask the user before executing.

### 4. Error codes flow through the full chain

Error codes must survive: page-inject → content-script → bridge → ea-call. The chain:

- **page-inject.js** throws with `error.status = httpStatusCode`
- **content-script.js** captures `error.status` and passes `errorCode` in the response message
- **bridge.js** sets both `error.status` and `error.code` from `response.errorCode`
- **ea-call.js** reads `error.status || error.code` to route

If you change error handling anywhere in this chain, verify the error code reaches `safeEACall`.

### 5. chrome.runtime message handlers must not use async callbacks

Chrome closes the `sendResponse` channel before async functions resolve. Always use `.then()`:

```javascript
// CORRECT
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  doAsyncWork().then((result) => sendResponse(result));
  return true; // keep channel open
});

// WRONG — sendResponse is dead by the time await resolves
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  const result = await doAsyncWork();
  sendResponse(result); // silently fails
});
```

### 6. Extension service workers can't intercept fetch

`self.addEventListener('fetch', ...)` does nothing in a Chrome extension service worker. MCP communication uses `chrome.runtime.onMessageExternal` and `chrome.runtime.onConnectExternal` only.

### 7. State must be persisted to survive restarts

Chrome kills idle service workers. Rate limiter and session monitor persist to `chrome.storage.local`:

- **rate-limiter.js** — persists every 30s + immediately on `triggerBackoff`/`triggerFullStop`. Restores on construction.
- **session-monitor.js** — persists on `updateSession`/`markExpired`. Restores if session < 2 hours old.

If you add new stateful modules, follow this pattern.

## Adding a new MCP tool

1. Add the EA API call in `page-inject.js` (`executeMethod` switch + implementation function)
2. Define the tool in the appropriate file under `background/tools/`:
   ```javascript
   {
     name: 'tool_name',
     description: '...',
     inputSchema: { type: 'object', properties: { ... } },
     handler: async (params) => {
       await rateLimiter.throttle('action_type');
       const result = await safeEACall('methodName', params);
       if (result.success) logger.info('...', { ... });
       return result;
     },
   }
   ```
3. The tool auto-registers — `mcp-server.js` imports the tools array and registers all tools in `registerTools()`.
4. No changes needed in `content-script.js` — the bridge is generic (forwards any method/params).

## Logging

Use the `logger` singleton from `shared/logger.js`. Levels: `debug`, `info`, `trade`, `warn`, `error`. Logs rotate at 1000 entries in `chrome.storage.local`.

```javascript
logger.info('Market search', { tool: 'search_transfer_market', results: 15 });
logger.trade('Buy Now', { tradeId: 123, price: 95000 });
logger.warn('Rate limit approaching', { actionType: 'market_search', hourlyCount: 180 });
logger.error('EA API error', { method: 'buyNow', code: 429 });
```

## EA API reference

Base URL: `https://utas.mob.aem.ea.com/ut/game/fc26`

All requests require headers: `X-UT-SID`, `X-UT-PHISHING-TOKEN`, `Content-Type: application/json`.

Key endpoints (see `page-inject.js` for full list):
- `GET /transfermarket` — search with query params
- `PUT /trade/{tradeId}/bid` — buy now or place bid
- `PUT /item` — list item for sale
- `GET /tradepile`, `GET /watchlist`, `GET /club?type=1`
- `PUT /auctionhouse/relist`, `DELETE /tradepile` — relist / clear sold
- `GET /user/credits` — coin balance

EA tax: 5% on all sales. Use `calculateProfit()` and `calculateMinSellPrice()` from `shared/constants.js`.

## References

- `brd.md` — Full BRD with all tool schemas, API endpoints, and safety rules
- `fc26-mcp-extension-brd.md` — Extended BRD
