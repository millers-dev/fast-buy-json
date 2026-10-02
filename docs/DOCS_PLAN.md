# FastBuyJSON user-docs plan

Status: proposal only. This file does not change user docs. One follow-up pull request implements it after this plan is accepted.

**Q5 override:** recovery content is deleted from user-facing docs. `docs/RECOVERY.md` is not created.

Scope is the open-source FastBuyJSON **1.0.0** repository (`millers-dev/fast-buy-json`): the JSON contract, the Node and Python reference APIs, the TypeScript SDK, and the reference MCP server.

## 1. Goals

- A new clone can start a demo API and call `/api/fastbuyjson` without reading recovery history or CI internals.
- A reader can point Claude Desktop or Cursor at the existing stdio MCP server and talk to that demo.
- Contract truth stays in the files that already own it: [`CONTRACT.md`](CONTRACT.md) and [`COMPATIBILITY.md`](COMPATIBILITY.md). User guides link to them; they do not restate the error registry or the 1.x policy.
- Recovery history leaves the front of the README.

## Non-goals

- No new product surface. No hosted service, accounts, payments product, or extra processes.
- No HTTP or remote MCP transport. `mcp-server/src/index.ts` and `mcp-server/src/index-mock.ts` use `StdioServerTransport` only. This plan does not invent a bridge.
- No npm publish of `@fastbuyjson/sdk`. 1.0.0 imports it from `sdk/typescript/` on disk.
- No version bump, changelog rewrite, schema change, or OpenAPI change.
- No second documentation language.
- At most one sentence, anywhere in the user docs, that private commercial hosting may exist. No setup, no URLs, no product walkthrough.

## 2. Audience

Primary:

- Agent builders who want FastBuyJSON tools inside Claude Desktop or Cursor.
- Store or API integrators who implement or call the HTTP contract (`/api/fastbuyjson`) via the demos, Postman, or the local TypeScript SDK.

Secondary (short pointers only, not new guides):

- Contributors running the existing validation and conformance commands already listed in the README.

Out of audience for this pass: operators of anything outside this repository.

## 3. Proposed tree

Keep unchanged as contract source of truth:

- `docs/CONTRACT.md` — HTTP behavior, problem+json codes, headers.
- `docs/COMPATIBILITY.md` — 1.x additive rules.
- `openapi/fastbuyjson.yaml` — generated spec (do not edit by hand).
- `schemas/` — JSON Schema draft-07.

Rewrite or add (implementation PR only):

| Path | Action |
|------|--------|
| `README.md` | Rewrite. What FastBuyJSON is, release `1.0.0`, repo map, link to getting started, contract, integrations, SDK. Drop the recovery section (link `docs/RECOVERY.md`). Drop the long validation command block to a short “Contributing / checks” pointer. |
| `docs/GETTING_STARTED.md` | New. Node demo, Python demo, demo users, where the API lives, how MCP finds it. |
| `docs/INTEGRATIONS.md` | New. Claude Desktop, Cursor, OpenAI / ChatGPT notes. Shapes below. |
| `docs/SDK.md` | New. Local `@fastbuyjson/sdk`: install, generate types, `FastBuyClient` options, method list, `FastBuyProblemError`. |
| `docs/RECOVERY.md` | New. Move the current README “Recovery notes” section here unchanged in substance. |
| `mcp-server/README.md` | Expand. stdio-only, full tool list from `src/index.ts`, `FASTBUYJSON_API_URL`, `./install.sh`, mock entry `src/index-mock.ts`, link to `EXAMPLES.md` and `docs/INTEGRATIONS.md`. |

Leave in place, link rather than duplicate:

- `mcp-server/EXAMPLES.md` — prompt walkthroughs. Fix only the config samples so they match the canonical URL chosen below.
- `mcp-server/install.sh` — existing Claude Desktop installer (macOS, Windows, Linux config paths).
- `mcp-server/claude_desktop_config.json` — checked-in shape; relative `./dist/index.js` (install.sh rewrites this to an absolute path).
- `conformance/README.md`, `CHANGELOG.md`, `postman/`.

### README after rewrite (outline)

1. One paragraph: JSON contract for agents (search, cart, checkout, order status) plus reference servers.
2. Release line: `1.0.0`, link `CHANGELOG.md` and `docs/COMPATIBILITY.md`.
3. Repo map (current tree is fine; add links to the new docs).
4. “Start here” links: Getting started, Integrations, SDK, Contract.
5. Three-command quick start that defers detail to `docs/GETTING_STARTED.md`.
6. One line: recovery history is in `docs/RECOVERY.md`.
7. License (MIT, Tomasz Miller).

