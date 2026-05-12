# Safety and Limitations

## What this server is

A **read-only**, **source-faithful** Model Context Protocol server for PubChem. It exposes the data PubChem publishes via PUG-REST and PUG-View, normalized for MCP clients.

## What this server is not

- It is **not** a source of medical, toxicological, regulatory, occupational-safety, or laboratory-safety advice.
- It is **not** a prediction engine. It does not estimate ADMET, toxicity, environmental fate, drug-drug interactions, regulatory status, or pharmacophore features. It does not fabricate values to fill missing fields.
- It is **not** a substitute for an authoritative safety data sheet (SDS), regulatory filing, peer-reviewed primary source, or qualified professional advice.

## Annotations are source data

`get_compound_annotations` and the `pubchem://compound/{cid}/annotations` resource return text drawn from PubChem's curated PUG-View sections, with source citations from PubChem's reference list. This is **source data**, not the server's analysis or recommendation. Treat it the way you would treat a database export, not the way you would treat clinical guidance.

## No fabrication

If PubChem returns no data for a query, this server returns an error. It will not:

- Estimate missing molecular weights, logP, or other computed properties.
- Invent synonyms.
- Infer safety classifications.
- Confabulate annotation text that PubChem has not published.

If you see a value in a response, it came from PubChem.

## Bounded results

Every list-returning tool has a hard upper bound:

- `resolve_compound`: ≤ 100 candidates
- `get_compound_properties`: ≤ 100 CIDs per call
- `get_compound_synonyms`: ≤ 500
- `search_structure`: ≤ 100 hits
- `get_compound_assays`: ≤ 200 AIDs
- `get_compound_annotations`: ≤ 100 sections

These bounds prevent unbounded queries that would overrun PubChem's limits or the MCP transport.

## Rate-limit compliance

The server defaults to 4 req/sec and 240 req/min, well under PubChem's published 5 req/sec / 400 req/min caps. It parses `X-Throttling-Control` from every response and slows itself down when PubChem signals pressure. Do not raise `PUBCHEM_RPS` above 5 — the config schema rejects values above PubChem's documented ceiling.

## Verify critical decisions

For any chemistry, medical, regulatory, or laboratory-safety decision that matters:

1. Verify against the **PubChem record itself** at `https://pubchem.ncbi.nlm.nih.gov/compound/{cid}`.
2. Cross-check with at least one **authoritative primary source** (manufacturer SDS, regulatory filing, peer-reviewed literature).
3. Consult a **qualified professional** (toxicologist, pharmacist, regulatory affairs specialist, certified industrial hygienist) before acting on the data.

This server's role is data retrieval. The user is responsible for evaluating and applying the data.
