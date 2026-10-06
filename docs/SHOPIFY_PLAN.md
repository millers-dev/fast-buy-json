# Shopify connector plan

Status: proposed. English only. This file is the implementation plan for the first FastBuyJSON store connector. It is documentation. Accepting it does not change the HTTP contract, the reference servers, the TypeScript SDK, or the MCP server.

Checked against this repository at **1.0.0** (`docs/CONTRACT.md`, `docs/COMPATIBILITY.md`, `schemas/`, `mcp-server/`) and against Shopify’s public docs on **2026-10-03**. Sources are listed at the end. Shopify is the beachhead. WooCommerce, BigCommerce, and commercetools are later, and this plan does not compare them.

## 1. Decision

| Topic | Default |
| --- | --- |
| Package | New public repository `millers-dev/fast-buy-json-shopify`. This repository keeps the contract. |
| v1 surface | One Shopify shop speaks `/api/fastbuyjson`: discovery, catalog search, cart, and checkout **initiate**. |
| Checkout | Buyer pays on Shopify’s hosted checkout. The connector returns `checkoutUrl`. |
| Payment inside FastBuyJSON | `POST /checkout/confirm` does not charge a card and does not create the Shopify order. |
| Install | Dev Dashboard app, **custom distribution**, one shop per running process. |
| Agent setup | Existing stdio MCP. Set `FASTBUYJSON_API_URL` to the connector. No MCP code change in v1. |
| Billing, accounts, multi-tenant hosting | Out of the connector and out of this repository. |

Accepting this plan accepts those defaults. Section 11 lists them again so a review comment can overturn one without reopening the rest.

## 2. Recon, checked on 2026-10-03

| Claim | Result |
| --- | --- |
| Storefront `cartCreate` ends at `checkoutUrl`. | Holds. The Storefront Cart object tells the client to send the buyer to Shopify web checkout. There is no Storefront mutation that submits payment. |
| A newer agent checkout API exists beside that URL. | Holds, with a gate. Checkout MCP (`create_checkout`, `update_checkout`, `complete_checkout`) speaks Universal Commerce Protocol at `https://{shop}/api/ucp/mcp`. `complete_checkout` places an order only for a **Token-tier** agent that Shopify has allowed to complete purchases, and only with a payment credential from a trusted UI, and only when status is `ready_for_complete`. Otherwise the buyer is sent to `continue_url`. Signed and anonymous agents cannot call `complete_checkout`. The old Storefront MCP cart tools on `https://{shop}/api/mcp` are removed. |
| App install is OAuth. Admin GraphQL and Storefront API. | Holds for an app a merchant installs. Same-organization development stores can also use the client-credentials grant. |
| `write_checkouts` is the cart scope. | The Storefront scope that covers `Cart` is `unauthenticated_write_checkouts`, paired with `unauthenticated_read_checkouts`. v1 does not request an Admin checkout-write scope. |
| Custom apps on Basic have limited data access. Fuller access starts at Grow. | Holds on the pricing page: “Build custom apps using Shopify APIs” is **Limited data access** on Basic and **Full data access** on Grow, Advanced, and Plus. The protected-customer-data page splits this further: level 2 for a Dev Dashboard custom app is described as always available, while level 2 for an **admin-created** custom app varies by plan. v1 does not read customer or order records, so it does not depend on that split. |
| New custom apps are created in the Shopify admin. | No longer. From **2026-01-01**, new custom apps are created in the Dev Dashboard. Admin-created custom apps that already exist keep working. |
| Plans: Basic $29/$39, Grow $79/$105, Advanced $299/$399, Plus from $2300/mo. Each advertises selling in AI chats. | Holds on <https://www.shopify.com/pricing> (prices as of 2026-10-01). Yearly / monthly: Basic $29 / $39, Grow $79 / $105, Advanced $299 / $399. Plus starts at $2,300 USD/mo. The Basic summary says “Sell online, in person, and in AI chats,” and the comparison table has a “Sell in AI chats” row for Basic, Grow, Advanced, and Plus. |
| Agentic Storefronts is Shopify’s own channel. | Holds. Eligible stores are surfaced to AI channels from the Shopify admin. The $0 Agentic plan is a separate offer for brands that may not run a Shopify online store. This connector is a FastBuyJSON channel beside that, and it does not replace Shopify Checkout. |

API pin for every later code PR: **2026-10**, stable on 2026-10-01, supported through 2026-10-16 15:00 UTC. Admin URL `https://{shop}.myshopify.com/admin/api/2026-10/graphql.json`. Storefront URL `https://{shop}.myshopify.com/api/2026-10/graphql.json`.

## 3. Package location

**Default:** a new public repository, `millers-dev/fast-buy-json-shopify`.

