# FastBuyJSON user-docs plan

Status: accepted. English only. This file records the user-doc set for the open-source FastBuyJSON **1.0.0** repository (`millers-dev/fast-buy-json`): the JSON contract, the Node and Python reference APIs, the TypeScript SDK, and the reference MCP server.

## 1. Goals

- A new clone can start a demo API and call `/api/fastbuyjson` without reading CI internals.
- A reader can point Claude Desktop or Cursor at the existing stdio MCP server and talk to that demo.
- Contract truth stays in the files that already own it: [`CONTRACT.md`](CONTRACT.md) and [`COMPATIBILITY.md`](COMPATIBILITY.md). User guides link to them; they do not restate the error registry or the 1.x policy.

## Non-goals

- No new product surface. No hosted service, accounts, payments product, or extra processes.
- No HTTP or remote MCP transport. `mcp-server/src/index.ts` and `mcp-server/src/index-mock.ts` use `StdioServerTransport` only. This plan does not invent a bridge.
- No npm publish of `@fastbuyjson/sdk`. 1.0.0 imports it from `sdk/typescript/` on disk.
- No version bump, schema change, or OpenAPI change. Documentation is not a contract change.
- No second documentation language.
- At most one sentence, anywhere in the user docs, that private commercial hosting may exist. No setup, no URLs, no product walkthrough.

## 2. Audience

Primary:

- Agent builders who want FastBuyJSON tools inside Claude Desktop or Cursor.
- Store or API integrators who implement or call the HTTP contract (`/api/fastbuyjson`) via the demos, Postman, or the local TypeScript SDK.

Secondary (short pointers only, not new guides):

- Contributors running the existing validation and conformance commands already listed in the README.

Out of audience for this pass: operators of anything outside this repository.

## 3. Doc tree

Keep unchanged as contract source of truth:

- `docs/CONTRACT.md` — HTTP behavior, problem+json codes, headers.
- `docs/COMPATIBILITY.md` — 1.x additive rules.
- `openapi/fastbuyjson.yaml` — generated spec (do not edit by hand).
- `schemas/` — JSON Schema draft-07.

User docs:

| Path | Contents |
|------|----------|
| `README.md` | What FastBuyJSON is, release `1.0.0`, repo map, links to getting started, contract, integrations, and SDK. Three-command quick start. Short checks pointer. License (MIT, Tomasz Miller). |
| `docs/GETTING_STARTED.md` | Node demo, Python demo, demo users, where the API lives, how MCP finds it. |
| `docs/INTEGRATIONS.md` | Claude Desktop, Cursor, OpenAI / ChatGPT notes. Shapes below. |
| `docs/SDK.md` | Local `@fastbuyjson/sdk`: install, generate types, `FastBuyClient` options, method list, `FastBuyProblemError`. |
| `mcp-server/README.md` | stdio-only, full tool list from `src/index.ts`, `FASTBUYJSON_API_URL`, `./install.sh`, mock entry `src/index-mock.ts`, link to `EXAMPLES.md` and `docs/INTEGRATIONS.md`. |

Leave in place, link rather than duplicate:

- `mcp-server/EXAMPLES.md` — prompt walkthroughs. Config samples use the canonical URL below.
- `mcp-server/install.sh` — Claude Desktop installer (macOS, Windows, Linux config paths). The URL string it writes matches the Node demo.
- `mcp-server/claude_desktop_config.json` — checked-in shape; relative `./dist/index.js` (`install.sh` writes an absolute path).
- `conformance/README.md`, `CHANGELOG.md`, `postman/`.

No `CONTRIBUTING.md`. No committed `.cursor/mcp.json`.

### README outline

1. One paragraph: JSON contract for agents (search, cart, checkout, order status) plus reference servers.
2. Release line: `1.0.0`, link `CHANGELOG.md` and `docs/COMPATIBILITY.md`.
3. Repo map, with links to the user docs.
4. “Start here” links: Getting started, Integrations, SDK, Contract.
5. Three-command quick start that defers detail to `docs/GETTING_STARTED.md`.
6. License (MIT, Tomasz Miller).

Optional single sentence, if kept at all: private commercial hosting may exist and is outside this repository. No link.

### `docs/GETTING_STARTED.md`

