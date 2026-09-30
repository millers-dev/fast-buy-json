# FastBuyJSON

FastBuyJSON is a JSON-based contract for LLM agents talking to e-commerce APIs. It covers product search, cart, checkout, and order status with strict schemas, idempotent writes, and a machine-readable discovery endpoint.

This repository is the **open-source standard plus a reference implementation**. Recovered and restored from local editor history after the working tree was deleted.

**Release:** `0.5.0` — runtime request validation, TypeScript SDK (`sdk/typescript/`), OpenAPI response examples, and MCP integration tests in CI. See [`CHANGELOG.md`](CHANGELOG.md).

## What is in this repo

```
fast-buy-json/
├── openapi/base.yaml            # Hand-authored paths/responses (no schemas)
├── openapi/fastbuyjson.yaml   # Generated OpenAPI (do not edit by hand)
├── schemas/                   # JSON Schema (draft-07) — single source of truth
├── examples/                  # Sample request/response payloads
├── sdk/typescript/            # @fastbuyjson/sdk (ESM, zero runtime deps)
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

OpenAPI: [`openapi/fastbuyjson.yaml`](openapi/fastbuyjson.yaml) (generated). Contract notes: [`docs/CONTRACT.md`](docs/CONTRACT.md). Changelog: [`CHANGELOG.md`](CHANGELOG.md).

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
pip install -r requirements.txt
python scripts/validate_schemas.py
node scripts/capture_examples.mjs
python scripts/build_openapi.py --check
node scripts/capture_examples.mjs --check
openapi-spec-validator openapi/fastbuyjson.yaml
python scripts/check_versions.py
npm test
python -m pytest tests/test_python_server.py conformance/harness/python
npm run sdk:install && npm run check:sdk-types
npm run mcp:test
```

CI runs these gates on every pull request.

## TypeScript SDK

```bash
npm run sdk:install
npm run sdk:generate-types
npm --prefix sdk/typescript run build
```

Import `@fastbuyjson/sdk` from `sdk/typescript/` (local path; not published to npm in 0.5.0).

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