This repository stays the contract, the Node and Python reference servers, `sdk/typescript/`, and the stdio MCP server. `docs/DOCS_PLAN.md` already limits user docs here to that surface. A Shopify app has a different release train: Dev Dashboard credentials, OAuth, webhook HMAC, a quarterly API version, and later App Store review. Those do not belong in the 1.x contract version.

The connector depends on the contract. It vendors `schemas/` from tag `1.0.0` of this repository and validates its own responses in its tests. It does not fork the schemas. A contract change still lands here first. The connector updates its vendored copy in a follow-up.

An in-repo package (`connectors/shopify` in this tree) would keep mapping diffs next to schema diffs. That benefit loses to the split above: this repository’s CI is schema, OpenAPI, example, and reference-server conformance. Shopify fixtures, client secrets, and install URLs would make the contract repo carry one vendor’s operations.

The new repository is MIT, same copyright line as this one (Tomasz Miller). It has its own `package.json`. It is not published to npm in the first code PRs. It does not contain billing, customer accounts for a hosted product, or a shop-routing table.

Creating that GitHub repository is the first step after this plan is accepted. This pull request does not create it.

## 4. What a shop URL exposes

The process serves the contract base path:

`http://localhost:3100/api/fastbuyjson`

Port **3100** is the default so it does not sit on the Node demo (`3000`) or the Python demo (`8000`).

One process is one shop. The shop domain comes from configuration. The URL the agent uses is the connector, not `*.myshopify.com`.

### 4.1 Discovery

`GET /detect` is public and sends `Cache-Control: public, max-age=300`, as `docs/CONTRACT.md` requires.

| Field | v1 value |
| --- | --- |
| `standard` | `FastBuyJSON` |
| `specVersion` | `1.0.0` |
| `implementationVersion` | The connector package version |
| `endpoints` | `products`, `cart`, `checkout`. `orders` and `auth` stay off until a later phase adds them. |
| `authentication.methods` | `anonymous` |
| `supportedFeatures` | `anonymous_cart`, `idempotency`, `schema_validation`, `pagination`, `hosted_checkout` |
| `capabilities.tax` | `{ "mode": "shopify_estimated" }` |
| `capabilities.shipping` | Shopify delivery groups for this shop. The reference seed (`standard`, `express`, free shipping over USD 100) is not advertised. |
| `capabilities.discounts` | One merchant discount code. `stackable: false`. |
| `capabilities.checkout` | `{ "handoff": "shopify_hosted", "confirmCreatesOrder": false }` |
| `merchantInfo` | Shop name and the shop’s public HTTPS URL. |

`hosted_checkout` is an additive feature string. `docs/COMPATIBILITY.md` allows new capability values. Clients that only know 1.0.0 ignore unknown fields.

### 4.2 Catalog

`POST /products/search` reads the Storefront API (`search` for a text query, `products` when the request is filters only). The call uses a server-side delegate token (section 5.3). Results use the Product shape in `schemas/product.json`.

Pagination is the contract’s `page` / `pageSize` (1-based, `pageSize` at most 100). Shopify is cursor-based. The connector walks cursors for `page > 1` and stops if that walk would scan more than **1000** matching items, returning **400** `VALIDATION_ERROR`. `totalItems` comes from Storefront `totalCount` when the query is `search`.

### 4.3 Cart

Cart routes follow `docs/CONTRACT.md`:

| Call | Shopify operation |
| --- | --- |
| `POST /cart/add` | `cartCreate` on the first add, then `cartLinesAdd` |
| `GET /cart` and `GET /cart/{cartId}` | `cart` |
| `PATCH /cart/items/{itemId}` | `cartLinesUpdate` with an absolute quantity |
| `DELETE /cart/items/{itemId}` | `cartLinesRemove` |
| `DELETE /cart` | Remove every line. The FastBuyJSON cart `id` stays the same. |
| `POST /cart/discount` | `cartDiscountCodesUpdate` |

The reference MCP tool `fastbuy_add_to_cart` does not send a cart id. The reference servers keep one cart per caller, and one shared cart for anonymous callers. v1 does the same: **one anonymous cart per process**, so the current MCP server works with no code change. Two buyers sharing one process share that cart. A second shop is a second process.

The Shopify cart id looks like `gid://shopify/Cart/…?key=…`. The `key` is a secret. The connector stores the full id in the local session store and returns an opaque cart `id` (UUID). Responses, logs, and `extensions` omit the `key`.

`POST /cart/add`, `POST /checkout/initiate`, and `POST /checkout/confirm` honor `Idempotency-Key` with the fingerprint and 24-hour retention in `docs/CONTRACT.md`. The identity scope is `anonymous`. **4xx/5xx** do not store the key.

### 4.4 Checkout

`POST /checkout/initiate` is the handoff.