- Node 18+. `npm install`, `cp .env.example .env`, `npm start`. Listens on `PORT` (default **3000**). Base URL `http://localhost:3000/api/fastbuyjson`.
- Python 3.11+. venv, `pip install -r requirements.txt`, `npm run start:python` (`uvicorn` on **8000**). Base URL `http://localhost:8000/api/fastbuyjson`. Interactive docs at `http://localhost:8000/docs`.
- In-memory demo users: `demo` / `password123`, `admin` / `admin123`. Demo-only, not a production auth design.
- `.env.example` sets `FASTBUYJSON_API_URL=http://localhost:3000/api/fastbuyjson` for the MCP server.
- Postman (`postman/env.json`) points at the Python port **8000**.
- Auth on the demos is the contract’s JWT login (`POST /auth/login`). Point at `docs/CONTRACT.md` for codes and headers (`Authorization`, `Idempotency-Key`). Do not duplicate the registry.

### `docs/SDK.md`

- Package lives at `sdk/typescript/`, name `@fastbuyjson/sdk`, ESM, zero runtime dependencies. Not published to npm in 1.0.0.
- Commands in root `package.json`: `npm run sdk:install`, `npm run sdk:generate-types`, `npm --prefix sdk/typescript run build`.
- Public export (`sdk/typescript/src/index.ts`): `FastBuyClient`, `FastBuyClientOptions`, `FastBuyProblemError`, generated schema types.
- `FastBuyClientOptions`: `baseUrl`, optional `fetch`, `getAccessToken`, `defaultHeaders`.
- Methods (names only, plus which send a bearer token when one is configured): `detect`, `login`, `refresh`, `verifyCertificate`, `searchProducts`, `addToCart` (optional idempotency key), and the other cart, shipping, discount, checkout, and order methods on the class. Link `docs/CONTRACT.md` for payloads.
- Errors: HTTP failures throw `FastBuyProblemError` with the problem+json body.

### `mcp-server/README.md`

- Transport: **stdio only**. Start script is `node dist/index.js` (`npm start` after `npm run build`). Mock: `npm run start:mock` → `dist/index-mock.js`. No listening port on the MCP process.
- Env: `FASTBUYJSON_API_URL`. Adapter default if unset: `http://localhost:3000/api/fastbuyjson` (`mcp-server/src/adapter.ts`).
- Prerequisite: a FastBuyJSON API already running (Node or Python demo).
- Install for Claude Desktop: `./install.sh` from `mcp-server/` (requires Node 18+, runs `npm install` and `npm run build`, writes or prints `claude_desktop_config.json`). Config file locations:
  - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - Windows: `%APPDATA%/Claude/claude_desktop_config.json`
  - Linux: `~/.config/Claude/claude_desktop_config.json`
- If that file already exists, the script prints a snippet and does not merge.
- Tools implemented in `mcp-server/src/index.ts`:

  - `fastbuy_detect_support`
  - `fastbuy_search_products`
  - `fastbuy_add_to_cart`
  - `fastbuy_get_cart`
  - `fastbuy_checkout_initiate`
  - `fastbuy_get_shipping_options`
  - `fastbuy_apply_discount`
  - `fastbuy_checkout_confirm`
  - `fastbuy_get_order_status`

- Tests: root demo on port 3000, then `npm test` inside `mcp-server/` (root script `npm run mcp:test` builds first).
- Prompt samples stay in `mcp-server/EXAMPLES.md`.

## 4. `docs/INTEGRATIONS.md`

Document the reference server as a local stdio process. The client spawns `node` with the built `dist/index.js`. The API URL is the demo (or any FastBuyJSON HTTP base), not an MCP URL.

Placeholder `<ABSOLUTE_PATH_TO_REPO>` is the clone root. `install.sh` resolves the real path via `realpath`; hand-written configs should use an absolute path because clients do not share the repo cwd.

Canonical sample base URL: `http://localhost:3000/api/fastbuyjson` (Node demo and `.env.example`). Python users substitute port `8000`. Postman stays on 8000.

### 4.1 Claude Desktop

1. Start the demo (`npm start` in the repo root, or the Python server).
2. `cd mcp-server && ./install.sh`
3. Restart Claude Desktop.
4. Or merge the same object by hand.

Checked-in template (`mcp-server/claude_desktop_config.json`) uses a relative `./dist/index.js` and port 3000. `install.sh` writes an absolute path and `http://localhost:3000/api/fastbuyjson`. Hand-written docs show the absolute form:

```json
{
  "mcpServers": {
    "fastbuyjson": {
      "command": "node",
      "args": ["<ABSOLUTE_PATH_TO_REPO>/mcp-server/dist/index.js"],
      "env": {
        "FASTBUYJSON_API_URL": "http://localhost:3000/api/fastbuyjson"
      }
    }
  }
}
```

