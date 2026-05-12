# CLAUDE.md

Notes for future Claude Code sessions working on this repo.

## Build / test / lint commands

```bash
npm install
npm run typecheck   # tsc --noEmit on src/ + test/
npm run lint        # eslint flat config
npm test            # vitest run (live tests skipped by default)
npm run build       # tsc emit to dist/, src/ only
npm start           # node dist/index.js (stdio MCP server)
PUBCHEM_MCP_LIVE_TESTS=1 npm test   # include live integration tests
```

## Code style

- Strict TypeScript, ESM, `module: NodeNext`. `.js` import extensions in source.
- No `any`. Prefer narrow `unknown` + type guards.
- No `console.log` in production code; use the pino logger from `src/infrastructure/logger.ts`. The logger always writes to **stderr** so it never collides with the stdio MCP frame on stdout.
- Two spaces, single quotes, trailing commas. `npm run format` to apply.
- Don't write doc comments restating the obvious; only comment why for non-obvious choices.

## Architecture

Three layers — keep them strictly separated:

1. `src/server/` — MCP layer. Tool/resource/prompt registration only. Validates input via Zod, calls a service, formats MCP responses.
2. `src/services/` — service layer. Knows about PubChem semantics. Returns normalized DTOs from `src/pubchem/pubchemTypes.ts`. Never touches the network directly.
3. `src/pubchem/` + `src/infrastructure/` — only modules that touch the network. `PugRestClient` is the single chokepoint; everything funnels through its pipeline (cache → rate-limiter → throttle gate → fetch → header parse → retry → typed error mapping).

If you find yourself adding `fetch(...)` outside `pugRestClient.ts`, stop and reroute through the client.

## Testing rules

- Vitest. Unit tests under `test/unit/`, integration under `test/integration/`.
- Mocked HTTP via `msw/node`. Use the `test/helpers/serviceContext.ts` helper to wire a fully-configured service context with msw.
- MCP integration tests use `InMemoryTransport.createLinkedPair()` from `@modelcontextprotocol/sdk/inMemory.js`.
- Live integration tests are gated by `PUBCHEM_MCP_LIVE_TESTS=1` and **must** stay gated. Don't make them run by default.
- Never write tests that fabricate property values to pass a check — the whole point of this server is no-fabrication.

## Safety rules

- Read-only. No write endpoints, no shelling out, no `eval`, no arbitrary URL fetching.
- Only call configured PubChem domains (`PUBCHEM_BASE_URL` / `PUBCHEM_VIEW_BASE_URL`).
- Tool error responses must not include stack traces or full internal URLs. Use `sanitizeEndpoint(url, config)` from `pugRestClient.ts` to scrub URLs in error messages.
- Annotation text from PUG-View is **source data**, not predictions. Documentation and prompts must reinforce this.
- No medical/regulatory/laboratory-safety advice in tool responses, prompts, or docs.

## PubChem access rules

- Default rate caps: `PUBCHEM_RPS=4`, `PUBCHEM_RPM=240`. Hard caps in `src/infrastructure/config.ts`: 5 req/sec, 400 req/min.
- All requests go through `PugRestClient.request()`. ListKey async polling is in `pollListKey()` on the same client.
- Parse `X-Throttling-Control` on every response into `ThrottleStateTracker`. Use `suggestedBackoffMs(state)` to delay the next request when state ≥ Yellow.
- Retry policy: 429/5xx + network errors → exponential backoff with jitter (500 ms → 16 s, ±20%). 400/404/405/501 → never retry. See `src/infrastructure/retry.ts`.
- Cache GETs in memory (TTL default 24h). Errors are not cached.

## Common pitfalls

- `inputSchema` for `registerTool` takes a **raw Zod shape object** (e.g. `{ cid: z.number() }`), not `z.object({...})`. Same for `argsSchema` on `registerPrompt`.
- PubChem returns `400 Bad Request` for malformed SMILES; this is non-retryable. Don't lump it with `503`.
- PUG-REST returns a `Fault` object inside a 2xx body for some failure modes. `executeOnce` checks for this and throws an appropriate typed error.
- The `PUBCHEM_BASE_URL` is a prefix of `PUBCHEM_VIEW_BASE_URL` (`.../pug` is a prefix of `.../pug_view`). When matching base URLs, match the longer one first.
- MSW intercepts `globalThis.fetch`. If you ever wrap `fetch` with `node:undici`, MSW won't see it — keep `fetchImpl` pluggable.