1. Load the opaque cart. Unknown id: **404** `CART_NOT_FOUND`.
2. `cartBuyerIdentityUpdate` with email, phone, and country.
3. `cartDeliveryAddressesReplace` with the shipping address.
4. If `discountCode` is present, apply it the same way as `POST /cart/discount`.
5. Re-read delivery groups. If `shippingOptionId` matches a `deliveryOptionHandle`, call `cartSelectedDeliveryOptionsUpdate`. If the groups are not ready yet, or the handle is absent, still return `checkoutUrl`. Hosted checkout shows the shop’s rates. That is a drift from “the id always selects the method,” and it keeps a slow carrier-rate lookup from blocking the handoff.
6. Read `checkoutUrl` from the cart at this moment. Shopify’s cart guide says to request the URL when the buyer is ready, and to request it again if it is stale.
7. Return the contract body: `sessionToken`, `verificationToken`, `expiresAt` (one hour, matching the reference session lifetime), and the cart snapshot.

Two additive response fields sit next to those, which 1.x clients must ignore if they do not understand them. The reference MCP server returns the initiate JSON as text, so an agent sees them without an MCP change:

| Field | Value |
| --- | --- |
| `checkoutUrl` | HTTPS URL from Storefront `Cart.checkoutUrl` |
| `checkoutHandoff` | `shopify_hosted` |

`sessionToken` and `verificationToken` are opaque ids stored next to the cart. They are not Shopify payment credentials.

`POST /checkout/confirm` still checks the session before it refuses payment:

| Condition | Code |
| --- | --- |
| Unknown `sessionToken` | **400** `INVALID_CHECKOUT_SESSION` |
| Past `expiresAt` | **400** `CHECKOUT_SESSION_EXPIRED` |
| `verificationToken` does not match | **400** `INVALID_VERIFICATION_TOKEN` |
| Session is valid | **400** `PAYMENT_METHOD_UNSUPPORTED` |

The last response uses the existing problem registry (`https://fastbuyjson.org/problems/payment-method-unsupported`). `detail` tells the caller to open `checkoutUrl`. The same URL is an extra problem member, `checkoutUrl`, which draft-07 allows on `schemas/error.json`. The handler does not forward `paymentDetails` to Shopify, does not call Checkout MCP `complete_checkout`, and does not write card fields to logs.

The order appears in Shopify after the buyer pays on that page. v1 has no `GET /orders/{orderId}`.

### 4.5 What v1 cannot do

- Charge a card, wallet, PayPal, or Shop Pay inside `POST /checkout/confirm`.
- Call Checkout MCP `complete_checkout`, or register this connector as a UCP agent.
- Create a Shopify order before the buyer finishes hosted checkout.
- Return `order` / `orderId` from confirm.
- Read order status, tracking, or customer records from the Admin API.
- Run the reference seed catalog: `standard` / `express` shipping, the USD 100 free-shipping rule, tax rates 10% / 19% / 20%, or promo codes `SAVE10` / `WELCOME5`.
- Log the buyer into Shopify Customer Accounts. `POST /auth/login` is not implemented. `/detect` does not advertise `auth`.
- Install onto many unrelated shops from one app record. Custom distribution is one store, or the stores of one Plus organization. v1 still runs one process per shop.
- Use the $0 Agentic plan, Shopify Catalog (`catalog.shopify.com`), or Agentic Storefronts configuration. Those are Shopify’s channel. A merchant can use both. This package does not turn them on or off.
- Expose an HTTP MCP endpoint. ChatGPT Developer Mode wants an HTTPS MCP URL. `docs/INTEGRATIONS.md` already records that the reference server is stdio only. v1 does not add a bridge.

## 5. Auth

Two different credentials exist, and they stay apart.

**Merchant install** authorizes the connector to call Shopify. The agent never sees those tokens.

**Buyer identity** on the FastBuyJSON side is the anonymous cart. A Bearer token on a commerce request is not a Shopify customer access token. v1 ignores it for cart lookup and still uses the single anonymous cart. It does not return **401** `INVALID_TOKEN` for a leftover demo JWT, because that JWT is not how this shop authenticates buyers.

### 5.1 App and grant

Create the app in the [Dev Dashboard](https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard). Distribution method: **custom** (section 8). The app is API-only. v1 has no embedded admin UI and does not start from a Shopify app template.

**Install path (a merchant shop, or any shop outside the app’s organization).** Authorization code grant for a standalone app:

1. Redirect the merchant to `https://{shop}/admin/oauth/authorize` with `client_id`, `scope`, `redirect_uri`, and `state`.
2. Check `hmac` and `state` on the callback. A mismatch stores nothing.
3. `POST https://{shop}/admin/oauth/access_token` with `client_id`, `client_secret`, `code`, and `expiring=1`.

`expiring=1` is the default even though custom apps may still receive non-expiring offline tokens. Public apps must use expiring offline tokens for the Admin API by 2027-01-01. Starting here avoids a second token migration if the app is listed later. The token response includes `expires_in` (the documented example is 3600 seconds) and `refresh_token_expires_in` (90 days). Refresh before `expires_in` elapses. A failed refresh clears the cached access token and returns **500** `INTERNAL_ERROR` on commerce calls, with a `detail` that the shop must be reinstalled. The body contains no token.

