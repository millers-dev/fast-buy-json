# Shopify order-status plan

Status: proposed. English only. This file is the implementation plan for `GET /api/fastbuyjson/orders/{orderId}` on the Shopify connector. It is documentation. Accepting it does not change the HTTP contract, the JSON Schemas, the OpenAPI document, the reference servers, the TypeScript SDK, or the MCP server.

Checked against this repository at **1.0.0** (`docs/CONTRACT.md`, `schemas/order-status.json`, OpenAPI `getOrderStatus`) and against Shopify’s public docs on **2026-10-05**. Sources are listed at the end. The connector’s v1 sequence is [`SHOPIFY_PLAN.md`](SHOPIFY_PLAN.md). This plan starts after that sequence. It does not reopen it.

## 1. Decision

| Topic | Default |
| --- | --- |
| Where the code lands | `millers-dev/fast-buy-json-shopify`, after the v1 pull requests in `SHOPIFY_PLAN.md` section 9. This repository keeps the contract. |
| Route | `GET /api/fastbuyjson/orders/{orderId}` returns `OrderStatusResponse` (`schemas/order-status.json`). |
| Shopify call | Pull-only Admin GraphQL, API **2026-10**. One order per request. |
| Scope added | `read_orders`. The default window is about 60 days. `read_all_orders` stays off. |
| Order creation | Still none. `POST /checkout/confirm` does not create an order. `confirmCreatesOrder` stays `false`. |
| Buyer auth | Anonymous, same as the rest of this connector. A Bearer token is ignored. |
| `delivered` | Not produced in this phase. |

Accepting this plan accepts those defaults. Section 10 lists them again so a review comment can overturn one without reopening the rest.

## 2. Recon, checked on 2026-10-05

API pin stays **2026-10**. Admin URL `https://{shop}.myshopify.com/admin/api/2026-10/graphql.json`. This phase does not bump the pin. Storefront catalog and cart stay on the same pin.

| Claim | Result |
| --- | --- |
| `order` and `orderByIdentifier` both exist on Admin GraphQL 2026-10. | Holds. They do not accept the same ids. |
| `order(id: ID!)` loads one order. | Holds. The argument is a GID, for example `gid://shopify/Order/469306983`. A legacy numeric id is that GID with the digits filled in. The query returns null when the id is unknown or outside the granted window. |
| `orderByIdentifier` accepts a name or a confirmation number. | Does not hold on 2026-10. `OrderIdentifierInput` has `id` and `customId` (a unique metafield value). It has no `name` and no `confirmationNumber`. This phase does not call `orderByIdentifier`. |
| Name and confirmation number are lookup filters. | Holds on the `orders` connection. Documented filters include `name:` (example `name:1001-A`) and the customer-facing confirmation number. `confirmationNumber` is a random alphanumeric string (example `XPAV284CT`) and is **not** guaranteed unique. The connector asks for `first: 2` and requires exactly one node. That call resolves one id. It is not a list route. |
| `read_orders` sees about the last 60 days. | Holds. Older orders need `read_all_orders`. This phase does not request it. An order outside the window is null, and the route answers **404** `ORDER_NOT_FOUND`. |
| `OrderDisplayFulfillmentStatus` on 2026-10 is `FULFILLED`, `PARTIALLY_FULFILLED`, `UNFULFILLED`, `IN_PROGRESS`, `ON_HOLD`, `SCHEDULED`, `PENDING_FULFILLMENT`, `REQUEST_DECLINED`, `FULFILLMENT_NOT_REQUIRED`, `OPEN`, `RESTOCKED`. | Holds. The enum has no `SHIPPED`, no `PARTIAL`, and no delivered value. `OPEN` and `RESTOCKED` are documented as replaced by `UNFULFILLED`. |
| `OrderDisplayFinancialStatus` on 2026-10 is `PENDING`, `AUTHORIZED`, `PAID`, `PARTIALLY_PAID`, `PARTIALLY_REFUNDED`, `REFUNDED`, `EXPIRED`, `VOIDED`. | Holds. |
| Custom distribution gets protected-customer-data level 2 without App Store review. | Holds on the protected-customer-data page: level 2 for a custom app is **always available**. Public apps need review. The same page says the Partner Dashboard must declare protected customer data and the individual fields in use (address, and email when email is returned). Development stores can use the declared fields without submitting that review. |
| Tracking lives on `Fulfillment.trackingInfo`. | Holds. Fields are `company`, `number`, and `url`. There is no estimated-delivery day count on that object. |
| Card metadata lives on `CardPaymentDetails`. | Holds. `number` is a redacted card number. `paymentMethodName` is the method name. Reading it still depends on protected-customer-data approval for the fields the query selects. |