### 4.2 Cursor

Local stdio MCP. Two equivalent places:

- Project file `.cursor/mcp.json` (do not commit a machine-specific absolute path; show the shape in the doc only).
- Cursor Settings → MCP, same command, args, and env.

```json
{
  "mcpServers": {
    "fastbuyjson": {
      "command": "node",
      "args": ["<ABSOLUTE_PATH_TO_REPO>/mcp-server/dist/index.js"],
      "env": {
        "FASTBUYJSON_API_URL": "http://localhost:3000/api/fastbuyjson"
      }
    }
  }
}
```

Same prerequisite: demo API up, `npm run build` already done inside `mcp-server/`. Cursor does not run `install.sh`.

### 4.3 OpenAI / ChatGPT

- **(a) Stdio.** Any OpenAI-stack client that launches a local MCP process can use the same command, args, and env as Cursor. This repository ships that process.
- **(b) ChatGPT Developer Mode.** Remote MCP there is typically an HTTPS URL. This reference server does not listen on HTTP. It cannot be pasted in as a URL. For ChatGPT-only setups, use Claude Desktop or Cursor against this repo. A remote bridge is out of scope.

There is no sample `mcp.json` URL field, because none exists in the server.

### 4.4 What the integrations page should not include

- A fake HTTP MCP endpoint, SSE path, or port for the MCP process.
- Hosted-product setup.
- The illustrative `mcp_client` Python snippet in `EXAMPLES.md` (“Custom AI Assistant”) unless it is marked non-normative. It is not a dependency of this repo. Prefer the JSON shapes above.

## 5. Accepted decisions

**Q1. Language.** English only. No locale switch, no translated tree.

**Q2. Base URL.** User docs and MCP samples use `http://localhost:3000/api/fastbuyjson`. The Python demo is port 8000, and Postman targets 8000. `install.sh` and `EXAMPLES.md` use port 3000 so `./install.sh` matches `npm start`.

**Q3. Version and changelog.** No version bump. Do not edit `package.json` or `mcp-server/package.json` for documentation. Documentation is not a contract change. `docs/COMPATIBILITY.md` stays as-is.

**Q4. Commercial hosting sentence.** One optional sentence on the README, maximum: private commercial hosting may exist and is outside this repo. No link, no feature list. Do not mention it again in getting started, integrations, SDK, or the MCP README.

**Q5. Scope of the guides.** User docs describe the current contract, demos, MCP server, and SDK.

**Q6. Committed Cursor config.** Do not add `.cursor/mcp.json` to the repo. Absolute paths differ per machine. The JSON shape lives in `docs/INTEGRATIONS.md` only.

**Q7. Remote MCP for ChatGPT.** Document the gap (section 4.3) and stop. No bridge, no new dependency, no extra process.

**Q8. Tool list.** User docs list all nine tools from `mcp-server/src/index.ts`, including `fastbuy_get_shipping_options` and `fastbuy_apply_discount`.

**Q9. Contributor guide.** No `CONTRIBUTING.md`. README keeps a short pointer to the existing npm and pytest scripts. Conformance stays described by `conformance/README.md`.

**Q10. Demo credentials.** Repeat the in-memory demo users in getting started. Label them as demo-only, not as a production auth design.

## 6. Implementation

One pull request:

- Applies the tree in section 3.
- Uses the decisions in section 5.
- Touches markdown plus the URL string inside `mcp-server/install.sh` so the installer matches the Node demo. No schema or workflow edits.
- Does not bump versions.

Title: `docs: user guides for demo, MCP, and SDK`.

## 7. Success criteria

A reader with Node 18+ (and, if they choose Python, 3.11+) can, from a fresh clone, without this plan file:

1. Start the Node demo and open `http://localhost:3000/api/fastbuyjson` (detect or login).
2. Optionally start the Python demo on port 8000 and see `http://localhost:8000/docs`.
3. Build `mcp-server/`, set `FASTBUYJSON_API_URL` to the running demo, and load it in Claude Desktop via `./install.sh` or the JSON in section 4.1.
4. Load the same stdio server in Cursor via Settings → MCP or a local `.cursor/mcp.json` copied from section 4.2.
5. Find the contract in `docs/CONTRACT.md` and the SDK in `docs/SDK.md` from the README.
6. See that ChatGPT remote MCP is not served by this repository, and that Claude Desktop or Cursor is the supported path.