Optional single sentence, if kept at all: private commercial hosting exists and is not documented here.

### `docs/GETTING_STARTED.md` (outline)

Facts to use, already in the repo:

- Node 18+. `npm install`, `cp .env.example .env`, `npm start`. Listens on `PORT` (default **3000**). Base URL `http://localhost:3000/api/fastbuyjson`.
- Python 3.11+. venv, `pip install -r requirements.txt`, `npm run start:python` (`uvicorn` on **8000**). Base URL `http://localhost:8000/api/fastbuyjson`. Interactive docs at `http://localhost:8000/docs`.
- In-memory demo users from the Node server: `demo` / `password123`, `admin` / `admin123`.
- `.env.example` sets `FASTBUYJSON_API_URL=http://localhost:3000/api/fastbuyjson` for the MCP server.
- Postman (`postman/env.json`) points at the Python port **8000** by default.
- Auth on the demos is the contract’s JWT login (`POST /auth/login`). Point at `docs/CONTRACT.md` for codes and headers (`Authorization`, `Idempotency-Key`). Do not duplicate the registry.

### `docs/SDK.md` (outline)

- Package lives at `sdk/typescript/`, name `@fastbuyjson/sdk`, ESM, zero runtime dependencies. Not published to npm in 1.0.0.
- Commands already in root `package.json`: `npm run sdk:install`, `npm run sdk:generate-types`, `npm --prefix sdk/typescript run build`.
- Public export (`sdk/typescript/src/index.ts`): `FastBuyClient`, `FastBuyClientOptions`, `FastBuyProblemError`, generated schema types.
- `FastBuyClientOptions`: `baseUrl`, optional `fetch`, `getAccessToken`, `defaultHeaders`.
- Methods to list (names only, plus which need a bearer token): `detect`, `login`, `refresh`, `verifyCertificate`, `searchProducts`, `addToCart` (optional idempotency key), and the other cart, shipping, discount, checkout, and order methods already on the class. Link `docs/CONTRACT.md` for payloads.
- Errors: HTTP failures throw `FastBuyProblemError` with the problem+json body.

### `mcp-server/README.md` expansion (outline)

- Transport: **stdio only**. Start script is `node dist/index.js` (`npm start` after `npm run build`). Mock: `npm run start:mock` → `dist/index-mock.js`. No listening port on the MCP process.
- Env: `FASTBUYJSON_API_URL`. Adapter default if unset: `http://localhost:3000/api/fastbuyjson` (`mcp-server/src/adapter.ts`).
- Prerequisite: a FastBuyJSON API already running (Node or Python demo).
- Install for Claude Desktop: `./install.sh` from `mcp-server/` (requires Node 18+, runs `npm install` and `npm run build`, writes or prints `claude_desktop_config.json`). Config file locations the script already uses:
  - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - Windows: `%APPDATA%/Claude/claude_desktop_config.json`
  - Linux: `~/.config/Claude/claude_desktop_config.json`
- If that file already exists, the script prints a snippet and does not merge. Say that.
- Tools implemented in `mcp-server/src/index.ts` (the current README omits two):

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

## 4. `docs/INTEGRATIONS.md` outline

Document the reference server as a local stdio process. The client spawns `node` with the built `dist/index.js`. The API URL is the demo (or any FastBuyJSON HTTP base), not an MCP URL.

Placeholder `<ABSOLUTE_PATH_TO_REPO>` is the clone root. `install.sh` resolves the real path via `realpath`; hand-written configs should use an absolute path because clients do not share the repo cwd.

Canonical sample base URL in new docs: `http://localhost:3000/api/fastbuyjson` (Node demo and `.env.example`). Python users substitute port `8000`. See Q2.

### 4.1 Claude Desktop

Existing path. Do not invent a second installer.

1. Start the demo (`npm start` in the repo root, or the Python server).
2. `cd mcp-server && ./install.sh`
3. Restart Claude Desktop.
4. Or merge the same object by hand.

Checked-in template (`mcp-server/claude_desktop_config.json`) uses a relative `./dist/index.js` and port 3000. `install.sh` writes an absolute path. Hand-written docs should show the absolute form:

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

Note the port split already in tree: `install.sh` and parts of `mcp-server/EXAMPLES.md` currently emit port **8000**. New prose uses **3000** unless Q2 is decided the other way. The implementation PR updates those markdown samples (and the URL string `install.sh` prints or writes) so a fresh install matches the getting-started Node path.

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

State both limits. Do not add a server.