The connector pull request re-checks the `orders` filter keys and the money and tracking field names on the pinned 2026-10 schema before the mapper freezes. A missing field is a fixture failure, not a guessed substitute.

## 3. Package and schemas

Code lands in the connector repository. This pull request adds this file only, plus the one-line pointer in `SHOPIFY_PLAN.md` section 9.

The connector keeps vendoring `schemas/` from tag `1.0.0` of this repository. It validates the order response against `schemas/order-status.json` in its tests. It does not edit vendored schemas, and it does not fork them. A contract change still lands here first.

No new SQLite table. The handler reads Shopify and writes the HTTP response. It does not store the order, the address, the email, or the card.

## 4. Route

`GET /orders/{orderId}` on the connector base path (`http://localhost:3100/api/fastbuyjson` in local development).

The agent already has the id. Hosted checkout does not return one: confirm does not create the order, and v1 keeps no checkout-to-order row. The id comes from the Shopify status page, the shop’s email, or the Shopify admin. This phase does not invent a local map from `checkoutUrl` or `sessionToken` to an order.

### 4.1 Discovery

`GET /detect` adds `orders` to `endpoints`, next to `products`, `cart`, and `checkout`. `auth` stays absent.

`capabilities.checkout` stays `{ "handoff": "shopify_hosted", "confirmCreatesOrder": false }`.

Detect still sends `Cache-Control: public, max-age=300`. The order route does not.

### 4.2 Which Admin query

| Client `orderId` | Admin call |
| --- | --- |
| `gid://shopify/Order/<digits>` | `order(id:)` with that GID. |
| Digits, or digits with one leading `#` (example `1001` or `#1001`) | Name first, then legacy id. See below. |
| Any other accepted token (confirmation number, or a name such as `EN1001` or `1001-A`) | `orders(first: 2, query: "name:… OR confirmation_number:…")`. |

Accepted tokens are 1 to 40 characters: a GID of the form above, or a string matching a leading `#` plus letters, digits, `_`, and `-`, or the same without the `#`. Anything else is **404** `ORDER_NOT_FOUND`. The handler does not interpolate that string into GraphQL.

**Digits.** Strip one leading `#`. Query `orders(first: 2)` with `name:"#<digits>"`.

| Nodes | Result |
| --- | --- |
| 1 | Use that order. Do not also load the legacy id. |
| More than 1 | **404** `ORDER_NOT_FOUND`. |
| 0 | `order(id: "gid://shopify/Order/<digits>")`. Null is **404**. |

Name wins when both a name `#1001` and a different legacy id `1001` exist. The second call runs only when the name query returns no nodes.

**Other tokens.** Quote the value. Query `name:"<value>" OR name:"#<value>" OR confirmation_number:"<value>"` with `first: 2`. Exactly one node is that order. Zero nodes, or more than one, is **404** `ORDER_NOT_FOUND`. `confirmationNumber` is not unique, so the handler does not pick the first of several.

`orderByIdentifier` is the wrong query for every row in this table on 2026-10.

The selection set asks for the fields in section 6. It does not ask for `email`, `phone`, customer name, or cardholder name. It does not ask for the Order GID in order to echo it. The implementation may read `name` and the line and money fields. Logs still follow section 4.6.

### 4.3 Status

First match wins. Later rows do not run.

| # | When | `order.status` |
| --- | --- | --- |
| 1 | `cancelledAt` is set | `cancelled` |
| 2 | `displayFinancialStatus` is `REFUNDED` or `PARTIALLY_REFUNDED` | `refunded` |
| 3 | `displayFulfillmentStatus` is `FULFILLED` or `SHIPPED` | `shipped` |
| 4 | `displayFulfillmentStatus` is `PARTIAL` | `processing` |
| 5 | Paid and unfulfilled | `confirmed` |
| 6 | Anything else | `processing` |

Paid means `displayFinancialStatus` is `PAID`. Unfulfilled means `displayFulfillmentStatus` is `UNFULFILLED`, `OPEN`, or `RESTOCKED`.

`PARTIALLY_PAID` is not paid. A paid order that is `PARTIALLY_FULFILLED`, `IN_PROGRESS`, `ON_HOLD`, `SCHEDULED`, `PENDING_FULFILLMENT`, `REQUEST_DECLINED`, or `FULFILLMENT_NOT_REQUIRED` is not unfulfilled and is not `FULFILLED`, so it falls through to row 6 and stays `processing`.

