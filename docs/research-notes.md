# Research Notes

Notes captured during the initial planning phase for this server. Persisted here so future contributors don't have to re-derive these facts.

## PubChem programmatic access

### Interfaces

- **PUG-REST** — primary backend. RESTful HTTP for compound / substance / assay / gene / protein data. Best for synchronous queries and structured property retrieval.
- **PUG-View** — secondary backend. Curated annotation sections organized hierarchically by TOC heading. Used for pharmacology, hazards, literature, patents.
- **PUG (legacy XML)** — superseded by the above; not used here.

### PUG-REST URL pattern

```
https://pubchem.ncbi.nlm.nih.gov/rest/pug/{input}/{operation}/{output}
```

Examples:

- Resolve name → CIDs: `/compound/name/aspirin/cids/JSON`
- Property table: `/compound/cid/{cid}/property/{props}/JSON`
- Batch properties: `/compound/cid/2244,5793/property/MolecularFormula,MolecularWeight/JSON`
- Synonyms: `/compound/cid/{cid}/synonyms/JSON`
- SDF: `/compound/cid/{cid}/SDF` (with optional `?record_type=2d|3d`)
- Compound → assay IDs: `/compound/cid/{cid}/aids/JSON`
- Assay summary: `/assay/aid/{aid}/summary/JSON`

### Identifier types we support

`cid`, `name`, `smiles`, `inchi`, `inchikey`, `formula` (via `fastformula`).

### Supported property names

PubChem's property table accepts the names captured in `src/pubchem/propertyRegistry.ts`. Defaults: `MolecularFormula`, `MolecularWeight`, `CanonicalSMILES`, `IsomericSMILES`, `InChI`, `InChIKey`, `IUPACName`, `XLogP`, `TPSA`, `Complexity`, `Charge`, `HBondDonorCount`, `HBondAcceptorCount`, `RotatableBondCount`, `HeavyAtomCount`.

### Structure search

- Synchronous: `fastidentity`, `fastsimilarity_2d`, `fastsubstructure`, `fastsuperstructure`. Return CIDs directly when result set is small.
- Asynchronous: `identity`, `similarity_2d`, `substructure`, `superstructure`. Return `202 Accepted` + `Waiting.ListKey`. Poll `/compound/listkey/{key}/cids/JSON` until you get `IdentifierList.CID`.
- Similarity searches accept `?Threshold=N` (0–100, default 90).
- Caps via `?MaxRecords=N`.

### PUG-View

```
https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/{cid}/JSON
```

Optional `?heading=<TOCHeading>` filter. Response shape: `Record.Section[].Section[].Information[].Value.StringWithMarkup[]` with `Reference` provenance at the record level.

### Status codes

- `200` — success
- `202` — async; body has `Waiting.ListKey`
- `400` — bad input. **Do not retry.**
- `404` — not found. **Do not retry.**
- `405` / `501` — unsupported operation. **Do not retry.**
- `429` — rate limit. Retry with backoff.
- `500` / `502` / `503` / `504` — transient. Retry with backoff.

PubChem occasionally returns a `Fault` object inside a 2xx body. The client checks for this and throws a typed error.

### Dynamic throttling

PubChem documents hard limits of 5 req/sec and 400 req/min and emits an `X-Throttling-Control` header on every response, of the documented shape:

```
Request Count status: Green (10%), Request Time status: Green (5%), Service status: Green (20%)
```

The colors track the percentage of each quota consumed. The parser in `src/infrastructure/throttling.ts` tolerates malformed/abbreviated variants. The `suggestedBackoffMs` helper translates `worstStatus` into a pre-request delay:

| Status | Pre-request delay |
|---|---|
| Green / unknown | 0 ms |
| Yellow | 200 ms |
| Red | 1000 ms |
| Black | 5000 ms |

The `get_server_status` MCP tool surfaces the latest parsed state.

### Caching guidance

GET endpoints are idempotent and safe to cache. CID-based lookups are stable indefinitely. Name lookups can drift as synonyms change — we use a 24h TTL by default.

### Implementation gotchas

- Name resolution may return empty `CID` arrays — handle as not-found.
- `record_type=2d|3d` is required for some SDF requests.
- PUG-View heading filter is case-insensitive on our side (we substring-match `TOCHeading.toLowerCase()`).
- The PUG-REST base URL is a prefix of the PUG-View base URL (`/pug` vs `/pug_view`). Match the longer prefix first when sanitizing endpoint labels.

## MCP TypeScript SDK

### Versions

- Production-stable: **`@modelcontextprotocol/sdk` v1.x** (we pin `^1.29.0`). Lives on the `v1.x` branch upstream.
- The `main` branch is **v2 pre-alpha** with split packages `@modelcontextprotocol/server` and `@modelcontextprotocol/client` — not used here.

### Recommended API

```typescript
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({ name: 'pubchem-mcp', version: '0.1.0' });

server.registerTool(
  'tool-name',
  { title: 'Display title', description: 'What it does', inputSchema: { foo: z.string() } },
  async ({ foo }) => ({ content: [{ type: 'text', text: foo }] }),
);

server.registerResource(
  'resource-name',
  new ResourceTemplate('scheme://{param}', { list: undefined }),
  { title: 'Title', mimeType: 'application/json' },
  async (uri, vars) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: '...' }] }),
);

server.registerPrompt(
  'prompt-name',
  { title: 'Title', description: '...', argsSchema: { arg: z.string() } },
  ({ arg }) => ({ messages: [{ role: 'user', content: { type: 'text', text: arg } }] }),
);

await server.connect(new StdioServerTransport());
```

`inputSchema` and `argsSchema` accept **raw Zod shape objects**, not `z.object(...)`.

### Error handling

Tool handlers return `{ content: [...], isError?: true }`. Mark `isError: true` and put a helpful message in `content[0].text`. Throwing from a handler becomes a JSON-RPC protocol error and is generally less useful to LLM clients than a structured error result.

### Stdio transport

`new StdioServerTransport()`. Stdout is reserved for the MCP frame; **logs must go to stderr**.

### Streamable HTTP

Available under `@modelcontextprotocol/sdk/server/streamableHttp.js` but we ship stdio only in v1 of this server.

## Community PubChem MCP projects (survey)

Surveyed for inspiration; no code reused.

### JackKuo666/PubChem-MCP-Server (Python, MIT)

- Wraps `pubchempy` directly. Four tools (`search_pubchem_by_name`, `_by_smiles`, `get_pubchem_compound_by_cid`, `search_pubchem_advanced`).
- No rate limiting, no caching, no retries, no result bounding. `max_results` unbounded.
- Useful idea: progressive disclosure (basic search → CID → detailed lookup).

### augmented-nature/pubchem-mcp-server (TypeScript, MIT)

- Monolithic `PubChemServer` class with 24 tools across six categories.
- Resource templates (`pubchem://compound/{cid}`) — adopted shape.
- Gaps: ~14 tools return "not yet implemented" placeholders; no rate limiting; up-to-10,000-record similarity result sets; weak input validation (some `required: []` on tools that need parameters).

### Lessons applied here

- Bounded result limits with explicit defaults and maxes on every list-returning tool.
- Strict property allowlist instead of pass-through.
- Real rate limiter + retry + cache + throttle-state tracker (the four production gaps in both upstreams).
- Service layer separate from MCP wiring so resources and tools share logic.
- Refuse to fabricate: tools error out rather than ship placeholder data.
