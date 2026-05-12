# Architecture

`pubchem-mcp` is a three-layer TypeScript MCP server. Each layer has a single responsibility and depends only on layers below it.

```
+-----------------------------+
|     MCP layer  (src/server) |   tools.ts, resources.ts, prompts.ts, createServer.ts
+--------------+--------------+
               |
+--------------v--------------+
|   Service layer (src/services) |  one file per business concern
+--------------+--------------+
               |
+--------------v--------------+
| PubChem / infra layer       |  pugRestClient, pugViewClient, rate limiter, cache, retry, throttling
+-----------------------------+
```

## MCP layer (`src/server/`)

- `createServer.ts` instantiates `McpServer`, wires the cache / rate limiter / throttle tracker / clients, and delegates registration to the other three files.
- `tools.ts` registers all ten tools using `server.registerTool(...)`. Tool handlers do three things: validate input (via the Zod shapes in `src/schemas/toolSchemas.ts`, but the SDK does this automatically), call the matching service method, and shape the result into `{ content: [{ type: 'text', text: ... }] }`. Errors are mapped through `toErrorResponse()` which never leaks stack traces or raw URLs.
- `resources.ts` registers `ResourceTemplate`-based resources. Each handler is a thin wrapper around a service method.
- `prompts.ts` registers three sourced-research prompts. Each prompt's text reinforces "use only PubChem data" and "no medical/regulatory/safety advice".

No module in this layer ever calls `fetch` directly. No module in this layer knows about PubChem URLs.

## Service layer (`src/services/`)

Each file is a small class with the configured `ServiceContext` (config + logger + clients). Each method:

- builds a PubChem URL via `src/pubchem/pubchemUrls.ts`,
- calls `PugRestClient.getJson(...)` or `getText(...)`,
- normalizes the response into a DTO from `src/pubchem/pubchemTypes.ts`,
- attaches a `_meta` object (`source`, `backend`, `retrievedAt`, `query`, optional `warnings[]`).

Services are unit-tested with `msw/node`-mocked PubChem responses via `test/helpers/serviceContext.ts`.

## PubChem / infrastructure layer

`src/pubchem/pugRestClient.ts` is the single I/O chokepoint. Every request goes through this pipeline:

1. **Cache check** (`TtlCache` in `src/infrastructure/cache.ts`). 24h TTL default, LRU eviction, disabled when `PUBCHEM_CACHE_DISABLE=1`.
2. **Rate limiter acquire** (`RateLimiter` in `src/infrastructure/rateLimiter.ts`). Token-bucket per-second (default 4 req/s, hard cap 5) and sliding-window per-minute (default 240, hard cap 400). Requests queue serially — no bursting.
3. **Throttle gate** — if the most recent `X-Throttling-Control` was Yellow/Red/Black, sleep the suggested backoff (`src/infrastructure/throttling.ts`).
4. **Fetch** via the injected `fetch` with `AbortController` timeout and a `User-Agent` of `pubchem-mcp/<version>` plus the optional `PUBCHEM_CONTACT_URL`.
5. **Throttle update** — parse `X-Throttling-Control` from the response and update the shared `ThrottleStateTracker`.
6. **Retry** (`withRetry` in `src/infrastructure/retry.ts`) — exponential backoff with ±20% jitter for retryable errors (429, 5xx, network), capped at `PUBCHEM_MAX_RETRIES`.
7. **Error mapping** — HTTP statuses and `Fault` bodies are mapped to the typed errors in `src/pubchem/pubchemErrors.ts`. Each error carries `category`, `retryable`, sanitized `endpoint`, and `status`.

`src/pubchem/pugViewClient.ts` is a nominal subclass so service-layer call sites read clearly (`ctx.view.getJson(...)`).

## Why PUG-REST is primary, PUG-View is secondary

PUG-REST is the right tool for structured data: deterministic property tables, identifier lookups, synonyms, structure search, and assay summaries. It is the canonical machine-readable API.

PUG-View is the right tool for curated, source-cited annotation prose: pharmacology, hazards, literature, patents. It is hierarchical and heading-based and unsuitable for bulk identifier resolution.

We use PUG-REST first for everything machine-structured. We reach for PUG-View only when annotation content is the explicit goal (`get_compound_annotations`), and we present its results as **source data** with provenance, never as the server's own analysis.

## Configuration flow

`src/infrastructure/config.ts` parses `process.env` through a Zod schema with safe defaults and hard caps. `src/index.ts` calls `loadConfig()`, creates the logger and the server via `createServer({ config, logger })`, and connects a `StdioServerTransport`. Logs go to stderr; stdout is reserved for the JSON-RPC frame.

## Test layout

- `test/unit/infrastructure` — rate limiter, retry, cache, throttling, config, logger.
- `test/unit/pubchem` — URL builders, error classification, property registry, full `PugRestClient` pipeline against `msw`.
- `test/unit/utils` — identifier auto-detection, response normalization.
- `test/unit/services` — each service against an `msw`-mocked PubChem.
- `test/integration/mcp.test.ts` — full MCP roundtrip via `InMemoryTransport.createLinkedPair()`. Lists / calls every tool, reads every resource, lists / fetches every prompt.
- `test/integration/live.test.ts` — gated by `PUBCHEM_MCP_LIVE_TESTS=1`; skipped by default.
