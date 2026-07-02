#!/usr/bin/env node
/**
 * MCP stdio bridge for Cursor — connects to native host TCP (no browser tab).
 *
 * Usage:
 *   node mcp-stdio-bridge.js [--port=3927]
 */

const net = require('net');
const readline = require('readline');

const args = process.argv.slice(2);
const PORT = parseInt(getArg('--port') || '3927', 10);

function getArg(name) {
  const arg = args.find((a) => a.startsWith(name + '='));
  return arg ? arg.split('=')[1] : null;
}

let socket = null;
let buffer = '';
const pending = new Map();

function connect() {
  socket = net.createConnection({ host: '127.0.0.1', port: PORT }, () => {
    process.stderr.write(`[fc26-mcp] Connected to native host :${PORT}\n`);
  });

  socket.on('data', (data) => {
    buffer += data.toString('utf8');
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        process.stdout.write(JSON.stringify(msg) + '\n');
      } catch {
        // ignore
      }
    }
  });

  socket.on('close', () => {
    process.stderr.write('[fc26-mcp] Disconnected — retry in 3s\n');
    setTimeout(connect, 3000);
  });

  socket.on('error', (err) => {
    process.stderr.write(`[fc26-mcp] ${err.message}\n`);
  });
}

connect();

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  if (!socket || socket.destroyed) {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Native host not connected' },
        id: null,
      }) + '\n'
    );
    return;
  }
  socket.write(line.trim() + '\n');
});
