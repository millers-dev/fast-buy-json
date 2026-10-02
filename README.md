# FastBuyJSON

FastBuyJSON is a JSON contract for agents that search a catalog, manage a cart, check out, and read order status. This repository is the open-source contract plus reference HTTP servers, a local TypeScript SDK, and a stdio MCP server.

**Release:** `1.0.0`. See [`CHANGELOG.md`](CHANGELOG.md) and [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md).

Private commercial hosting may exist and is outside this repository.

## Start here

- [Getting started](docs/GETTING_STARTED.md) — Node and Python demos, demo users, and how the MCP server finds the API
- [Integrations](docs/INTEGRATIONS.md) — Claude Desktop, Cursor, and the ChatGPT HTTPS limit
- [TypeScript SDK](docs/SDK.md) — local `@fastbuyjson/sdk`
- [HTTP contract](docs/CONTRACT.md) — behavior, problem+json codes, and headers
- [MCP server](mcp-server/README.md) — stdio tools, including shipping and discount

## Quick start

Node.js 18+.

```bash
npm install
cp .env.example .env
npm start
```

API: <http://localhost:3000/api/fastbuyjson>

Python, demo users, Postman, and MCP setup are in [Getting started](docs/GETTING_STARTED.md).

## What is in this repo

```
fast-buy-json/
├── docs/                      # Contract, compatibility, and user guides
├── openapi/base.yaml          # Hand-authored paths/responses (no schemas)
├── openapi/fastbuyjson.yaml   # Generated OpenAPI (do not edit by hand)
├── schemas/                   # JSON Schema (draft-07) — single source of truth
├── examples/                  # Sample request/response payloads
├── sdk/typescript/            # @fastbuyjson/sdk (ESM, zero runtime deps)
├── src/server.js              # Node.js demo API
├── src/python/                # FastAPI demo API (same contract)
├── mcp-server/                # Reference stdio MCP server
├── postman/                   # Collection + environment (Python port 8000)
└── scripts/validate_schemas.py
```

## Checks

```bash
npm test
npm run test:python
npm run mcp:test
```

Schema, OpenAPI, example, and version checks: `npm run validate:schemas`, `npm run check:openapi`, `npm run check:examples`, `npm run check:versions`. Conformance cases are described in [`conformance/README.md`](conformance/README.md).

## License

MIT © Tomasz Miller
