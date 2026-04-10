# FC26 Copilot — Step-by-Step Setup Guide

This walks you through everything from zero to having Claude trade on the FUT web app.

---

## Step 1: Install Dependencies

Open a terminal in the `fc26-copilot` folder and install both the extension and the bridge:

```bash
cd fc26-copilot

# Extension build dependencies
npm install

# Bridge dependencies
cd mcp-bridge
npm install
cd ..
```

---

## Step 2: Build the Extension

```bash
npm run build
```

This creates a `dist/` folder with the bundled extension. You should see output like:

```
asset background/service-worker.js ...
asset content/content-script.js ...
asset content/page-inject.js ...
asset ui/popup.js ...
webpack compiled successfully
```

If you want auto-rebuild during development:
```bash
npm run dev
```

---

## Step 3: Install the Extension in Chrome

1. Open Chrome
2. Go to `chrome://extensions`
3. Toggle **Developer mode** ON (top-right corner)
4. Click **Load unpacked**
5. Navigate to and select the `fc26-copilot/dist` folder
6. The extension appears in the list

**Important — Copy your Extension ID:**

After loading, you'll see the extension card with an ID like:

```
ID: abcdefghijklmnopqrstuvwxyz123456
```

**Copy this ID.** You'll need it in Step 6.

Pin the extension to your toolbar by clicking the puzzle icon (Extensions) and pinning "FC26 Copilot".

---

## Step 4: Open the FUT Web App

1. In Chrome, go to: https://www.ea.com/ea-sports-fc/ultimate-team/web-app
2. Log in with your EA account
3. Wait until the web app fully loads (you should see your club, coins, etc.)
4. **Do not close this tab** — the extension needs it open

**Verify it's working:**

Click the FC26 Copilot extension icon in the toolbar. The popup should show:
- **Web App**: Connected (green dot)
- **Session**: Authenticated (green dot)
- **MCP Server**: Waiting (yellow dot) — this is normal, Claude isn't connected yet

If "Session" shows red, wait a few seconds — the extension captures credentials from the web app's first API call. Navigate around in the web app (click Transfer Market, then back) to trigger some requests.

---

## Step 5: Start the MCP Bridge

Open a **new terminal** (keep the FUT web app open in Chrome) and run:

```bash
cd fc26-copilot/mcp-bridge
node server.js
```

You should see:

```
[FC26 Bridge] MCP Bridge running on http://localhost:3926
[FC26 Bridge] Open http://localhost:3926 in Chrome to connect the bridge
[FC26 Bridge] Waiting for bridge page...
```

**Keep this terminal running.** Don't close it.

---

## Step 6: Open the Bridge Page in Chrome

1. In Chrome (the same browser where the extension is installed), open a **new tab**
2. Go to: `http://localhost:3926`
3. You'll see the FC26 Copilot Bridge page
4. Paste your **Extension ID** (from Step 3) into the field
5. Click **Connect**

If everything is working, you'll see:
- **Bridge Server**: Connected (green)
- **Extension**: Connected (green)
- Log shows: "Connected to bridge server" and "Extension reachable"

The terminal from Step 5 should also show:
```
[FC26 Bridge] Bridge page connected
```

**Keep this tab open.** It's the communication channel between Claude and the extension.

---

## Step 7: Configure Claude Code

Open (or create) your Claude Code MCP settings file.

**On Windows** — open your settings via Claude Code:
```
/settings
```

Or manually edit `%APPDATA%\Claude\claude_desktop_config.json` (for Claude Desktop) or your project's `.claude/settings.json` (for Claude Code).

Add the FC26 Copilot MCP server:

```json
{
  "mcpServers": {
    "fc26-copilot": {
      "command": "node",
      "args": ["G:/Work/fc26-mcp/fc26-copilot/mcp-bridge/server.js"]
    }
  }
}
```

**Use the full absolute path** to `server.js` on your machine.