**Local path, same organization only.** When the Dev Dashboard app and the development store belong to the same organization, the client-credentials grant (`grant_type=client_credentials` to the same token URL) returns an Admin token that expires in 24 hours. The connector requests a new one shortly before expiry. This path has no browser redirect. It is the default for local development. It is not the merchant install path.

The callback `shop` must equal configured `SHOPIFY_SHOP`. Any other shop is rejected. The token store holds one shop.

### 5.2 Scopes

Request only these, comma-separated, on the authorize URL:

| Scope | Why |
| --- | --- |
| `unauthenticated_read_product_listings` | Storefront `Product` and `Collection` |
| `unauthenticated_read_product_inventory` | `quantityAvailable` |
| `unauthenticated_read_checkouts` | Read `Cart` |
| `unauthenticated_write_checkouts` | Cart mutations |

Omitted in v1: `read_products`, `write_products`, `read_orders`, `write_orders`, `read_customers`, `write_customers`, `read_draft_orders`, `write_draft_orders`, and any Admin checkout scope. Catalog and cart go through the Storefront API. Order and customer scopes pull protected customer data and wait for a later phase.

### 5.3 Storefront calls

Admin calls send `X-Shopify-Access-Token`.

Storefront calls from this process use a **delegate** token from `delegateAccessTokenCreate`, limited to the four unauthenticated scopes above, sent as `Shopify-Storefront-Private-Token`. Delegate tokens expire with the parent Admin token (or sooner). Mint a new one after each Admin refresh.

`storefrontAccessTokenCreate` mints a **public** token for a browser or mobile client (`X-Shopify-Storefront-Access-Token`). v1 does not mint one and does not send a Storefront token to the agent.

When the FastBuyJSON request’s TCP peer is a public address, forward it as `Shopify-Storefront-Buyer-IP`. When the peer is loopback (the usual local MCP case), omit the header. Do not send `127.0.0.1`, and do not add a new FastBuyJSON header for the buyer IP. Shopify documents that missing buyer IP can tighten throttling and weaken bot protection. That is an accepted v1 limit of a server-side agent.

Shopify **429** or a documented throttle extension maps to **429** `RATE_LIMITED`. One backoff using Shopify’s guidance, then the problem response. No retry loop.

### 5.4 Token storage and webhooks

Default store: one SQLite file in the working directory, gitignored, encrypted with `TOKEN_ENCRYPTION_KEY`. Rows: shop domain, Admin access token, refresh token, expiries, delegate token. Idempotency records and the opaque cart (Shopify cart id, line UUID to `CartLine` GID, checkout session) live in the same file. Buyer postal addresses are written to Shopify and are not copied into this file beyond what the session needs to refresh `checkoutUrl`.

| Env | Role |
| --- | --- |
| `SHOPIFY_SHOP` | `example.myshopify.com` |
| `SHOPIFY_CLIENT_ID` | Dev Dashboard client id |
| `SHOPIFY_CLIENT_SECRET` | Dev Dashboard secret |
| `SHOPIFY_API_VERSION` | `2026-10` |
| `TOKEN_ENCRYPTION_KEY` | Encryption key for the SQLite file |
| `PORT` | `3100` |
| `APP_URL` | Public HTTPS origin of the OAuth callback. Unused by the client-credentials path. |

`app/uninstalled` is HMAC-verified with the client secret and deletes the shop row.

Also implement HMAC-verified `customers/data_request`, `customers/redact`, and `shop/redact` in the auth slice. Public listing requires compliance webhooks. Custom distribution may not call them. The handlers acknowledge and delete the local shop row on `shop/redact`. They have no extra customer archive to export, because v1 does not keep one.

## 6. Mapping and drift

Shopify money is a decimal **string** (`MoneyV2.amount`, scalar `Decimal`), for example `"19.99"`. FastBuyJSON `amount` is a JSON number (`schemas/money.json`). Parse the string in decimal arithmetic and emit a JSON number at the currency’s minor-unit precision (USD: two places) so `19.99` survives the round trip. Tests cover `"19.99"` and `"10.00"`.

Totals on the cart are Shopify’s estimated `CartCost` (subtotal, tax, duty if present, shipping once a delivery option is selected, discount allocations, total). The connector does not recompute them with the reference formula in `docs/CONTRACT.md` (seed rates, taxable base, free shipping over 100). If the parts and Shopify’s `totalAmount` disagree, keep Shopify’s figures. `/detect` says `tax.mode` is `shopify_estimated`. Cart costs remain estimates until hosted checkout.

