# FastBuyJSON MCP server (reference)

stdio MCP server that exposes FastBuyJSON commerce tools to Claude Desktop and other MCP clients.

## Tools

- `fastbuy_detect_support`
- `fastbuy_search_products`
- `fastbuy_add_to_cart`
- `fastbuy_get_cart`
- `fastbuy_checkout_initiate`
- `fastbuy_checkout_confirm`
- `fastbuy_get_order_status`

`src/index.ts` calls a live FastBuyJSON HTTP API. `src/index-mock.ts` returns canned data only.

## Setup

```bash
npm install
npm run build
export FASTBUYJSON_API_URL=http://localhost:3000/api/fastbuyjson
```

Install into Claude Desktop:

```bash
./install.sh
```

Or merge `claude_desktop_config.json` into the client config yourself.

## Tests

Start the Node demo server in the repo root (`npm start`), then:

```bash
npm test
```

Prompt examples: [EXAMPLES.md](EXAMPLES.md)
