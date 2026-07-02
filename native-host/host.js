/**
 * FC26 Copilot Native Messaging host.
 * Chrome ↔ extension on stdin/stdout; MCP clients connect via TCP :3927.
 */

const net = require('net');

const TCP_PORT = parseInt(process.env.FC26_TCP_PORT || '3927', 10);
const pendingTcp = new Map();
let tcpClient = null;
let chromeBuffer = Buffer.alloc(0);

function writeChromeMessage(obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(header);
  process.stdout.write(body);
}

function readChromeLoop() {
  process.stdin.on('readable', () => {
    let chunk;
    while ((chunk = process.stdin.read()) !== null) {
      chromeBuffer = Buffer.concat([chromeBuffer, chunk]);
      while (chromeBuffer.length >= 4) {
        const len = chromeBuffer.readUInt32LE(0);
        if (chromeBuffer.length < 4 + len) break;
        const body = chromeBuffer.subarray(4, 4 + len);
        chromeBuffer = chromeBuffer.subarray(4 + len);
        try {
          const msg = JSON.parse(body.toString('utf8'));
          handleChromeMessage(msg);
        } catch (err) {
          logErr('Invalid JSON from extension', err.message);
        }
      }
    }
  });
}

function handleChromeMessage(msg) {
  if (msg.id !== undefined && pendingTcp.has(msg.id)) {
    const { resolve } = pendingTcp.get(msg.id);
    pendingTcp.delete(msg.id);
    resolve(msg);
    return;
  }

  if (tcpClient) {
    tcpClient.write(JSON.stringify(msg) + '\n');
  }
}

function forwardTcpToChrome(line) {
  try {
    const request = JSON.parse(line);
    writeChromeMessage(request);
  } catch (err) {
    logErr('Invalid JSON from MCP TCP client', err.message);
  }
}

const server = net.createServer((socket) => {
  if (tcpClient) {
    tcpClient.destroy();
  }
  tcpClient = socket;
  logInfo('MCP TCP client connected');

  let buffer = '';
  socket.on('data', (data) => {
    buffer += data.toString('utf8');
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) forwardTcpToChrome(line);
    }
  });

  socket.on('close', () => {
    if (tcpClient === socket) tcpClient = null;
    logInfo('MCP TCP client disconnected');
  });

  socket.on('error', (err) => logErr('TCP socket error', err.message));
});

server.listen(TCP_PORT, '127.0.0.1', () => {
  logInfo(`Native host listening on 127.0.0.1:${TCP_PORT}`);
});

readChromeLoop();

process.stdin.on('end', () => process.exit(0));

function logInfo(msg) {
  process.stderr.write(`[fc26-native-host] ${msg}\n`);
}

function logErr(msg, detail) {
  process.stderr.write(`[fc26-native-host] ${msg}: ${detail}\n`);
}