| FastBuyJSON | Shopify | Drift |
| --- | --- | --- |
| `Product.id` | `Product` GID | Agents pass this id back only together with `options`, or they pass a variant GID directly. |
| `Product.name` | `title` | |
| `Product.brand` | `vendor` | Storefront vendor filters are not guaranteed case-insensitive. The contract asks for a case-insensitive exact brand match. The catalog PR tests the pinned API and documents the actual match. |
| `Product.description` | Plain text stripped from `descriptionHtml` | HTML markup is dropped. |
| `Product.price` | Minimum variant price | A product with several prices shows the low price on the product and the real price on each variant. |
| `Product.categories` | `productType`, tags, and collection titles | A `categories` filter matches `product_type` or tag. Collection membership is not a exact FastBuyJSON any-match. Lossy on purpose. |
| `Product.images[]` | Image `url` and `altText` | |
| `variants[].id` | `ProductVariant` GID | This is the id `POST /cart/add` should receive for a specific SKU. |
| `variants[].attributes` | `selectedOptions` name/value | The reference demo looks at `options.color` only. The connector matches every selected option. |
| `variants[].price` | That variant’s price | |
| `availability.status` | `availableForSale`, and `currentlyNotInStock` when that field exists on the pinned schema | `false` → `out_of_stock`. `availableForSale` with `currentlyNotInStock` → `backorder`. Otherwise `in_stock`. v1 does not emit `low_stock` or `preorder`. If `currentlyNotInStock` is absent in 2026-10, the catalog PR drops the backorder row and records that in the test. |
| `availability.quantity` | `quantityAvailable` | Omit `quantity` when Shopify returns null. Requires `unauthenticated_read_product_inventory`. |
| Line `productId` | Variant GID that was added | Same idea as the reference server, which stores the chosen variant id on the line. |
| Line `itemId` | Connector UUID | `schemas/cart-item.json` and the OpenAPI path use `format: uuid`. A `CartLine` GID would fail that format. The UUID is mapped to the GID in SQLite. |
| Line `options` | Selected option map | |
| Cart `id` | Opaque UUID | Shopify cart GID and `key` stay in SQLite. |
| `totals.*` | `CartCost` and discount allocations | Not the reference seed formula. |
| Discount code | `cartDiscountCodesUpdate` | The mutation **replaces** the whole code list. v1 sends one code, matching non-stackable discounts. `code: null` sends `[]`. A code Shopify marks inapplicable is removed and the route returns **422** `INVALID_DISCOUNT_CODE`. |
| `shippingOptionId` | Delivery option handle | There is no `standard` or `express` unless the merchant’s rates are titled that way. |
| `shippingAddress.region` | `province` | The reference MCP adapter sends `state` and does not send `region` (`mcp-server/src/adapter.ts`). The connector reads `region`, then `state` if `region` is absent. |
| `shippingAddress.country` | `countryCode` | ISO 3166-1 alpha-2, as the contract already asks. |
| `billingAddress` | Not written to the cart in v1 | Hosted checkout collects billing. The field is accepted so schema validation passes. `/detect` does not claim it is applied. |
| `customerInfo.phone` or `phoneNumber` | `buyerIdentity.phone` | The contract allows either name. |
| `extensions` | Echoed on the FastBuyJSON cart only | Reserved namespaces `fastbuyjson` and `x-fastbuyjson` stay unused. Shopify GIDs are not copied into `extensions` or into Shopify cart attributes. |
| `priceRange.currency` | Shop currency | A different currency is **400** `VALIDATION_ERROR`. v1 does not convert. Contextual pricing via `@inContext` waits until a later phase. |
| Sort `relevance`, `price_asc`, `price_desc`, `name_asc`, `name_desc`, `newest` | Storefront search or product sort keys on 2026-10 | The catalog PR binds each enum to the sort key that exists on that version. A missing key falls back to relevance and the test records the fallback. |

`POST /cart/add` resolution:

| `productId` | Behavior |
| --- | --- |
| A variant GID | Add that merchandise id. |
| A product GID, one variant | Add that variant. |
| A product GID plus `options` that select one variant | Add that variant. |
| A product GID with several variants and no unique match | **400** `VALIDATION_ERROR`. The reference demo can still add the parent product. Putting the wrong SKU in a real cart is worse. |
| Unknown id | **404** `PRODUCT_NOT_FOUND`. |

`GET /shipping/options` is phase 7. Before a delivery address exists, the body is `{ "currency": "<shop currency>", "options": [] }`. After Shopify returns delivery groups, map handle → `id`, title → `label`, estimated cost → `amount`. `schemas/shipping-option.json` requires `estimatedDelivery.minDays` and `maxDays`. v1 includes an option in `options` only when the pinned Storefront object provides those day bounds. Options without day bounds are left out, and an additive `omittedOptionCount` reports how many. The connector does not invent a day range, and it does not invent the seed free-shipping threshold.

The reference conformance suite (`conformance/`) assumes seed tax, seed promos, and an in-band confirm. The connector does not run that suite against Shopify. It vendors the JSON Schemas and runs the fixture tests in section 9.

