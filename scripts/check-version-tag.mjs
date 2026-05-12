#!/usr/bin/env node
/**
 * Verify that a git tag matches `package.json` version.
 *
 * Ref sources (in priority order):
 *   1. `--ref <refs/tags/vX.Y.Z>` command-line flag (overrides everything)
 *   2. `GITHUB_REF` environment variable (the default in GitHub Actions)
 *
 * Behavior:
 *   - If the resolved ref is `refs/tags/vX.Y.Z`, require `package.json`
 *     version = X.Y.Z. With `--publish` (or PUBLISH_MODE=1) additionally
 *     refuse `v0.1.0`.
 *   - If the resolved ref is not a vX.Y.Z tag and we are NOT in publish
 *     mode, warn and exit 0.
 *   - If we are in publish mode and the resolved ref is not a tag, fail
 *     (publishing must come from a tag).
 *
 * Usage:
 *   node scripts/check-version-tag.mjs [--publish] [--ref refs/tags/vX.Y.Z]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));

const argv = process.argv.slice(2);

function flagValue(name) {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) {
    console.error(`Missing value for ${name}`);
    process.exit(2);
  }
  return v;
}

const publishMode =
  argv.includes('--publish') || process.env.PUBLISH_MODE === '1';

const refFromFlag = flagValue('--ref');
const refFromEnv = process.env.GITHUB_REF;
const ref = refFromFlag ?? refFromEnv ?? '';
const refSource = refFromFlag ? '--ref' : refFromEnv ? 'GITHUB_REF' : 'unset';

const TAG_RE = /^refs\/tags\/v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
const match = ref.match(TAG_RE);

if (!match) {
  const msg = `ref is not a vX.Y.Z tag (source=${refSource}, value="${ref || '<unset>'}")`;
  if (publishMode) {
    console.error(`Publish refused: ${msg}`);
    process.exit(1);
  }
  console.warn(`note: ${msg} — skipping tag/version match check.`);
  process.exit(0);
}

const tagVersion = match[1];

if (publishMode && tagVersion === '0.1.0') {
  console.error(
    `Refusing to publish 0.1.0: this version was published manually on 2026-05-12 and the tag is historical (source=${refSource}).`,
  );
  process.exit(1);
}

if (tagVersion !== pkg.version) {
  console.error(
    `Tag/version mismatch: ref is v${tagVersion} (source=${refSource}) but package.json version is ${pkg.version}.`,
  );
  process.exit(1);
}

if (publishMode && pkg.version === '0.1.0') {
  console.error(
    'Refusing to publish 0.1.0: this version was published manually and package.json still reports 0.1.0. Bump to 0.1.1 or later.',
  );
  process.exit(1);
}

console.log(
  `Tag/version match: v${tagVersion} == package.json version ${pkg.version} (source=${refSource})`,
);
