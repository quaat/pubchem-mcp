# CI/CD

This project ships four GitHub Actions workflows plus a Dependabot
configuration and (optionally) a CodeQL workflow. They live under
[`.github/`](../.github/).

| Workflow | File | Trigger | Purpose |
|---|---|---|---|
| CI | `.github/workflows/ci.yml` | PR + push to `main` + manual | Build, typecheck, lint, test, audit, pack dry-run, MCP stdio smoke. Runs on Node 22 + Node 24. |
| Release check | `.github/workflows/release-check.yml` | tag push `v*.*.*` + relevant PRs + manual | Everything CI does *plus* `npm pack`, clean-install the tarball, run the MCP smoke against the installed bin, upload the `.tgz` as an artifact (7-day retention). |
| Publish | `.github/workflows/publish.yml` | **tag push `v*.*.*` only** | Publishes to npm via **Trusted Publishing (OIDC)**. Refuses `v0.1.0`. Refuses tag/version mismatch. Refuses non-tag refs (defense in depth). Gated behind the `npm-publish` environment for human approval. **No `workflow_dispatch`** — manual dispatch is intentionally not supported so the tag/version match guard cannot be side-stepped. |
| Live PubChem tests | `.github/workflows/live-tests.yml` | manual + weekly schedule | Runs the live integration suite against `pubchem.ncbi.nlm.nih.gov` with conservative rate limits. **Never on PRs.** |
| CodeQL | `.github/workflows/codeql.yml` | PR + push to `main` + weekly | `javascript-typescript` analysis with the `security-extended` query suite. |
| Dependabot | `.github/dependabot.yml` | weekly | npm + GitHub Actions updates, grouped minor/patch, security updates ungrouped. |

## What runs on a pull request

`ci.yml` runs in two parallel matrix jobs (Node 22, Node 24):

```
npm ci → npm run build → npm run typecheck → npm run lint →
npm test → npm audit --omit=dev → npm run check:metadata →
npm pack --dry-run → npm run smoke:mcp
```

Live PubChem tests are **not** run on PRs.

`release-check.yml` additionally runs on PRs that touch `package.json`,
`src/**`, `bin/**`, `scripts/**`, or any release-related workflow. It performs
a full packed-tarball install + MCP stdio smoke and uploads the candidate
tarball.

CodeQL runs `security-extended` queries on the same PR events.

## What runs on a version tag

Pushing a `v*.*.*` tag triggers two workflows:

1. `release-check.yml` re-runs the full validation suite and packs the
   release-candidate tarball.
2. `publish.yml` runs and (after the required reviewer in the `npm-publish`
   environment approves) publishes to the public registry via OIDC.

The publish job will **abort** before talking to the registry if:

- the tag is `v0.1.0` (manually published; cannot be republished),
- the tag version does not match `package.json` version,
- required metadata fields are missing,
- placeholder metadata (e.g. `TODO-OWNER`) is detected,
- any of `build`, `typecheck`, `lint`, `test`, or `audit --omit=dev` fails,
- the run was somehow triggered by something other than a tag (defense-in-depth
  step at the top of the job rejects non-tag refs).

There is intentionally **no `workflow_dispatch`** on the publish workflow.
Manual approval is exclusively the responsibility of the `npm-publish`
GitHub Environment — a maintainer cannot click "Run workflow" from a branch
to bypass the tag/version match guard.

## How npm Trusted Publishing works here

npm Trusted Publishing exchanges a short-lived OIDC token (issued by GitHub
Actions for the `id-token: write` permission) for an ephemeral npm publish
credential bound to the configured Trusted Publisher. There is no long-lived
`NPM_TOKEN`, nothing to rotate, and the npm registry records the publish
provenance automatically for eligible public packages.

Requirements (already satisfied by `publish.yml`):

- `permissions: { contents: read, id-token: write }`
- Node ≥ 22.14 and npm ≥ 11.5.1 (the workflow uses Node 24 and `npm install -g npm@latest` for safety)
- `repository.url` in `package.json` **exactly matches** the GitHub repo configured on npm
- The workflow is committed to the repository (npm validates the workflow filename)

## Configuring the npm Trusted Publisher

On <https://www.npmjs.com/>:

1. Sign in as a maintainer of `pubchem-mcp`.
2. Visit <https://www.npmjs.com/package/pubchem-mcp/access> → **Publishing access** →
   **Add Trusted Publisher** → **GitHub Actions**.
3. Fill in **exactly**:

   | Field | Value |
   |---|---|
   | Package | `pubchem-mcp` |
   | Provider | GitHub Actions |
   | Owner | `quaat` |
   | Repository | `pubchem-mcp` |
   | Workflow filename | `publish.yml` |
   | Environment name | `npm-publish` |

4. Save.

The owner/repository fields must match `repository.url` in `package.json`
character-for-character (modulo the `git+` prefix and `.git` suffix), and the
workflow filename must match the publish workflow's path under
`.github/workflows/`.

## Configuring the GitHub `npm-publish` environment

On the GitHub repo:

1. **Settings → Environments → New environment** → name it `npm-publish`.
2. Add **Required reviewers** (at least one maintainer who must approve before
   a publish job can start).
3. (Optional but recommended) Restrict the environment to the `main` branch and
   to tags matching `v*.*.*` via **Deployment branches and tags**:
   - `main`
   - `v*.*.*`
4. Do **not** add any environment secrets. Trusted Publishing does not need
   any.

## How to publish a new version

Walk through [`docs/release-checklist.md`](release-checklist.md). The short
form:

```bash
# 1. Update version + changelog + commit.
npm version patch          # or minor / major
git push
git push --tags

# 2. release-check runs automatically on the tag push.
# 3. publish runs after a reviewer approves the npm-publish environment.
# 4. Verify on https://www.npmjs.com/package/pubchem-mcp .
```

There is no manual "Run workflow" button for publish; the tag push is the
sole publish trigger and the `npm-publish` environment is the sole human
approval gate. This is intentional — a manual dispatch from a branch could
bypass the tag/version match guard.

## Packed-tarball smoke test (`npm run smoke:package`)

`scripts/smoke-packed-package.mjs` exercises the *installed* package end-to-end:

1. Creates a temp dir, runs `npm init -y`.
2. Runs `npm install <tarball> --registry=https://registry.npmjs.org/`.
3. Verifies the `pubchem-mcp` bin is installed.
4. Verifies `require('pubchem-mcp/package.json')` works under Node's exports.
5. Drives the installed binary through the MCP stdio handshake.

Each step has a hard timeout and fails with a structured diagnostic if it
hangs. **Network access to the npm registry is required** because step 2 must
resolve and download the package's runtime dependencies into the temp dir.
CI runners have this; firewalled local machines may not, in which case the
test fails fast with a timeout rather than hanging indefinitely.

Set `KEEP_SMOKE_DIR=1` to retain the temp dir for inspection.

## How to run live tests manually

GitHub UI → Actions → **Live PubChem tests** → **Run workflow** → pick branch.

Live tests use:

- `PUBCHEM_MCP_LIVE_TESTS=1`
- `PUBCHEM_RPS=1`, `PUBCHEM_RPM=30`
- `PUBCHEM_TIMEOUT_MS=30000`
- `PUBCHEM_MAX_RETRIES=2`

They target only `test/integration/live.test.ts` and report typed
`PubChemTransientError`s with `category: "transient"` if PubChem is unreachable
rather than hanging.

## Historical: how `0.1.0` was published

`pubchem-mcp@0.1.0` was published manually from a developer machine on
2026-05-12 — before this CI/CD pipeline existed. The `v0.1.0` tag exists on
`origin` as a historical marker. The publish workflow explicitly refuses to
publish `v0.1.0` again so accidental re-runs cannot corrupt the release
history. All future releases go through Trusted Publishing.

## Why not `NPM_TOKEN`?

Long-lived `NPM_TOKEN`s are the historical npm publish path and remain
supported, but:

- they are a high-value credential that must be rotated,
- they grant publish rights from anywhere the secret leaks,
- and they bypass the per-workflow provenance that npm Trusted Publishing
  generates automatically.

This repo's primary publish path is OIDC and has no fallback by default. If a
fallback is ever needed (e.g. npm is temporarily not honoring OIDC), it must
be added behind an explicit, opt-in repository variable and documented here.