## 7. Agents and local development

The reference MCP server is stdio. It calls `FASTBUYJSON_API_URL` (`mcp-server/src/adapter.ts`, default `http://localhost:3000/api/fastbuyjson`). Point that variable at the connector. Claude Desktop, Cursor, and an OpenAI-stack client that launches a local process use the same command and args as `docs/INTEGRATIONS.md`.

```json
{
  "mcpServers": {
    "fastbuyjson": {
      "command": "node",
      "args": ["<ABSOLUTE_PATH_TO_REPO>/mcp-server/dist/index.js"],
      "env": {
        "FASTBUYJSON_API_URL": "http://localhost:3100/api/fastbuyjson"
      }
    }
  }
}
```

`<ABSOLUTE_PATH_TO_REPO>` is a clone of **this** repository (`millers-dev/fast-buy-json`), where the MCP server already lives. The connector is a second process, from `millers-dev/fast-buy-json-shopify` once that repository exists.

Local sequence:

1. Create a Shopify development store and a Dev Dashboard app in the same organization. Set distribution to custom when the dashboard asks. Install is limited to that store.
2. In the connector clone, set the env vars from section 5.4. Leave `APP_URL` unset.
3. Start the connector. It fetches an Admin token with client credentials and mints a delegate token on first catalog or cart call.
4. `curl -s http://localhost:3100/api/fastbuyjson/detect`
5. Build `mcp-server/` in this repository (`npm run build` inside `mcp-server/`). Start Claude Desktop or Cursor with the JSON above.

A merchant install, or a store outside the organization, uses the authorization code grant. `APP_URL` is an HTTPS origin Shopify can redirect to. Localhost HTTP is not a valid redirect. Use a tunnel for the callback only. The agent still uses `http://localhost:3100/api/fastbuyjson` on the machine where the process runs. There is no publicly hosted FastBuyJSON shop in this plan.

`fastbuy_checkout_initiate` shows `checkoutUrl` because the tool prints the response JSON. `fastbuy_checkout_confirm` fails with `PAYMENT_METHOD_UNSUPPORTED`. The reference adapter (`mcp-server/src/adapter.ts`, `mcp-server/src/http-error.ts`) appends that RFC 9457 problem body to the tool error, including `detail` and `checkoutUrl`. The URL is already on the initiate result. The adapter change lives in this repository and is not part of the connector sequence.

ChatGPT Developer Mode still has nothing to paste. The connector is a FastBuyJSON HTTP API. It is not a remote MCP server.

## 8. Distribution

**Default: custom distribution.**

In the Dev Dashboard, choose custom distribution and install with the generated link. There is no App Store review and no Billing API. Custom distribution installs on one store, or on stores in one Plus organization. One FastBuyJSON process still serves one shop.

That is the v1 path because the contract mapping is not proven on a live catalog yet. It is a dead end only when the same app must be installed by many merchants in different organizations. Shopify does not allow a copy of the same custom app per merchant as a way around that limit. When that day comes, the app is recreated (distribution cannot be switched later) as a **public** app and submitted for review.

**Unlisted** is a visibility flag on a public app. The app still has an App Store URL and still passes review. v1 does not use it.

**Admin-created custom apps** cannot be created after 2026-01-01. v1 does not use them. Existing ones stay out of this package so token handling stays on OAuth.

Listing later also means: protected-customer-data review if order or customer fields are added, the compliance webhooks from section 5.4, expiring offline tokens (already the default), and a privacy policy. None of that is required to prove catalog, cart, and `checkoutUrl` on one development store.

## 9. Phased pull requests

After this plan is accepted, work happens in `millers-dev/fast-buy-json-shopify`. One sequence. Each pull request merges on its own. Tests use checked-in GraphQL fixtures. CI does not call Shopify. No second HTTP protocol, no UCP client, no Shopify app template, no embedded UI.

Runtime default: Node.js 18+, TypeScript, global `fetch`, `node:test`. Pin `2026-10` in one module. Do not add a Shopify web framework.