For **Claude Desktop**, edit `claude_desktop_config.json`:
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`

After saving, **restart Claude Code** (or Claude Desktop) so it picks up the new MCP server.

---

## Step 8: Verify the Connection

In Claude Code, the FC26 Copilot tools should now be available. Test with:

> "Check my FUT session status"

Claude should call `get_session_status` and return your connection status, rate limit stats, etc.

Then try:

> "What's my coin balance?"

Claude calls `get_coin_balance` and returns your current FUT coins.

If these work, you're fully connected.

---

## Step 9: Start Trading

Here are some things you can ask Claude:

### Check prices
> "Search the transfer market for gold ST players under 10,000 coins"

> "What's the FutBin price for Mbappé?"

### Monitor your assets
> "Show my tradepile"

> "Are there any expired items to relist?"

> "What's in my watchlist?"

### Buy (Claude will ask for confirmation)
> "Find me a good deal on a Serie A CB under 5k"

> "Bid 3,000 on trade ID 123456789"

### Sell
> "List the player from my tradepile at 8,000 BIN"

> "Clear all sold items"

### SBCs
> "What SBCs are active right now?"

> "Show me the requirements for that SBC"

### Session management
> "How long have I been active?"

> "Send a keepalive"

---

## Tabs You Need Open

At minimum, you need **3 things running**:

| What | Where | Purpose |
|------|-------|---------|
| FUT Web App | Chrome tab | The actual EA web app the extension hooks into |
| Bridge Page | Chrome tab (`localhost:3926`) | Routes Claude's requests to the extension |
| Bridge Server | Terminal | `node server.js` — translates between Claude's stdio and WebSocket |

Claude Code (or Claude Desktop) connects to the bridge server automatically via the MCP config.

---

## Troubleshooting

### "Bridge page not connected"
- Make sure `http://localhost:3926` is open in Chrome
- Make sure the bridge server (`node server.js`) is running in a terminal
- Refresh the bridge page

### "Extension not reachable" on the bridge page
- Double-check the Extension ID — go to `chrome://extensions` and copy it again
- Make sure the extension is enabled (toggle should be ON)
- Click Connect again on the bridge page

### "Session: Not logged in" in the popup
- Go to the FUT web app tab and make sure you're logged in
- Navigate around (click Transfer Market, then back) to trigger requests
- The extension captures session credentials from the web app's outgoing requests
- If the session expired, log in again

### "Hourly limit reached" errors
- The rate limiter is working as intended — you've hit the safe limit
- Wait for the counter to reset (resets on a rolling 1-hour window)
- Check the popup to see which action hit the limit

### "TRANSFER MARKET BAN DETECTED"
- **Don't panic.** This is a soft ban, usually 24 hours.
- The extension has already stopped all operations automatically.
- Do NOT try to circumvent this — wait the full 24 hours.
- After 24 hours, start with Monitor mode and read-only operations.

### Claude says the tools aren't available
- Restart Claude Code after editing the MCP config
- Check that the path to `server.js` in the config is correct
- Make sure the bridge server is running

### Extension popup shows all red
- Refresh the FUT web app page
- If the web app logged you out, log back in
- If you closed the web app tab, open it again

---

## Tips for Safe Trading

1. **Start in Assisted mode.** Let Claude suggest, you confirm. Get comfortable before using Semi-Auto.

2. **Take breaks.** The popup warns you after 60 minutes. Listen to it. Close the web app for 10-15 minutes.

3. **Don't chase speed.** The rate limits are conservative on purpose. Faster = more ban risk.

4. **Start with read-only.** Use `search_transfer_market` and `get_player_market_data` for a while before doing any buy/sell. Make sure everything works smoothly.

5. **Watch the rate limit bars** in the popup. If any bar is yellow or red, slow down.

6. **Don't run overnight.** EA flags continuous sessions, especially during maintenance windows (3-6 AM).

7. **One session at a time.** Don't use the web app manually while Claude is also using it. Pick one.
