# TypeScript SDK

`@fastbuyjson/sdk` lives at [`sdk/typescript/`](../sdk/typescript/). It is ESM, has zero runtime dependencies, and is not published to npm in 1.0.0. Import it from that directory on disk after you build it.

## Install and generate types

From the repository root:

```bash
npm run sdk:install
npm run sdk:generate-types
npm --prefix sdk/typescript run build
```

`sdk:generate-types` writes TypeScript types from the JSON Schemas. The package entry is `sdk/typescript/dist/index.js`.

A consumer can depend on the built folder with a `file:` dependency, for example `"@fastbuyjson/sdk": "file:./sdk/typescript"` when the consumer's `package.json` sits at the repo root. Adjust the relative path for other packages.

## Public exports

From `sdk/typescript/src/index.ts`:

- `FastBuyClient`
- `FastBuyClientOptions`
- `FastBuyProblemError`
- `FastBuyProblemBody`
- Generated schema types (`export *` from `sdk/typescript/src/generated/schema-types.ts`)

## `FastBuyClientOptions`

| Field | Required | Role |
|-------|----------|------|
| `baseUrl` | yes | HTTP base, such as `http://localhost:3000/api/fastbuyjson`. A trailing slash is stripped. |
| `fetch` | no | `fetch` implementation. Defaults to global `fetch`. |
| `getAccessToken` | no | Returns the current access token, or `undefined`. |
| `defaultHeaders` | no | Headers sent on every request. |

```ts
import { FastBuyClient, FastBuyProblemError } from "@fastbuyjson/sdk";

const client = new FastBuyClient({
  baseUrl: "http://localhost:3000/api/fastbuyjson",
  getAccessToken: () => accessToken,
});
```

Request and response bodies are the contract in [`CONTRACT.md`](CONTRACT.md). This page lists method names only.

## Methods

Commerce methods send `Authorization: Bearer <token>` when `getAccessToken` returns a string. `detect`, `login`, `refresh`, and `verifyCertificate` do not. On the reference servers, commerce routes still accept a guest call when the header is absent; see the authentication table in the contract.

`addToCart`, `initiateCheckout`, and `confirmCheckout` take an optional `{ idempotencyKey }` and send it as `Idempotency-Key`.

| Method | Bearer when a token is configured |
|--------|-----------------------------------|
| `detect()` | no |
| `login(body)` | no |
| `refresh(body)` | no |
| `verifyCertificate(body)` | no |
| `searchProducts(body)` | yes |
| `addToCart(body, options?)` | yes |
| `getCart()` | yes |
| `getCartById(cartId)` | yes |
| `updateCartItem(itemId, body)` | yes |
| `removeCartItem(itemId)` | yes |
| `clearCart()` | yes |
| `applyCartDiscount(body)` | yes |
| `getShippingOptions()` | yes |
| `initiateCheckout(body, options?)` | yes |
| `confirmCheckout(body, options?)` | yes |
| `getOrderStatus(orderId)` | yes |

## Errors

An HTTP failure whose body is problem+json (or includes a `code`) throws `FastBuyProblemError`. The instance exposes `status`, `code`, and `problem` (`FastBuyProblemBody`: `type`, `title`, `status`, `code`, and optional `detail`, `instance`, and `errors`). Other non-OK responses throw a generic `Error` with the HTTP status. The code registry is in [`CONTRACT.md`](CONTRACT.md).
