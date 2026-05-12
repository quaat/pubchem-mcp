# Changelog

All notable changes to `pubchem-mcp` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] — 2026-05-13

### Fixed

- **PubChem SMILES property rename compatibility.** PubChem PUG-REST renamed
  the SMILES property keys in the response payload — `IsomericSMILES` is now
  served as `SMILES` and `CanonicalSMILES` is now served as
  `ConnectivitySMILES`. The previous release requested the legacy names in
  the URL, PubChem accepted them, but the response was keyed under the new
  names. The result was that `resolve_compound`, `get_compound`, and
  `get_compound_structure({ format: 'smiles' })` returned `undefined` for
  the SMILES fields against the live API while continuing to pass the mocked
  test suite that used pre-rename fixtures.

  The fix introduces a small alias layer in `propertyRegistry`:
  - `PROPERTY_ALIASES` maps legacy → current names.
  - `propertiesForPubChem(requested)` translates aliases at the URL boundary
    and deduplicates so requesting both `CanonicalSMILES` and
    `ConnectivitySMILES` does not duplicate on the wire.
  - `readPropertyValue(row, requested)` reads under the current wire name
    first and falls back to the legacy name (in either direction) so that
    cached fixtures and old responses continue to work.

  Public API contract is preserved:
  - `NormalizedCompound.canonicalSmiles` reads
    `ConnectivitySMILES ?? CanonicalSMILES`.
  - `NormalizedCompound.isomericSmiles` reads `SMILES ?? IsomericSMILES`.
  - `get_compound_properties` still validates legacy names and returns the
    requested key in the output row, populated from PubChem's current
    response key when needed.
  - `get_compound_structure({ format: 'smiles' })` continues to return
    connectivity SMILES (legacy semantics) — no API change.

### Added

- `SMILES` and `ConnectivitySMILES` accepted as supported property names by
  `get_compound_properties`.
- Helpers `toPubChemPropertyName`, `propertiesForPubChem`, `readPropertyValue`
  in `src/pubchem/propertyRegistry.ts`.

### Tests

- Alias validation and wire-name translation tests in
  `test/unit/pubchem/propertyRegistry.test.ts`.
- URL-builder translation and deduplication tests in
  `test/unit/pubchem/pubchemUrls.test.ts`.
- Current-key and legacy-key fixtures in `test/unit/utils/normalize.test.ts`,
  plus the full `rowsForProperties` alias matrix.
- `getStructure({ format: 'smiles' })` regression: mocked response uses
  `ConnectivitySMILES`; back-compat regression uses legacy `CanonicalSMILES`.

## [0.1.0] — initial release candidate

### Added

- MCP stdio server (`@modelcontextprotocol/sdk` v1.x) exposing 10 tools, 6 resource templates, and 3 prompts.
- Tools: `resolve_compound`, `get_compound`, `get_compound_properties`, `get_compound_synonyms`, `get_compound_structure`, `search_structure`, `get_assay`, `get_compound_assays`, `get_compound_annotations`, `get_server_status`.
- Resources: `pubchem://compound/{cid}`, `pubchem://compound/{cid}/properties`, `pubchem://compound/{cid}/synonyms`, `pubchem://compound/{cid}/structure`, `pubchem://compound/{cid}/annotations`, `pubchem://assay/{aid}`.
- Prompts: `compound-research-brief`, `compare-compounds`, `safety-annotation-review`.
- PubChem PUG-REST and PUG-View clients funneled through a single network pipeline: cache → rate limiter → throttle gate → fetch → header parse → retry → typed error mapping.
- Token-bucket rate limiter (per-second) + sliding window (per-minute) with configurable caps and PubChem's documented hard caps (5 req/s, 400 req/min) enforced in config validation.
- Dynamic `X-Throttling-Control` parsing into a shared `ThrottleStateTracker`; Yellow/Red/Black states apply pre-request backoff. Latest state surfaced by `get_server_status`.
- Exponential-backoff retry with ±20% jitter for 429/5xx and transport-level errors. 400/404/405/501 are never retried.
- In-memory TTL cache (LRU-bounded, default 24 h) with optional per-request TTL override and `PUBCHEM_CACHE_DISABLE=1` opt-out.
- Typed error hierarchy (`PubChemValidationError`, `PubChemNotFoundError`, `PubChemRateLimitError`, `PubChemTransientError`, `PubChemUnsupportedOperationError`, `PubChemResponseError`).
- POST/form-urlencoded support for InChI lookups and InChI structure searches per PubChem's documented input channel for InChI.
- POST routing for complex SMILES inputs (URL-reserved characters or > 256 characters); simple SMILES continue to use path-encoded GET.
- Network/timeout failures are normalized to `PubChemTransientError` with `category: "transient"`, `retryable: true`, and a sanitized endpoint label — no raw URLs or stack traces leak into MCP tool responses.
- Full-JSON structure responses bounded at 256 KB with `truncated: true` and `_meta.warnings` on overflow. SDF responses bounded at the same limit.
- Property allowlist enforced; unsupported names rejected with a `PubChemValidationError`.
- Live integration tests gated by `PUBCHEM_MCP_LIVE_TESTS=1`. When network is unavailable they fail with structured diagnostics rather than hanging.
- Documentation: README, `docs/{architecture,tools,resources,pubchem-access,safety-and-limitations,research-notes,release-checklist}.md`, MCP client config examples for Claude Desktop and Claude Code, `PUBLISHING.md`, and this changelog.

### Security

- Dev and production audit reports zero vulnerabilities (after upgrading to `vitest`/`@vitest/coverage-v8` `^4.1.6`).
- Server is read-only: no write endpoints, no shelling out, no arbitrary URL fetching.
