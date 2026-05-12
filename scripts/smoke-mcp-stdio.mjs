#!/usr/bin/env node
/**
 * Drive a built or installed pubchem-mcp binary over stdio, send the standard
 * MCP handshake plus `tools/list`, and assert the response shape.
 *
 * Does NOT contact PubChem.
 *
 * Usage:
 *   node scripts/smoke-mcp-stdio.mjs                     # use ./dist/index.js
 *   node scripts/smoke-mcp-stdio.mjs --bin <executable>  # use a specific binary
 *   node scripts/smoke-mcp-stdio.mjs --cwd <dir>         # cwd for the spawn
 *
 * Exit 0 on success, non-zero with a message on failure.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const explicitBin = arg('--bin');
const cwd = arg('--cwd') ?? repoRoot;

let cmd;
let args;
if (explicitBin) {
  cmd = explicitBin;
  args = [];
} else {
  const built = join(repoRoot, 'dist', 'index.js');
  if (!existsSync(built)) {
    console.error(
      `dist/index.js not found at ${built}. Run "npm run build" first or pass --bin.`,
    );
    process.exit(2);
  }
  cmd = process.execPath; // current Node
  args = [built];
}

const child = spawn(cmd, args, {
  cwd,
  env: { ...process.env, PUBCHEM_LOG_LEVEL: 'silent' },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (b) => (stdout += b.toString('utf8')));
child.stderr.on('data', (b) => (stderr += b.toString('utf8')));

const TIMEOUT_MS = 15_000;
const timer = setTimeout(() => {
  console.error(`Timeout: server did not respond within ${TIMEOUT_MS}ms`);
  console.error(`stdout so far:\n${stdout}`);
  console.error(`stderr so far:\n${stderr}`);
  child.kill('SIGKILL');
  process.exit(3);
}, TIMEOUT_MS);

const frames = [
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'pubchem-mcp-smoke', version: '0' },
    },
  },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
  { jsonrpc: '2.0', id: 2, method: 'tools/list' },
];

for (const f of frames) {
  child.stdin.write(JSON.stringify(f) + '\n');
}
child.stdin.end();

child.on('close', (code) => {
  clearTimeout(timer);
  let initResult;
  let toolsResult;
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      continue; // not a JSON-RPC line
    }
    if (msg?.id === 1 && msg?.result) initResult = msg.result;
    if (msg?.id === 2 && msg?.result) toolsResult = msg.result;
  }

  const fail = (m) => {
    console.error(`MCP stdio smoke FAILED: ${m}`);
    console.error(`exit code: ${code}`);
    console.error(`stdout:\n${stdout}`);
    console.error(`stderr:\n${stderr}`);
    process.exit(4);
  };

  if (!initResult) fail('no initialize response');
  if (initResult.serverInfo?.name !== 'pubchem-mcp') {
    fail(`unexpected serverInfo.name ${initResult.serverInfo?.name}`);
  }
  if (!toolsResult) fail('no tools/list response');
  const names = (toolsResult.tools ?? []).map((t) => t.name);
  if (!names.includes('resolve_compound')) {
    fail(`tools/list missing resolve_compound (got: ${names.join(', ')})`);
  }

  console.log(
    `MCP stdio smoke OK — server "${initResult.serverInfo.name}@${initResult.serverInfo.version}" with ${names.length} tools`,
  );
  process.exit(0);
});
