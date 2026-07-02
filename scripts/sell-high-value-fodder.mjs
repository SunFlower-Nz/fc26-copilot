/**
 * CLI wrapper for sell_premium_fodder MCP tool.
 * Usage:
 *   node scripts/sell-high-value-fodder.mjs           # preview
 *   node scripts/sell-high-value-fodder.mjs --confirm # list on market
 */

import http from 'http';

const args = process.argv.slice(2);
const confirm = args.includes('--confirm');
const dryRun = args.includes('--dry-run') || !confirm;
const minBronze = Number(getArg('--min-bronze') || 350);
const minSilver = Number(getArg('--min-silver') || 650);
const PORT = 3926;

function getArg(name) {
  const hit = args.find((a) => a.startsWith(name + '='));
  return hit ? hit.split('=')[1] : null;
}

function mcp(name, toolArgs = {}, id = 1) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: toolArgs },
    });
    const req = http.request(
      {
        hostname: 'localhost',
        port: PORT,
        path: '/mcp',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function parse(res) {
  const text = res?.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : res;
}

async function main() {
  const status = parse(await mcp('get_session_status', {}, 1));
  if (!status?.data?.session?.isAuthenticated) {
    console.error('Sessão EA não autenticada. Abra o Web App, faça login e recarregue a extensão.');
    process.exit(1);
  }

  const result = parse(
    await mcp(
      'sell_premium_fodder',
      {
        confirm: confirm && !dryRun,
        dry_run: dryRun,
        min_bronze: minBronze,
        min_silver: minSilver,
        force_refresh: true,
      },
      2
    )
  );

  if (!result.success) {
    console.error('Erro:', result.error || result);
    process.exit(1);
  }

  console.log(JSON.stringify(result.data, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
