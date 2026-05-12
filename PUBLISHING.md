# Publishing pubchem-mcp

This document is the gate between the repository and the public npm registry.
Most of the mechanics live in CI now — see [`docs/ci-cd.md`](docs/ci-cd.md) for
the workflow details and [`docs/release-checklist.md`](docs/release-checklist.md)
for the per-release runbook.

## Release history

| Version | Date | Method | Notes |
|---|---|---|---|
| `0.1.0` | 2026-05-12 | **Manual** `npm publish` from a maintainer's laptop | First public release; predates the CI/CD pipeline. Tag `v0.1.0` is historical and **must not be reused**. |
| `0.1.1+` | — | **GitHub Actions → npm Trusted Publishing (OIDC)** | All future releases. |

The publish workflow refuses to republish `0.1.0` even if someone retags it.

## Package-name ownership

`pubchem-mcp` is claimed on the public npm registry under the maintainer
account that performed the manual `0.1.0` publish. Future publishes via
Trusted Publishing must originate from the same GitHub repository
(`quaat/pubchem-mcp`) configured on the npm package's Trusted Publisher list.

## Future release process (TL;DR)

```bash
# 1. Bump
npm version patch              # or minor / major (not "0.1.0")

# 2. Edit CHANGELOG.md and push
git push && git push --tags

# 3. release-check.yml runs automatically on the tag.
# 4. publish.yml waits for approval in the `npm-publish` environment.
# 5. Once approved, OIDC publish runs; provenance attached automatically.
# 6. Verify on https://www.npmjs.com/package/pubchem-mcp .
```

> The publish workflow has **no `workflow_dispatch`**. A `v*.*.*` tag push is
> the only trigger, and the `npm-publish` GitHub Environment is the only
> human approval gate. This is intentional: a manual dispatch from a branch
> could otherwise bypass the tag/version match guard. To publish a new
> version, push the tag — there is no "Run workflow" button.

Full step-by-step list with verification commands lives in
[`docs/release-checklist.md`](docs/release-checklist.md).

## Trusted Publisher setup (one-time, on npmjs.com)

Configure the package's Trusted Publisher so the OIDC publish workflow is
trusted. Fields **must match exactly**:

| Field | Value |
|---|---|
| Package | `pubchem-mcp` |
| Provider | GitHub Actions |
| Owner | `quaat` |
| Repository | `pubchem-mcp` |
| Workflow filename | `publish.yml` |
| Environment name | `npm-publish` |

If any of those values change (renamed repo, transferred ownership), the
Trusted Publisher entry must be updated *before* the next release or
`npm publish` in CI will fail.

## GitHub environment setup (one-time)

1. **Settings → Environments → New environment** → `npm-publish`.
2. Add at least one **Required reviewer** (a maintainer must approve every
   publish run before it can talk to npm). This is the **only** human gate
   on the publish flow — the workflow itself has no manual dispatch button.
3. Restrict to `v*.*.*` tags via the environment's *Deployment branches and
   tags* allowlist. (Adding `main` is unnecessary; the publish workflow only
   triggers on tags.) Setting this allowlist provides defense-in-depth: even
   if the publish workflow trigger is later weakened, the environment refuses
   to release secrets/OIDC to a non-tag ref.
4. **Do not add any environment secrets.** Trusted Publishing does not need
   them.

## Metadata requirements

Before publishing any new version, the publish workflow (via
`scripts/check-package-metadata.mjs`) enforces:

- `name` is `pubchem-mcp`
- `version` is a valid semver and is not `0.1.0`
- `description`, `license`, `repository`, `homepage`, `bugs` are all set
- `author` or `contributors` is set
- `bin["pubchem-mcp"] = "./bin/pubchem-mcp"` and the file exists
- `exports["."]` and `exports["./package.json"]` are present
- `files` includes `dist/`, `bin/`, `README.md`, `LICENSE`
- `repository.url` matches a public GitHub URL
- No placeholder strings (`TODO-OWNER`, `TODO-set-before-publish`, etc.) remain

## Why not `NPM_TOKEN`?

Long-lived tokens are a single high-value credential and grant publish from
anywhere the secret leaks. The OIDC path:

- generates fresh, short-lived publish credentials per workflow run,
- attaches provenance automatically for eligible public packages,
- ties every publish to a specific GitHub workflow run.

There is no token fallback by default. If npm temporarily disables OIDC and a
fallback is truly required, it must be added behind an explicit opt-in repo
variable (e.g. `USE_NPM_TOKEN_FALLBACK=true`) and documented in
[`docs/ci-cd.md`](docs/ci-cd.md).

## Rollback / recovery

- A bad version cannot be silently replaced. Patch + republish.
- `npm unpublish` is blocked 72 hours after publish.
- Use `npm deprecate pubchem-mcp@<bad> "<reason>"` to warn installers.
- Cut a fixed release as soon as practical and update the CHANGELOG.
