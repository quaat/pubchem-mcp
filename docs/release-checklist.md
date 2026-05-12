# Release Checklist

Run these steps before tagging and publishing a new version of `pubchem-mcp`.

> `0.1.0` was published manually on 2026-05-12. **Do not republish 0.1.0.**
> Future versions start at `0.1.1` and are published through GitHub Actions
> using npm Trusted Publishing (see [`docs/ci-cd.md`](ci-cd.md)).

## 1. Pre-flight

- [ ] Working tree is clean (`git status` shows no uncommitted changes).
- [ ] `package.json` metadata is correct (`author`, `repository.url`, `homepage`, `bugs.url`).
- [ ] Confirm the npm Trusted Publisher is still configured: package `pubchem-mcp`, repo `quaat/pubchem-mcp`, workflow `publish.yml`, environment `npm-publish`. (Only needed once; recheck after any owner/repo change.)
- [ ] Decide the next version per semver:
  - `npm version patch` — bugfixes/docs
  - `npm version minor` — backward-compatible features
  - `npm version major` — breaking changes

  This will edit `package.json`, create a commit, and create a tag. **Do not** use it to re-create `v0.1.0`.
- [ ] Add a CHANGELOG entry for the new version under `[X.Y.Z]`.

## 2. Local verification

Run from a clean clone:

```bash
rm -rf node_modules dist
npm ci
npm run check:metadata
npm run build
npm run typecheck
npm run lint
npm test
npm audit --omit=dev
npm audit
npm pack --dry-run
npm pack
npm run smoke:package -- ./pubchem-mcp-*.tgz
```

All must succeed. The packed-tarball smoke confirms:

- `node_modules/.bin/pubchem-mcp` is installed,
- `require('pubchem-mcp/package.json').version` works under Node's exports,
- the MCP `initialize` and `tools/list` handshake succeed without contacting PubChem.

`npm run smoke:package` requires network access to the npm registry because
it runs `npm install <tgz>` in a clean temp project — that install resolves
and downloads the package's runtime dependencies. The step has bounded
timeouts (`npm init` 30 s, `npm install` 120 s, require check 30 s, MCP smoke
30 s) and fails fast with a structured diagnostic rather than hanging when
the registry is unreachable. Set `KEEP_SMOKE_DIR=1` to inspect the temp dir
after a failure.

## 3. Optional: live tests

If a network-capable shell is handy:

```bash
PUBCHEM_MCP_LIVE_TESTS=1 npm test
```

Or run **Actions → Live PubChem tests → Run workflow** in GitHub.

Sanity-check the transport-error contract by pointing at a deliberately bogus
host and confirming every test surfaces `category: "transient"` within a few
seconds:

```bash
PUBCHEM_MCP_LIVE_TESTS=1 \
  PUBCHEM_BASE_URL=https://pubchem.invalid/rest/pug \
  PUBCHEM_VIEW_BASE_URL=https://pubchem.invalid/rest/pug_view \
  npx vitest run test/integration/live.test.ts 2>&1 | tee /tmp/pubchem-failmode.log
grep -c '"category": "transient"' /tmp/pubchem-failmode.log
```

## 4. Tag and push

```bash
git push                   # main
git push --tags            # vX.Y.Z
```

Pushing the tag triggers `release-check.yml` and `publish.yml` in parallel.

## 5. Approve the publish

GitHub UI → **Actions → Publish to npm → Review deployments** for the
`npm-publish` environment. A maintainer must approve before the publish step
can run.

> The publish workflow has **no manual dispatch button**. A tag push is the
> only way to start it, and the `npm-publish` environment approval is the
> only human gate. This prevents anyone from clicking "Run workflow" from a
> branch and side-stepping the tag/version match guard.

## 6. Verify

- [ ] <https://www.npmjs.com/package/pubchem-mcp> shows the new version with provenance.
- [ ] Provenance is visible (npm's "Built and signed on GitHub Actions" badge for eligible public packages).
- [ ] From a clean directory:
  ```bash
  cd "$(mktemp -d)" && npm init -y
  npm install pubchem-mcp@<NEW-VERSION>
  cat <<'EOF' | PUBCHEM_LOG_LEVEL=silent npx pubchem-mcp
  {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
  {"jsonrpc":"2.0","method":"notifications/initialized"}
  {"jsonrpc":"2.0","id":2,"method":"tools/list"}
  EOF
  ```
- [ ] `git tag v<NEW-VERSION>` is on `origin`.
- [ ] CHANGELOG and any GitHub Release notes match the published version.

## 7. Rollback

If a critical bug is found post-publish:

- Patch and republish; **do not** `npm unpublish` after 72 hours (npm policy + ecosystem impact).
- Consider `npm deprecate pubchem-mcp@<bad-version> "<reason>"` to warn users of the broken version.