2026-10 does not return `SHIPPED` or `PARTIAL`. Row 3 still matches `FULFILLED`, which is the value the pinned enum uses for a fully fulfilled order. Row 4 stays in the table so a fixture that actually contains `PARTIAL` maps to `processing`. `PARTIALLY_FULFILLED` is not `PARTIAL` and is not `FULFILLED`; row 6 maps it to `processing`.

This phase never sets `delivered`. It does not turn a fulfilled order into delivered after a number of days, and it does not read a tracking scan as delivered. The enum value remains in the contract schema. The connector leaves it unused.

A cancelled order that was also refunded is `cancelled` (row 1). A fulfilled order that was refunded is `refunded` (row 2), not `shipped`.

### 4.4 Body

`order.id` is the client-supplied token with one leading `#` removed, except when that token is a GID or a legacy numeric id that was resolved through `order(id:)`. Those two responses use the order `name` with one leading `#` removed (example `#1001` becomes `1001`). The body never contains `gid://`.

`created` is `createdAt`. `updated` is `updatedAt` when Shopify sends it.

`message`, `extensions`, and `userId` are omitted. `extensions` is not a place to hide a GID.

Money uses the cart rule from `SHOPIFY_PLAN.md` section 6. Shopify `MoneyBag.shopMoney.amount` is a decimal string. Parse it in decimal arithmetic and emit a JSON number at the currency’s minor-unit precision (USD: two places). Tests cover `"19.99"` and `"10.00"`. Currency is `shopMoney.currencyCode`. This phase does not convert presentment money into shop money. If `shopMoney` is missing for a required amount, the route returns **500** `INTERNAL_ERROR` and does not invent `0`.

| FastBuyJSON | Shopify `shopMoney` |
| --- | --- |
| Line `price` | `discountedUnitPriceSet`, otherwise `originalUnitPriceSet` |
| Line `lineTotal` | `discountedTotalSet`, otherwise `originalTotalSet` |
| `totals.subtotal` | `currentSubtotalPriceSet`, otherwise `subtotalPriceSet` |
| `totals.tax` | `currentTotalTaxSet`, otherwise `totalTaxSet`. Omit the key when the bag is null. |
| `totals.shipping` | `currentShippingPriceSet`, otherwise `totalShippingPriceSet`. Omit the key when the bag is null. |
| `totals.discount` | `currentTotalDiscountsSet`, otherwise `totalDiscountsSet`. Omit the key when the bag is null. |
| `totals.total` | `currentTotalPriceSet`, otherwise `totalPriceSet` |

`totals.subtotal` and `totals.total` are required by the schema. Tax, shipping, and discount are optional. If the parts and Shopify’s total disagree, keep Shopify’s figures. The connector does not recompute the total with the reference formula.

Line items are read until the connection is exhausted. The response lists every line.

| Line field | Source |
| --- | --- |
| `name` | Line `title`. Omit when empty. |
| `quantity` | Line quantity. |
| `options` | `variant.selectedOptions` name/value map. Omit when empty. |
| `productId` | First non-empty of variant `sku`, line `sku`, and variant `legacyResourceId` rendered as a decimal string. |

`productId` is never a GID. Catalog ids in v1 are GIDs, so an order line does not round-trip to `POST /cart/add`. That drift is accepted: the order body stays free of `gid://`. A line with no sku and no variant legacy id is left out of `items`. The fixture records the omission. `items` may be an empty array when every line is in that state.

**Addresses.** Map `address1` → `line1`, `address2` → `line2`, `city` → `city`, `province` → `region`, `countryCodeV2` → `country`, `zip` → `postalCode`. Include `shippingAddress` or `billingAddress` only when Shopify returns the object and `line1`, `city`, `country`, and `postalCode` are all present. Otherwise omit the whole object. Omit empty `line2` and empty `region`. Do not select address name or phone.

**Payment.** Omit `payment` when `paymentGatewayNames` is empty or `displayFinancialStatus` is null. Otherwise `method` is the first gateway name, unchanged (`shopify_payments`, `Cash on Delivery (COD)`, and so on). `status` comes from the financial status:

| `displayFinancialStatus` | `payment.status` |
| --- | --- |
| `PENDING`, `AUTHORIZED` | `pending` |
| `PAID`, `PARTIALLY_PAID` | `approved` |
| `REFUNDED`, `PARTIALLY_REFUNDED` | `refunded` |
| `EXPIRED`, `VOIDED` | `declined` |

