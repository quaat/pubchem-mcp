# Resources

The server exposes six MCP resource templates. Resources call the same service layer as tools, but are intended for clients that already know a CID/AID and want a stable, idempotent read.

| URI template | Mirrors tool | Returns |
|---|---|---|
| `pubchem://compound/{cid}` | `get_compound` | Normalized compound summary |
| `pubchem://compound/{cid}/properties` | `get_compound_properties` (default set) | Property rows |
| `pubchem://compound/{cid}/synonyms` | `get_compound_synonyms` (default limit) | Synonym list |
| `pubchem://compound/{cid}/structure` | `get_compound_structure` (`format=json`) | Full PUG-REST JSON record |
| `pubchem://compound/{cid}/annotations` | `get_compound_annotations` (default limits) | PUG-View sections |
| `pubchem://assay/{aid}` | `get_assay` | Normalized bioassay summary |

All resources return `mimeType: application/json` and JSON-stringified payloads identical to the matching tool. On error, the resource still returns a valid contents array with an `{ error, category, retryable, endpoint }` JSON body, so clients can render the failure without exception handling.

## Examples

```text
pubchem://compound/2244
pubchem://compound/2244/properties
pubchem://compound/2244/synonyms
pubchem://compound/2244/structure
pubchem://compound/2244/annotations
pubchem://assay/1259357
```

## When to use a resource vs a tool

- **Tool**: when parameters matter — e.g. searching, filtering, choosing a property subset, picking SDF vs SMILES, paging.
- **Resource**: when the client already has a CID/AID and wants the standard, cacheable read. Resources also let MCP clients surface "discoverable" data in their UI.

Both call the same service layer, so caching and rate limiting are shared.
