# Integrations

The reference MCP server is a local stdio process. The client starts `node` with the built `mcp-server/dist/index.js`. `FASTBUYJSON_API_URL` is the FastBuyJSON HTTP base (the demo, or any compatible API). It is not an MCP URL, and the MCP process does not listen for HTTP.

`<ABSOLUTE_PATH_TO_REPO>` means the clone root. `mcp-server/install.sh` resolves its own path with `realpath`. Hand-written configs need an absolute path because clients do not share the repository working directory.

Samples below use `http://localhost:3000/api/fastbuyjson` (Node demo and [`.env.example`](../.env.example)). Substitute port `8000` when tools should call the Python demo. The Postman environment stays on port 8000; see [Getting started](GETTING_STARTED.md).

Start the API before the client (`npm start` in the repo root, or the Python server). Build the MCP server once: `cd mcp-server && npm install && npm run build`.

Tool names, including shipping and discount, are listed in [`../mcp-server/README.md`](../mcp-server/README.md).

After the Shopify connector’s customer-accounts pull request 5 ([`SHOPIFY_CUSTOMER_ACCOUNTS_PLAN.md`](SHOPIFY_CUSTOMER_ACCOUNTS_PLAN.md)), `GET /orders/{orderId}` requires a FastBuyJSON JWT. `fastbuy_get_order_status` then receives **401** `AUTHENTICATION_REQUIRED` until the buyer is logged in. Customer login is `fastbuy_customer_login_start` and `fastbuy_customer_login_poll` after the connector advertises them. The reference Node and Python demos use `fastbuy_login` and `fastbuy_auth_refresh`. See [`SHOPIFY_MCP_LOGIN_PLAN.md`](SHOPIFY_MCP_LOGIN_PLAN.md). Cart and checkout stay anonymous.

## Claude Desktop

`mcp-server/install.sh` is the installer. It requires Node.js 18+, runs `npm install` and `npm run build`, and writes or prints `claude_desktop_config.json`.

1. Start the demo.
2. From `mcp-server/`, run `./install.sh`.
3. Restart Claude Desktop.

The script looks for the Claude config here:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

When that file already exists, the script prints a snippet and does not merge it. Paste the snippet yourself, or merge the object below.

The checked-in template [`mcp-server/claude_desktop_config.json`](../mcp-server/claude_desktop_config.json) uses a relative `./dist/index.js` and port 3000. `install.sh` writes an absolute path. Hand-written config:

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

## Cursor

Use the same command, args, and env in either place:

- A project file `.cursor/mcp.json` on your machine. Do not commit it. Absolute paths differ per clone.
- Cursor Settings → MCP.

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

The demo API must already be running, and `npm run build` inside `mcp-server/` must already have produced `dist/index.js`. Cursor does not run `install.sh`.

## OpenAI / ChatGPT

Two different clients, and only one of them can use this server.

**Stdio.** An OpenAI-stack client that launches a local MCP process can use the same `command`, `args`, and `env` as Cursor. This repository ships that process.

**ChatGPT Developer Mode.** Remote MCP there is an HTTPS URL. This reference server speaks stdio only (`StdioServerTransport` in `mcp-server/src/index.ts` and `mcp-server/src/index-mock.ts`). It does not listen on HTTP, so there is no URL to paste. For ChatGPT-only setups, use Claude Desktop or Cursor against this repo. A remote bridge would be new work and is outside this documentation.

Configs in this repository set `command`, `args`, and `env`. They do not include an MCP URL field, because the server does not expose one.
