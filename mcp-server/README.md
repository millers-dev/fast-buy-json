# FastBuyJSON MCP server (reference)

stdio MCP server that exposes FastBuyJSON commerce tools to Claude Desktop, Cursor, and any other client that can spawn a local process.

Transport is **stdio only**. `npm start` runs `node dist/index.js`. The process does not listen on a port. Client setup is in [`../docs/INTEGRATIONS.md`](../docs/INTEGRATIONS.md). Prompt samples are in [EXAMPLES.md](EXAMPLES.md).

## Prerequisite

A FastBuyJSON HTTP API must already be running. Use the Node demo (`npm start` in the repo root, port 3000) or the Python demo (`npm run start:python`, port 8000). See [`../docs/GETTING_STARTED.md`](../docs/GETTING_STARTED.md).

## Environment

`FASTBUYJSON_API_URL` is the HTTP base the tools call. If it is unset, `src/adapter.ts` defaults to `http://localhost:3000/api/fastbuyjson`.

```bash
export FASTBUYJSON_API_URL=http://localhost:3000/api/fastbuyjson
```

Use `http://localhost:8000/api/fastbuyjson` when the Python demo is the API. The Postman environment stays on port 8000.

## Tools

`src/index.ts` registers these tools against the live API:

| Tool | What it does |
|------|----------------|
| `fastbuy_detect_support` | Check whether a site base URL supports FastBuyJSON |
| `fastbuy_search_products` | Search the catalog |
| `fastbuy_add_to_cart` | Add a product to the cart |
| `fastbuy_get_cart` | Read cart contents (`cartId` optional) |
| `fastbuy_checkout_initiate` | Start checkout with customer and shipping details |
| `fastbuy_get_shipping_options` | List shipping options for the current cart context |
| `fastbuy_apply_discount` | Apply a promo code, or clear it when `code` is omitted or null |
| `fastbuy_checkout_confirm` | Confirm checkout with payment details |
| `fastbuy_get_order_status` | Read order status and tracking |
| `fastbuy_customer_login_start` | Start Shopify customer login when detect lists `jwt` and `/auth/customer/start`. Returns `loginUrl` and `userCode` only |
| `fastbuy_customer_login_poll` | Poll that login. Pending stays pending. Complete stores the JWT in the process and does not return it |
| `fastbuy_login` | Username and password login for the reference Node and Python demos. Stores access and refresh tokens in the process and does not return them |
| `fastbuy_auth_refresh` | Exchange a stored demo refresh token. Does not call the network when no refresh token is stored |

## Run

Node.js 18+.

```bash
npm install
npm run build
npm start
```

Mock entry (canned data, not the live tool list above):

```bash
npm run start:mock
```

That runs `dist/index-mock.js` (`src/index-mock.ts`). Use `src/index.ts` when you need the live tools, including shipping, discount, and login.

## Claude Desktop

From this directory:

```bash
./install.sh
```

The script installs dependencies, builds, and writes or prints Claude's config. It records `FASTBUYJSON_API_URL` as `http://localhost:3000/api/fastbuyjson` so a fresh install matches `npm start` in the repo root.

Config paths:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

If that file already exists, the script prints a snippet and does not merge it.

The checked-in [`claude_desktop_config.json`](claude_desktop_config.json) uses a relative `./dist/index.js`. `install.sh` writes an absolute path into Claude's config. The same JSON shape is in [`../docs/INTEGRATIONS.md`](../docs/INTEGRATIONS.md).

## Cursor

Cursor does not run `install.sh`. Put the command, args, and env in Cursor Settings → MCP, or in an uncommitted `.cursor/mcp.json`. The shape is in [`../docs/INTEGRATIONS.md`](../docs/INTEGRATIONS.md).

## Tests

Start the Node demo on port 3000, then from this directory:

```bash
npm test
```

From the repo root, `npm run mcp:test` builds this package first and then runs the MCP tests.

## ChatGPT

ChatGPT Developer Mode expects an HTTPS MCP URL. This server does not provide one. Details are in [`../docs/INTEGRATIONS.md`](../docs/INTEGRATIONS.md).