- **(a) Stdio.** Any OpenAI-stack client that launches a local MCP process can use the same command, args, and env as Cursor. This repository ships that process.
- **(b) ChatGPT Developer Mode.** Remote MCP there is typically an HTTPS URL. This reference server does not listen on HTTP. It cannot be pasted in as a URL. For ChatGPT-only setups, use Claude Desktop or Cursor against this repo. A remote bridge would be new work and is out of scope for the documentation implementation PR.

There is no sample `mcp.json` URL field, because none exists in the server.

### 4.4 What the integrations page should not include

- A fake HTTP MCP endpoint, SSE path, or port for the MCP process.
- Hosted-product setup.
- The illustrative `mcp_client` Python snippet in `EXAMPLES.md` (“Custom AI Assistant”) unless it is marked non-normative. It is not a dependency of this repo. Prefer the JSON shapes above.

## 5. Open questions

Each item has a recommended default. The implementation PR should follow the defaults unless review overrides them.

**Q1. Language.** Recommended default: English only. No locale switch, no translated tree.

**Q2. Which base URL do the new examples use?** Today the tree disagrees: `.env.example`, `mcp-server/README.md`, `mcp-server/claude_desktop_config.json`, and the adapter fallback use port **3000** (Node). `install.sh`, `mcp-server/EXAMPLES.md`, and `postman/env.json` use port **8000** (Python). Recommended default: new docs and MCP samples use `http://localhost:3000/api/fastbuyjson`, and say explicitly that the Python demo is port 8000 and that Postman targets 8000. The implementation PR aligns `install.sh` and `EXAMPLES.md` to 3000 so `./install.sh` matches `npm start`. Postman stays on 8000; getting-started says so.

**Q3. Version and changelog.** Recommended default: no version bump. Do not edit `package.json`, `mcp-server/package.json`, or `CHANGELOG.md`. Documentation is not a contract change. `docs/COMPATIBILITY.md` stays as-is.

**Q4. Commercial hosting sentence.** Recommended default: one optional sentence on the README, maximum — private commercial hosting may exist and is outside this repo. No link, no feature list. Delete the current README sentence that describes that product. Do not mention it again in getting started, integrations, SDK, or the MCP README.

**Q5. Recovery notes.** Recommended default: move the existing “Recovery notes” section to `docs/RECOVERY.md`. README keeps a single link. Do not delete the history.

**Q6. Committed Cursor config.** Recommended default: do not add `.cursor/mcp.json` to the repo. Absolute paths differ per machine. The JSON shape lives in `docs/INTEGRATIONS.md` only.

**Q7. Remote MCP for ChatGPT.** Recommended default: document the gap (section 4.3) and stop. No bridge, no new dependency, no extra process in this PR series.

**Q8. Tool list drift.** Recommended default: user docs list all nine tools from `mcp-server/src/index.ts`, including `fastbuy_get_shipping_options` and `fastbuy_apply_discount`, which `mcp-server/README.md` currently omits.

**Q9. Contributor guide.** Recommended default: no new `CONTRIBUTING.md`. README keeps a short pointer to the existing npm and pytest scripts. Conformance stays described by `conformance/README.md`.

**Q10. Demo credentials.** Recommended default: repeat the in-memory demo users in getting started (they are already public in the README). Label them as demo-only, not as a production auth design.

## 6. Implementation

After this plan is accepted, **one** pull request:

- Applies the tree in section 3.
- Uses the Q1–Q10 defaults unless the review thread changes one.
- Touches markdown plus, for Q2, the URL string inside `mcp-server/install.sh` so the installer matches the Node demo. No other code, schema, or workflow edits.
- Does not bump versions.

Suggested title: `docs: user guides for demo, MCP, and SDK`.

## 7. Success criteria

A reader with Node 18+ (and, if they choose Python, 3.11+) can, from a fresh clone, without this plan file:

1. Start the Node demo and open `http://localhost:3000/api/fastbuyjson` (detect or login).
2. Optionally start the Python demo on port 8000 and see `http://localhost:8000/docs`.
3. Build `mcp-server/`, set `FASTBUYJSON_API_URL` to the running demo, and load it in Claude Desktop via `./install.sh` or the JSON in section 4.1.
4. Load the same stdio server in Cursor via Settings → MCP or a local `.cursor/mcp.json` copied from section 4.2.
5. Find the contract in `docs/CONTRACT.md` and the SDK in `docs/SDK.md` without reading recovery notes.
6. See that ChatGPT remote MCP is not served by this repository, and that Claude Desktop or Cursor is the supported path.
