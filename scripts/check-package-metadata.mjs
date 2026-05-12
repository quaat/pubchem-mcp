#!/usr/bin/env node
/**
 * Static metadata sanity check for pubchem-mcp.
 *
 * Run locally and in CI to fail fast when package.json drifts from publish-
 * ready shape. When `--publish` is passed (or env PUBLISH_MODE=1) the checker
 * additionally refuses any 0.1.0 republish attempt.
 *
 * Usage:
 *   node scripts/check-package-metadata.mjs [--publish]
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const publishMode =
  process.argv.includes('--publish') || process.env.PUBLISH_MODE === '1';

const errors = [];
const warnings = [];

function fail(msg) {
  errors.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}

const pkgPath = join(repoRoot, 'package.json');
if (!existsSync(pkgPath)) {
  console.error('package.json not found at repo root');
  process.exit(1);
}
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

// 1. Required fields.
const REQUIRED = ['name', 'version', 'description', 'license', 'repository', 'bugs', 'homepage'];
for (const field of REQUIRED) {
  if (!pkg[field]) fail(`Missing required package.json field: ${field}`);
}

// 2. Author or contributors (at least one).
if (!pkg.author && !(Array.isArray(pkg.contributors) && pkg.contributors.length > 0)) {
  fail('Missing author or contributors in package.json');
}

// 3. Name.
if (pkg.name !== 'pubchem-mcp') {
  fail(`Unexpected package name "${pkg.name}" (expected "pubchem-mcp")`);
}

// 4. Bin.
const expectedBinPath = './bin/pubchem-mcp';
const bin = pkg.bin;
if (typeof bin === 'string') {
  if (bin !== expectedBinPath) fail(`bin path is "${bin}" (expected "${expectedBinPath}")`);
} else if (bin && typeof bin === 'object') {
  if (bin['pubchem-mcp'] !== expectedBinPath) {
    fail(`bin["pubchem-mcp"] is "${bin['pubchem-mcp']}" (expected "${expectedBinPath}")`);
  }
} else {
  fail('package.json is missing a "bin" entry');
}
const binAbs = join(repoRoot, expectedBinPath.replace(/^\.\//, ''));
if (!existsSync(binAbs)) fail(`Bin shim missing on disk: ${expectedBinPath}`);

// 5. Exports.
const exp = pkg.exports;
if (!exp || typeof exp !== 'object') {
  fail('package.json "exports" must be an object');
} else {
  if (!exp['.']) fail('exports["."] is missing');
  if (exp['./package.json'] !== './package.json') {
    fail('exports["./package.json"] must equal "./package.json" so external tooling can read package metadata');
  }
}

// 6. Files (publish allowlist).
const expectedFiles = ['dist/', 'bin/', 'README.md', 'LICENSE'];
const files = Array.isArray(pkg.files) ? pkg.files : [];
for (const must of expectedFiles) {
  if (!files.includes(must)) fail(`package.json "files" must include "${must}"`);
}

// 7. README + LICENSE on disk.
if (!existsSync(join(repoRoot, 'README.md'))) fail('README.md not found at repo root');
if (!existsSync(join(repoRoot, 'LICENSE'))) fail('LICENSE not found at repo root');

// 8. Repository URL.
const repoField = pkg.repository;
const repoUrl = typeof repoField === 'string' ? repoField : repoField?.url;
if (!repoUrl) fail('Missing repository.url');
else {
  const REPO_RE = /^(?:git\+)?https?:\/\/github\.com\/[^/]+\/[^/]+(?:\.git)?$|^git@github\.com:[^/]+\/[^/]+\.git$/;
  if (!REPO_RE.test(repoUrl)) fail(`repository.url "${repoUrl}" does not look like a GitHub URL`);
}

// 9. Placeholder leftovers.
const serialized = JSON.stringify(pkg);
if (/TODO[-_ ]?OWNER|TODO-set-before-publish|<placeholder>/i.test(serialized)) {
  fail('package.json still contains placeholder metadata');
}

// 10. Version sanity.
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
if (!SEMVER.test(pkg.version)) fail(`version "${pkg.version}" is not a valid semver`);

if (publishMode) {
  if (pkg.version === '0.1.0') {
    fail('Refusing to publish: version 0.1.0 was already published manually. Bump to 0.1.1 or later.');
  }
}

// 11. publishConfig.
if (pkg.publishConfig?.access !== 'public') {
  warn('publishConfig.access is not "public" — verify this is intended for an unscoped public package.');
}

if (warnings.length) {
  for (const w of warnings) console.warn(`warn: ${w}`);
}

if (errors.length) {
  console.error('\nPackage metadata check FAILED:');
  for (const e of errors) console.error(`  - ${e}`);
  console.error('');
  process.exit(1);
}

console.log(`Package metadata OK${publishMode ? ' (publish mode)' : ''}: ${pkg.name}@${pkg.version}`);