`lastFourDigits` and `brand` are set only when the transaction payload contains them and protected-customer-data access allows those fields. `brand` is `CardPaymentDetails.paymentMethodName`. `lastFourDigits` is four digits taken from the end of the redacted `number`. Any other shape omits `lastFourDigits`. Omit `externalPaymentId`. Do not copy the redacted number, the cardholder name, the BIN, or the expiry into the body.

When GraphQL returns HTTP 200 with a populated order and an `errors` entry that only redacts a protected field, drop that field and still return **200**. A denial of the Order object itself is **500** `INTERNAL_ERROR`.

**Shipment.** Walk `fulfillments` in order. Skip a fulfillment whose status is `CANCELLED`, `ERROR`, or `FAILURE`. Use the first remaining fulfillment that has a `trackingInfo.number`. Map `company` → `carrier`, `number` → `trackingNumber`, `url` → `trackingUrl`. Omit a key when its value is null. Omit `trackingUrl` when the value is not an absolute URI. Omit `shipment` when no fulfillment has a tracking number. Never set `estimatedDelivery`.

### 4.5 Errors and cache

| Condition | Response |
| --- | --- |
| No order, more than one match, id outside the 60-day window, or a token this phase does not accept | **404** `ORDER_NOT_FOUND` (`https://fastbuyjson.org/problems/order-not-found`) |
| `read_orders` is not on the token, or the Admin token cannot be refreshed | **500** `INTERNAL_ERROR`. `detail` says the shop must be reinstalled. The body has no token and no GID. |
| Shopify **429** or a documented throttle | **429** `RATE_LIMITED`. One backoff using Shopify’s guidance, then the problem response. No retry loop. |
| The mapped body fails `schemas/order-status.json` | **500** `INTERNAL_ERROR`. Do not send the invalid body. |

Every response from this route, including errors, sends `Cache-Control: no-store`.

The 404 body does not say whether the id was old, ambiguous, or unknown.

### 4.6 Auth and logs

Commerce auth stays the v1 connector rule. Anonymous callers are allowed. A `Authorization: Bearer` header is ignored. The route does not return **401** `INVALID_TOKEN` for a leftover demo JWT, and it does not filter the order by JWT `sub`. One process is one shop. Whoever can call the connector and knows an accepted id can read that order.

Logs for this route may include the HTTP status and the client token when that token is not a GID. A GID lookup is logged as a gid lookup without the GID. Logs omit Admin tokens, delegate tokens, addresses, email, phone, names, card numbers, last four, brand, and every `gid://` string.

## 5. Access

Add `read_orders` to the comma-separated scope list from `SHOPIFY_PLAN.md` section 5.2. The four `unauthenticated_*` scopes stay. Still omitted: `write_orders`, `read_all_orders`, `read_customers`, `write_customers`, `read_products`, `write_products`, draft-order scopes, and any Admin checkout scope.

An install that already granted the v1 scopes does not gain `read_orders` by itself. The merchant install goes through the authorization code grant again. The same-organization client-credentials path needs the new scope on the app and a new token. Until that grant exists, the order route returns the **500** in section 4.5. Catalog, cart, and checkout keep working on the old token.

Protected customer data for this custom-distribution app: level 2 is available without App Store review. The Partner Dashboard still declares the fields the query can return.

| Declare | Why |
| --- | --- |
| Address | Shipping and billing lines, city, region, country, postal code, when the API returns them. |
| Email | Only if a later change returns email. This phase does not select `email` and does not declare it. |

Do not declare name or phone. The selection set does not read them. Card last four and brand are included only when the approved fields actually return them; otherwise those two keys are absent.

Level 2 requirements on the protected-customer-data page still apply (encryption, retention, access limits). This phase keeps no order archive, so retention for order bodies is the lifetime of the HTTP response.

## 6. What this phase cannot do

- Create, update, cancel, refund, or capture an order. No `write_orders`. No cancel route. No refund route.
- List orders. The Admin `orders` connection is used only with `first: 2` to resolve one id.
- Read orders older than the `read_orders` window. No `read_all_orders`.
- Subscribe to order webhooks. Pull-only. The v1 compliance webhooks stay as they are. This phase adds no `orders/create` and no `orders/updated`.
- Call Customer Account API, or log a buyer into Shopify Customer Accounts.
- Call Checkout MCP `complete_checkout`, or register a UCP agent.
- Return `order` or `orderId` from `POST /checkout/confirm`.
- Bump `SHOPIFY_API_VERSION` off `2026-10`.
- Edit `schemas/`, `openapi/`, or the reference servers.
- Map `delivered`.
- Put a Shopify GID in the response body, in `extensions`, or in logs.

