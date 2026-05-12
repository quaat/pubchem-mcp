#!/usr/bin/env node
/**
 * Packed-tarball smoke test.
 *
 * 1. Locate a `pubchem-mcp-*.tgz` (or take a path argument).
 * 2. Create a temporary clean npm project.
 * 3. Install the tarball there.
 * 4. Verify the bin exists, MCP stdio handshake works, and
 *    `require('pubchem-mcp/package.json')` resolves under Node's exports map.
 *
 * Does NOT contact PubChem (the MCP stdio smoke uses mocked PubChem responses
 * — the server never sends a real HTTP request during this test).
 *
 * DOES require npm-registry network access: `npm install <tgz>` resolves and
 * fetches the package's runtime dependencies from the registry into the
 * temporary project. Without network this step will fail (with a clear
 * timeout message rather than a hang).
 *
 * Environment:
 *   KEEP_SMOKE_DIR=1   Do not delete the temp dir on success; print its path.
 *
 * Usage:
 *   node scripts/smoke-packed-package.mjs [path/to/pubchem-mcp-*.tgz]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const TIMEOUTS_MS = {
  npmInit: 30_000,
  npmInstall: 120_000,
  requireCheck: 30_000,
  mcpSmoke: 30_000,
};

function findTarball() {
  const fromArg = process.argv.slice(2).find((a) => a.endsWith('.tgz'));
  if (fromArg) {
    const abs = resolve(process.cwd(), fromArg);
    if (!existsSync(abs)) {
      console.error(`Tarball not found: ${abs}`);
      process.exit(2);
    }
    return abs;
  }
  const candidates = readdirSync(repoRoot)
    .filter((f) => /^pubchem-mcp-.+\.tgz$/.test(f))
    .map((f) => join(repoRoot, f));
  if (candidates.length === 0) {
    console.error(
      'No pubchem-mcp-*.tgz found in repo root. Run "npm pack" first or pass a path.',
    );
    process.exit(2);
  }
  return candidates[candidates.length - 1];
}

/**
 * Run a command with a hard timeout. On timeout, the child is killed (SIGKILL
 * after SIGTERM) and we exit with a structured diagnostic.
 */
function runOrFail(label, cmd, args, opts) {
  const timeoutMs = opts.timeoutMs;
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    env: opts.env ?? process.env,
  });

  // spawnSync reports timeout via `r.signal === 'SIGKILL'` and `r.error.code === 'ETIMEDOUT'`.
  const timedOut =
    r.error && (r.error.code === 'ETIMEDOUT' || r.signal === 'SIGKILL');

  if (timedOut) {
    console.error(`\n${label} TIMED OUT after ${timeoutMs}ms`);
    console.error(`  command: ${cmd} ${args.join(' ')}`);
    console.error(`  cwd: ${opts.cwd}`);
    console.error(`  signal: ${r.signal ?? '<none>'}`);
    if (r.stdout) console.error(`  stdout:\n${r.stdout}`);
    if (r.stderr) console.error(`  stderr:\n${r.stderr}`);
    process.exit(opts.timeoutExitCode ?? 7);
  }

  if (r.error) {
    console.error(`\n${label} FAILED to start: ${r.error.message}`);
    console.error(`  command: ${cmd} ${args.join(' ')}`);
    console.error(`  cwd: ${opts.cwd}`);
    process.exit(opts.errorExitCode ?? 8);
  }

  if (r.status !== 0) {
    console.error(`\n${label} FAILED with exit ${r.status} (signal=${r.signal ?? '<none>'})`);
    console.error(`  command: ${cmd} ${args.join(' ')}`);
    console.error(`  cwd: ${opts.cwd}`);
    if (r.stdout) console.error(`  stdout:\n${r.stdout}`);
    if (r.stderr) console.error(`  stderr:\n${r.stderr}`);
    process.exit(opts.failureExitCode ?? 3);
  }

  return r;
}

const tarball = findTarball();
console.log(`Tarball: ${tarball}`);

const smokeDir = mkdtempSync(join(tmpdir(), 'pubchem-mcp-smoke-'));
console.log(`Smoke dir: ${smokeDir}`);
const keepDir = process.env.KEEP_SMOKE_DIR === '1';

let exitCode = 0;
try {
  runOrFail('npm init', 'npm', ['init', '-y'], {
    cwd: smokeDir,
    timeoutMs: TIMEOUTS_MS.npmInit,
    timeoutExitCode: 7,
    failureExitCode: 3,
  });

  runOrFail(
    'npm install <tgz>',
    'npm',
    ['install', tarball, '--registry=https://registry.npmjs.org/'],
    {
      cwd: smokeDir,
      timeoutMs: TIMEOUTS_MS.npmInstall,
      timeoutExitCode: 7,
      failureExitCode: 3,
    },
  );

  const binPath = join(smokeDir, 'node_modules', '.bin', 'pubchem-mcp');
  if (!existsSync(binPath)) {
    console.error(`Bin not present after install: ${binPath}`);
    process.exit(4);
  }
  console.log(`Bin OK: ${binPath}`);

  const reqResult = runOrFail(
    "require('pubchem-mcp/package.json')",
    process.execPath,
    [
      '-e',
      "const pkg = require('pubchem-mcp/package.json'); if (pkg.name !== 'pubchem-mcp') { console.error('bad name', pkg.name); process.exit(1); } console.log('pkg.version', pkg.version);",
    ],
    {
      cwd: smokeDir,
      timeoutMs: TIMEOUTS_MS.requireCheck,
      timeoutExitCode: 7,
      failureExitCode: 5,
    },
  );
  console.log(`exports["./package.json"] OK: ${reqResult.stdout.trim()}`);

  const smokeScript = resolve(repoRoot, 'scripts', 'smoke-mcp-stdio.mjs');
  const smokeResult = runOrFail(
    'MCP stdio smoke',
    process.execPath,
    [smokeScript, '--bin', binPath, '--cwd', smokeDir],
    {
      cwd: smokeDir,
      timeoutMs: TIMEOUTS_MS.mcpSmoke,
      timeoutExitCode: 7,
      failureExitCode: 6,
    },
  );
  console.log(smokeResult.stdout.trim());

  console.log('\nPacked tarball smoke OK.');
} catch (err) {
  console.error('Unexpected smoke failure:', err);
  exitCode = 9;
} finally {
  if (keepDir) {
    console.log(`KEEP_SMOKE_DIR=1 → leaving temp dir for inspection: ${smokeDir}`);
  } else {
    try {
      rmSync(smokeDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

process.exit(exitCode);
