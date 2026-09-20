# FastBuyJSON

FastBuyJSON is a JSON-based contract for LLM agents talking to e-commerce APIs. It covers product search, cart, checkout, and order status with strict schemas, idempotent writes, and a machine-readable discovery endpoint.

This repository is the **open-source standard plus a reference implementation**. Recovered and restored from local editor history after the working tree was deleted.

## What is in this repo

```
fast-buy-json/
├── openapi/fastbuyjson.yaml   # HTTP API (reconstructed from schemas + servers)
├── schemas/                   # JSON Schema (draft-07) request/response models
├── examples/                  # Sample request payloads
├── src/server.js              # Node.js demo API
├── src/python/                # FastAPI demo API (same contract)
├── mcp-server/                # Reference MCP server for Claude Desktop
├── postman/                   # Collection + environment
└── scripts/validate_schemas.py
```

Commercial multi-tenant hosting, billing, and dashboards live in the private [fast-buy-json-saas](https://github.com/millers-dev/fast-buy-json-saas) repo.

## HTTP contract

Base path: `/api/fastbuyjson`

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/detect` | Feature discovery for agents |
| `POST` | `/auth/login` | JWT login |
| `POST` | `/auth/refresh` | Refresh access token |
| `POST` | `/auth/certificate` | Certificate session |
| `POST` | `/products/search` | Catalog search |
| `POST` | `/cart/add` | Add line item (`Idempotency-Key` supported) |
| `GET` | `/cart` or `/cart/{cartId}` | Cart snapshot |
| `POST` | `/checkout/initiate` | Start checkout session |
| `POST` | `/checkout/confirm` | Confirm payment / create order |
| `GET` | `/orders/{orderId}` | Order status |

OpenAPI: [`openapi/fastbuyjson.yaml`](openapi/fastbuyjson.yaml)

## Quick start (Node demo)

Requires Node.js 18+.

```bash
npm install
cp .env.example .env
npm start
```

API: <http://localhost:3000/api/fastbuyjson>

Demo users (in-memory only):

- `demo` / `password123`
- `admin` / `admin123`

## Quick start (Python demo)

Requires Python 3.11+.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
npm run start:python
```

API: <http://localhost:8000/api/fastbuyjson>  
Interactive docs: <http://localhost:8000/docs>

The Postman environment points at the Python port by default.

## MCP server (Claude Desktop)

```bash
cd mcp-server
npm install
npm run build
./install.sh
```

The reference server talks to a running FastBuyJSON API (`FASTBUYJSON_API_URL`). A mock-only entry point is `src/index-mock.ts`.

See [`mcp-server/README.md`](mcp-server/README.md) and [`mcp-server/EXAMPLES.md`](mcp-server/EXAMPLES.md).

## Validation

```bash
pip install jsonschema==4.22.*
python scripts/validate_schemas.py
```

CI runs the same checks on every pull request.

## Recovery notes

Source snapshot: VS Code Local History + Copilot chat sessions, 2026-09-20.

Reconstructed after recovery (original files were empty or purged):

- Root `package.json`
- `openapi/fastbuyjson.yaml` (from `schemas/`, `postman/`, and demo servers)
- README and MCP server docs
- Schema validation script / CI workflow

Damaged files that were repaired:

- `mcp-server/src/index.ts` (missing `zod` import; wired to the HTTP adapter)
- `mcp-server/test.js` (corrupted header from a merge of two snapshots)
- `mcp-server/src/mock-adapter.ts` (missing `confirmCheckout`)
- `postman/fastbuyjson.postman_collection.json` (spliced "Get Cart by ID" into checkout URL)

## License

MIT © Tomasz Miller