## 7. Tests

The connector pull request uses checked-in Admin GraphQL fixtures. CI does not call Shopify. Each fixture is validated against the vendored `schemas/order-status.json`.

| Fixture | Expect |
| --- | --- |
| Name `1001` | Query uses `name:"#1001"`. `order.id` is `1001`. Body and logged lines contain no `gid://`. |
| Name query empty, legacy id set | Second call is `order(id: "gid://shopify/Order/1001")`. `order.id` is the normalized name, not the GID. |
| Confirmation number, one node | That order. `order.id` is the client token. |
| Confirmation query returns two nodes | **404** `ORDER_NOT_FOUND`. |
| Unknown id, and an id the fixture marks as outside the window | **404**. Detail does not say which. |
| `cancelledAt` set on a fulfilled, refunded order | `cancelled`. |
| `REFUNDED` and `PARTIALLY_REFUNDED` while fulfilled | `refunded`. |
| `FULFILLED` and paid | `shipped`. The string `delivered` is absent. |
| `PARTIALLY_FULFILLED` and paid | `processing`. |
| `PAID` and `UNFULFILLED` | `confirmed`. |
| `PENDING` and `UNFULFILLED` | `processing`. |
| `PAID` and `FULFILLMENT_NOT_REQUIRED` | `processing`. |
| Money strings `"19.99"` and `"10.00"` | JSON numbers `19.99` and `10`. |
| Null shipping address, and an address missing `zip` | Those address objects are absent. |
| First fulfillment cancelled, second has `company`, `number`, `url` | `shipment` uses the second. No `estimatedDelivery`. |
| No tracking number | No `shipment`. |
| Card `number` ending in four digits, and `paymentMethodName` | `lastFourDigits` and `brand`. The redacted number is not a response field. |
| Card fields null or redacted by an errors entry | `payment.method` and `payment.status` remain. `lastFourDigits` and `brand` are absent. Response stays **200**. |
| Empty `paymentGatewayNames` | No `payment`. |
| Bearer header on an otherwise good fixture | **200**, same body as the anonymous call. |
| Token without `read_orders` | **500** `INTERNAL_ERROR`, reinstall detail, no token in the body. |
| Detect fixture | `endpoints` includes `orders`. `confirmCreatesOrder` is false. `auth` is absent. |
| Order route responses | `Cache-Control: no-store`. |

## 8. Phased pull requests

| PR | Where | Ships |
| --- | --- | --- |
| 1. This plan | This repository | `docs/SHOPIFY_ORDERS_PLAN.md` and the one-line pointer from `SHOPIFY_PLAN.md` section 9. No schema, OpenAPI, or runtime change. |
| 2. Order status | `millers-dev/fast-buy-json-shopify` | Add `read_orders` to the scope list and the reinstall behavior. `GET /orders/{orderId}` with the lookup, the status map, and the body rules above. Fixture tests from section 7. `/detect` advertises `orders` and keeps `confirmCreatesOrder: false`. |

PR 2 is one connector pull request. It merges on its own, after the v1 sequence. It vendors schemas. It does not edit them. Runtime stays Node.js 18+, TypeScript, global `fetch`, `node:test`, API `2026-10`.

This repository needs no further code change for PR 2. The reference MCP server already calls `FASTBUYJSON_API_URL`. `getOrderStatus` is already on the SDK surface. Pointing that URL at the connector is how an agent reads the new route.

## 9. Risks

**Guessable ids.** Anonymous access plus an order name of `1001` means a caller who can reach the process can try names. That is the access model section 4.6 accepts for this single-shop connector. Customer Accounts are a later plan. This phase does not add a shared secret on the order URL.

**60-day window.** `read_orders` hides older orders. They look like unknown orders. `read_all_orders` is a separate grant and stays out of this phase.

**Protected customer data.** Addresses and card fragments are level 2 data even though App Store review is not required for custom distribution. The Dashboard declaration is still required. A query that asks for an undeclared field comes back redacted; section 4.4 drops the field. Logging those fields would break the level 2 handling this plan is willing to ship.