| PR | Ships | Tests |
| --- | --- | --- |
| 1. Scaffold and detect | Package, `/api/fastbuyjson/detect`, vendored schemas from tag `1.0.0`. No Shopify network. | Detect shape and cache header. Response validates against `detect-response.json`. `confirmCreatesOrder` is false. Seed shipping and seed tax are absent. |
| 2. Install and tokens | Client-credentials and code grant (`expiring=1`), SQLite token store, HMAC checks, uninstall, compliance webhooks. | Bad `hmac`, bad `state`, and a foreign `shop` store nothing. Refresh failure yields **500** `INTERNAL_ERROR` and no token in the body. Uninstall deletes the row. |
| 3. Catalog | Storefront search mapping. | `"19.99"` and `"10.00"`. Variant attributes. `out_of_stock`. Currency mismatch is **400**. Sort-key fallback recorded. |
| 4. Cart | Opaque cart id, line UUIDs, mutations, idempotency. | Second add reuses the Shopify cart id. PATCH and DELETE use the stored line GID. Responses contain no `key=`. Replay and **409** `IDEMPOTENCY_KEY_CONFLICT`. |
| 5. Discount | One code via `cartDiscountCodesUpdate`. | Inapplicable code is **422** and is removed. `null` clears the list. |
| 6. Checkout handoff | Initiate writes buyer and address, returns `checkoutUrl`. Confirm checks the session, then refuses payment. | URL is HTTPS. Cart `key` is absent. Bad session and bad verification use the contract codes. A valid session is `PAYMENT_METHOD_UNSUPPORTED`. The fixture records no `complete_checkout` call and no payment payload. |
| 7. Shipping options | Delivery groups after an address exists. | No address → `options: []`. Options without day bounds are omitted and counted. |

Order status is not in this sequence. It needs `read_orders` or Order webhooks, protected customer data, and a status map onto `confirmed` / `processing` / `shipped` / `delivered` / `cancelled` / `refunded`. That is a new plan after v1 has been used on a real development store. The order-status plan is [`SHOPIFY_ORDERS_PLAN.md`](SHOPIFY_ORDERS_PLAN.md). Mapping `delivered` starts after the order-status plan. The delivered-status plan is [`SHOPIFY_DELIVERED_PLAN.md`](SHOPIFY_DELIVERED_PLAN.md). Returning shipping and billing addresses on that route after an email check is [`SHOPIFY_EMAIL_ORDER_PLAN.md`](SHOPIFY_EMAIL_ORDER_PLAN.md).

This repository needs no code change for that sequence. `docs/INTEGRATIONS.md` already says `FASTBUYJSON_API_URL` may be any compatible API.

## 10. Risks

**Shopify’s own agent channel.** Agentic Storefronts, Catalog MCP, Cart MCP, and Checkout MCP are Shopify’s surface for AI chats. Every current plan advertises “Sell in AI chats.” Merchants can enable that and still install this connector. The pitch stays: FastBuyJSON is the agent-commerce contract; the Shopify package is one store connector; Shopify Checkout remains the payment page. v1 must not present `complete_checkout` as something the connector can call.

**Checkout lock-in.** Hosted `checkoutUrl` is the supported end of the Storefront Cart API. `complete_checkout` is not a drop-in replacement: it needs a Token-tier agent, Shopify’s permission to complete purchases, and a trusted-UI payment credential. Building v1 against that gate would block the connector on Shopify’s agent approval. The handoff is the path that works with the scopes in section 5.2.

**Basic plan data access.** The pricing page gives custom apps **limited** data access on Basic and **full** data access from Grow upward. API rate limits are standard on Basic and Grow, up to 2× on select APIs on Advanced, and up to 10× on select APIs on Plus. v1 uses Storefront catalog and cart, not Admin customer or order fields, and it honors **429** `RATE_LIMITED`. A later order-status phase re-reads both the pricing row and the protected-customer-data rules against the shop’s plan before adding scopes.

**App review, if the app is listed.** Public distribution, including an unlisted listing, requires review. Review will look at scopes, protected customer data, compliance webhooks, and whether the app does what the listing says. Custom distribution avoids that until the mapping is proven. Distribution cannot be changed in place. Listing means a new public app.

**Cart secret and PII.** Logging `checkoutUrl` is enough for the buyer to pay. Logging the cart `key`, the Admin token, or the delegate token is not. Addresses go to Shopify at initiate and are not kept as a second customer database.

**Contract drift.** Money strings, cursor pagination, estimated tax, one anonymous cart per process, stricter variant selection, and confirm that does not create an order are the drifts section 6 spells out. `/detect` is how an agent sees them. Silent compatibility with the demo seed catalog is not a goal.

**Reference MCP error text.** Confirm’s problem body is included in the MCP tool error (`detail` and `checkoutUrl`). Initiate already returns `checkoutUrl` in the tool text. That is the handoff the agent uses.

**API calendar.** 2026-10 falls out of support on 2026-10-16. A later pull request bumps the pin while the version is still supported. Requests that name a dead version are rewritten by Shopify to the oldest supported stable version, which is a quiet behavior change. The pin stays explicit.

## 11. Defaults this plan accepts

No open product question blocks the first code PR. Merging this plan accepts the following. A review comment that names the row is enough to change it.