**Fulfillment vocabulary.** Shopify’s display status `FULFILLED` becomes FastBuyJSON `shipped`. Agents that treat `shipped` as “handed to a carrier” and `delivered` as “received” will not see `delivered` here. The status page and `trackingUrl` are the delivery signal this phase can return.

**Name versus legacy id.** A digit token tries the name `#1001` before the legacy GID. A shop with a custom name prefix and a colliding legacy id can resolve the name and never the legacy id. Callers with a legacy id can still pass the GID.

**Confirmation numbers collide.** Two nodes is a 404. Returning one of them would attach the wrong address and tracking number to the token the agent sent.

**API calendar.** `SHOPIFY_PLAN.md` records that 2026-10 falls out of support on 2026-10-16. This phase does not bump the pin. A later pull request bumps it while a version is still supported. The order mapper is re-checked on that bump.

**Contract identity.** `docs/CONTRACT.md` says order identity is the JWT `sub`. This connector already ignores Bearer for cart. The order route does the same. `/detect` shows `anonymous` and does not show `auth`.

## 10. Defaults this plan accepts

No open product question blocks the connector pull request. Merging this plan accepts the following. A review comment that names the row is enough to change it.

| # | Default |
| --- | --- |
| O1 | One connector pull request adds `read_orders`, `GET /orders/{orderId}`, fixtures, and `orders` on `/detect`. |
| O2 | Lookup is `order(id:)` for a GID or a legacy numeric id, and `orders(first: 2)` for a name or a confirmation number. `orderByIdentifier` is not used. |
| O3 | Digit tokens try `name:"#<digits>"` before the legacy GID. |
| O4 | Zero or many matches, and orders outside the `read_orders` window, are **404** `ORDER_NOT_FOUND`. |
| O5 | Status follows section 4.3. `delivered` is unused. `FULFILLED` maps to `shipped`. `PARTIALLY_FULFILLED` maps to `processing`. |
| O6 | `order.id` never echoes a GID. Money uses shop `MoneyBag` strings, parsed like the cart. |
| O7 | Addresses, last four, and brand are omitted unless the API returns them under the declared protected-customer-data fields. |
| O8 | Anonymous access. Bearer is ignored. `confirmCreatesOrder` stays false. |
| O9 | No `write_orders`, no `read_all_orders`, no order webhooks, no Customer Accounts, no UCP, no pin change, no schema edit. |

## 11. Sources

FastBuyJSON, this repository, release 1.0.0:

- `docs/SHOPIFY_PLAN.md` — v1 connector, hosted checkout, scopes, money strings, `confirmCreatesOrder: false`, and the pointer in section 9.
- `docs/CONTRACT.md` — `ORDER_NOT_FOUND`, optional Bearer on commerce routes, problem types.
- `schemas/order-status.json` — `OrderStatusResponse`. Status enum includes `delivered`. This phase does not emit it.
- `schemas/detect-response.json` — `endpoints` may include `orders`.
- OpenAPI operation `getOrderStatus` — `Cache-Control: no-store` on the 200 response.

Shopify, read 2026-10-05. The connector still pins API `2026-10`.

- `order`: <https://shopify.dev/docs/api/admin-graphql/2026-10/queries/order>
- `orderByIdentifier`: <https://shopify.dev/docs/api/admin-graphql/2026-10/queries/orderByIdentifier>
- `OrderIdentifierInput` (`id`, `customId` only): <https://shopify.dev/docs/api/admin-graphql/2026-10/input-objects/OrderIdentifierInput>
- `orders` filters, including `name:`: <https://shopify.dev/docs/api/admin-graphql/2026-10/queries/orders>
- `OrderDisplayFulfillmentStatus`: <https://shopify.dev/docs/api/admin-graphql/2026-10/enums/OrderDisplayFulfillmentStatus>
- `OrderDisplayFinancialStatus`: <https://shopify.dev/docs/api/admin-graphql/2026-10/enums/OrderDisplayFinancialStatus>
- `FulfillmentTrackingInfo`: <https://shopify.dev/docs/api/admin-graphql/2026-10/objects/FulfillmentTrackingInfo>
- `CardPaymentDetails`: <https://shopify.dev/docs/api/admin-graphql/2026-10/objects/CardPaymentDetails>
- Order access and the 60-day window: <https://shopify.dev/docs/api/usage/access-scopes>
- Protected customer data (custom app level 2 always available; field declaration): <https://shopify.dev/docs/apps/launch/protected-customer-data>
- API versioning (2026-10): <https://shopify.dev/docs/api/usage/versioning>