| # | Default |
| --- | --- |
| D1 | New public repo `millers-dev/fast-buy-json-shopify`. This repo does not gain a Shopify package. |
| D2 | v1 checkout is Storefront `checkoutUrl`. `complete_checkout` is out of v1 and out of the phased PRs above. |
| D3 | Custom distribution, one shop per process. App Store listing is a later app, after the mapping is proven. |
| D4 | Scopes are the four `unauthenticated_*` scopes in section 5.2. Expiring offline tokens (`expiring=1`) on the code grant. |
| D5 | One anonymous cart per process, so the current MCP server is unchanged. |
| D6 | `POST /checkout/confirm` returns `PAYMENT_METHOD_UNSUPPORTED` after the session checks, and does not create an order. |
| D7 | No order-status phase until a separate plan. |
| D8 | Node 18+, TypeScript, `fetch`, `node:test`, fixtures, API `2026-10`. |

A later attempt to become a Token-tier UCP agent, or to list a public app, needs its own plan. It is not an unanswered question inside v1.

## 12. Sources

FastBuyJSON, this repository, release 1.0.0:

- `docs/CONTRACT.md` — base path, problem codes, idempotency, cart mutations, totals.
- `docs/COMPATIBILITY.md` — additive response fields and capability strings in 1.x.
- `docs/INTEGRATIONS.md` — stdio MCP and `FASTBUYJSON_API_URL`.
- `docs/DOCS_PLAN.md` — this repository’s user-doc boundary.
- `schemas/product.json`, `schemas/cart.json`, `schemas/cart-item.json`, `schemas/checkout-initiate.json`, `schemas/checkout-initiate-response.json`, `schemas/checkout-confirm.json`, `schemas/error.json`, `schemas/shipping-option.json`, `schemas/money.json`.
- `mcp-server/src/adapter.ts` — default API URL, checkout body (`state` rather than `region`). HTTP errors include the problem body when the response has one (`mcp-server/src/http-error.ts`).
- `mcp-server/src/index.ts` — tool list. `fastbuy_add_to_cart` has no cart id. Initiate and confirm return adapter JSON or an error string.

Shopify, read 2026-10-03. Storefront field pages linked at `2026-07` are the pages read that day. The connector still pins API `2026-10`. The catalog pull request re-checks those fields on `2026-10` before the mapper freezes.

- Pricing, including plan amounts, “Sell in AI chats,” custom-app data access, and API rate limits: <https://www.shopify.com/pricing>
- Agentic Storefronts and the separate Agentic plan: <https://www.shopify.com/blog/agentic-commerce>, <https://www.shopify.com/agentic-plan>
- API versioning (2026-10 stable): <https://shopify.dev/docs/api/usage/versioning>
- Storefront cart and `checkoutUrl`: <https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage>, <https://shopify.dev/docs/api/storefront/latest/mutations/cartCreate>
- Money as a decimal string: <https://shopify.dev/docs/api/storefront/2026-07/objects/MoneyV2>, <https://shopify.dev/docs/api/storefront/2026-07/scalars/Decimal>
- Discount codes replace the list: <https://shopify.dev/docs/api/storefront/2026-07/mutations/cartDiscountCodesUpdate>
- Select a delivery option: <https://shopify.dev/docs/api/storefront/latest/mutations/cartSelectedDeliveryOptionsUpdate>
- Catalog search: <https://shopify.dev/docs/api/storefront/2026-07/queries/search>
- Access scopes (`unauthenticated_read_checkouts` / `unauthenticated_write_checkouts` cover `Cart`): <https://shopify.dev/docs/api/usage/access-scopes>
- Authorization code grant and `expiring=1`: <https://shopify.dev/docs/apps/auth/get-access-tokens/authorization-code-grant>
- Access tokens, including the 2027-01-01 rule for public apps: <https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens>
- Client credentials for a same-organization store: <https://shopify.dev/docs/apps/build/dev-dashboard/get-api-access-tokens>
- Delegate token and `Shopify-Storefront-Private-Token`: <https://shopify.dev/docs/apps/build/authentication-authorization/delegate-api-access>
- Buyer IP on server-side Storefront calls: <https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/use-delegate-tokens>
- Public Storefront token (not used in v1): <https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/storefrontAccessTokenCreate>
- Distribution (custom vs public; cannot change later): <https://shopify.dev/docs/apps/launch/distribution/select-distribution-method>
- Unlisted means limited visibility of a public listing: <https://shopify.dev/docs/apps/launch/distribution/visibility>
- No new admin custom apps after 2026-01-01: <https://changelog.shopify.com/posts/legacy-custom-apps-can-t-be-created-after-january-1-2026>
- Protected customer data: <https://shopify.dev/docs/apps/launch/protected-customer-data>
- Checkout MCP and `complete_checkout`: <https://shopify.dev/docs/agents/carts-and-checkout/checkout-mcp>
- Who may complete checkout: <https://shopify.dev/docs/agents/profiles/auth-and-rate-limiting>, <https://shopify.dev/docs/agents/get-started/checkout>
- Cart and checkout overview (handoff via `continue_url`): <https://shopify.dev/docs/agents/carts-and-checkout>
- Storefront MCP cart tools removed in favor of UCP: <https://shopify.dev/docs/apps/build/storefront-mcp/servers/storefront>
