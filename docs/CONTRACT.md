# FastBuyJSON HTTP contract (1.0.0)

This document describes the contract implemented by the reference Node and Python servers. The machine-readable spec is generated at [`openapi/fastbuyjson.yaml`](../openapi/fastbuyjson.yaml) from JSON Schemas in [`schemas/`](../schemas/).

## Base path

All endpoints are under `/api/fastbuyjson`.

## Errors (RFC 9457)

Failed requests return `Content-Type: application/problem+json` with at least:

| Field | Required | Description |
|-------|----------|-------------|
| `type` | yes | `https://fastbuyjson.org/problems/<code-slug>` |
| `title` | yes | Short summary |
| `status` | yes | HTTP status (duplicate of response status) |
| `code` | yes | Stable machine code (registry below) |
| `detail` | no | Occurrence-specific explanation |
| `instance` | no | Request path (e.g. `/cart/add`) |
| `errors` | no | Field errors `{ field, message }[]` for validation |

### Status ↔ code registry

| Status | `code` | When |
|--------|--------|------|
| 400 | `VALIDATION_ERROR` | Missing/invalid fields (`errors[]` populated when applicable) |
| 400 | `INVALID_CHECKOUT_SESSION` | Confirm with unknown/bad session |
| 400 | `CHECKOUT_SESSION_EXPIRED` | Session past `expiresAt` |
| 400 | `INVALID_PAYMENT_DETAILS` | Missing/invalid payment payload |
| 400 | `PAYMENT_METHOD_UNSUPPORTED` | e.g. `cash_on_delivery` |
| 400 | `VERIFICATION_REQUIRED` | Missing transaction verification |
| 400 | `INVALID_VERIFICATION_METHOD` | Unknown verification method |
| 400 | `STRONGER_VERIFICATION_REQUIRED` | Risk rules require stronger verification |
| 400 | `INVALID_VERIFICATION_TOKEN` | Token mismatch |
| 401 | `AUTHENTICATION_REQUIRED` | Bearer missing when required (reserved for future strict routes) |
| 401 | `INVALID_TOKEN` | Malformed, empty, or invalid/expired access token |
| 401 | `INVALID_CREDENTIALS` | Login failure |
| 401 | `INVALID_REFRESH_TOKEN` | Refresh failure |
| 401 | `CERTIFICATE_VERIFICATION_FAILED` | Certificate auth failure |
| 403 | `FORBIDDEN` | Reserved (roles not enforced in 0.x) |
| 404 | `PRODUCT_NOT_FOUND` | Unknown product |
| 404 | `CART_NOT_FOUND` | Unknown cart for the caller |
| 404 | `CART_ITEM_NOT_FOUND` | Unknown `itemId` in the caller's cart |
| 404 | `ORDER_NOT_FOUND` | Unknown order |
| 422 | `INVALID_DISCOUNT_CODE` | Unknown or ineligible promo code |
| 409 | `IDEMPOTENCY_KEY_CONFLICT` | Same `Idempotency-Key`, different request fingerprint |
| 429 | `RATE_LIMITED` | Reserved |
| 500 | `INTERNAL_ERROR` | Unhandled server error |

`401` responses for invalid Bearer tokens include `WWW-Authenticate: Bearer`.

## Authentication

| Endpoint | Auth |
|----------|------|
| `GET /detect` | Public |
| `POST /auth/login`, `/auth/refresh`, `/auth/certificate` | Public |
| Commerce (`products`, `cart`, `checkout`, `orders`) | Optional JWT (`Authorization: Bearer`); anonymous guest if omitted |

Identity for carts, checkout, and orders is always the JWT `sub` claim. Header `X-User-Id` is **not** part of the contract and must not be used for authorization.

**Certificate flow (experimental):** `POST /auth/certificate` returns `{ session_id, expires_in }` (24h). Reserved header `X-Certificate-Session` for future mTLS; no commerce endpoint consumes certificate sessions in 0.x.

## Idempotency

- Header: `Idempotency-Key` (UUID recommended) on mutating POSTs: `/cart/add`, `/checkout/initiate`, `/checkout/confirm`.
- Client-optional in 0.x; **servers must honor** when present.
- Storage scope: ``${identity}:${key}`` where `identity` is JWT `sub` or `anonymous`.
- Fingerprint: `sha256(method + "\n" + routePath + "\n" + canonicalJSON(body))` (hex). `canonicalJSON` sorts object keys recursively with no insignificant whitespace.
- Same key + same fingerprint + prior **2xx** → replay cached status/body; response header `Idempotency-Replayed: true`.
- Same key + different fingerprint → **409** `IDEMPOTENCY_KEY_CONFLICT` (record unchanged).
- **4xx/5xx** do not store the key.
- Retention: **24 hours**, lazy expiration on lookup (no background sweeper).
- `PATCH` / `DELETE` cart mutations are naturally idempotent; `Idempotency-Key` is **not** honored on those routes.

## Cart mutations (0.3.0)

| Method | Path | Body | Success |
|--------|------|------|---------|
| `PATCH` | `/cart/items/{itemId}` | `{ "quantity": int ≥ 1 }` | `200` `CartResponse` |
| `DELETE` | `/cart/items/{itemId}` | — | `200` `CartResponse` |
| `DELETE` | `/cart` | — | `200` `CartResponse` (same cart `id`, empty `items`, zeroed totals including `discount`) |

Each line item receives a stable `itemId` (UUID) when added via `POST /cart/add`. `PATCH` sets **absolute** quantity (`quantity: 0` is rejected; use `DELETE` to remove a line).

## Cache-Control

| Surface | Header |
|---------|--------|
| `GET /detect` | `public, max-age=300` |
| Auth + commerce | `no-store` |

Checkout session expiry remains in the JSON body (`expiresAt`, typically 1 hour).

## Typed product filters (0.4.0)

`POST /products/search` accepts `filters` with typed fields (root `additionalProperties` remains open in 0.4.0):

| Field | Type | Semantics |
|-------|------|-----------|
| `brand` | string | Case-insensitive exact brand match |
| `categories` | string[] | Any-match against product `categories` |
| `priceRange` | `{ min?, max?, currency? }` | Inclusive bounds on `price.amount` (default currency USD) |
| `availability` | string[] | Product `availability.status` must be in the set |
| `extensions` | object | Opaque vendor extensions (ignored by reference servers) |

## Shipping (0.4.0)

- **Catalog:** `standard` (USD 10.00, free when `taxableBase > 100.00`) and `express` (USD 25.00 flat).
- **Discovery:** `GET /shipping/options` returns contextual option amounts for the caller's cart (or zero base when no cart).
- **Cart:** `cart.shipping` includes `selectedOptionId` (default `standard`), charged `amount`, and full `options[]` snapshot.
- **Checkout:** optional `shippingOptionId` on `POST /checkout/initiate` selects the method before totals finalize.

## Tax (0.4.0)

- **Base:** `taxableBase = round2(subtotal − discount)` (shipping excluded).
- **Rates (seed):** default 10%, `DE` 19%, `GB` 20%.
- **Cart:** default jurisdiction rate; **checkout** uses shipping address `country`.
- **Response:** `totals.taxBreakdown` with `rate`, `taxableAmount`, `amount`, `label`, `jurisdiction`.

## Discounts (0.4.0)

- **Promos (seed):** `SAVE10` (10% percentage), `WELCOME5` (USD 5 fixed); **non-stackable**.
- **Apply:** `POST /cart/discount` with `{ "code": "SAVE10" }`; `{ "code": null }` or empty clears.
- **Checkout:** optional `discountCode` on initiate applies before totals.
- **Response:** `totals.discount`, `totals.discountBreakdown[]`, `cart.appliedDiscounts[]`.

## Totals order (0.4.0)

1. `taxableBase = round2(subtotal − discount)`
2. `tax = round2(taxableBase × rate)`
3. `shipping` from selected option (standard free-shipping uses `taxableBase > 100`)
4. `total = round2(subtotal − discount + tax + shipping)`

With no discount and `standard` shipping, reference servers reproduce pre-0.4 cart totals for the demo catalog.

## Discovery capabilities (0.4.0+)

`/detect` adds `capabilities` (filters, shipping, tax, discounts, extensions) and advertises commerce features in `supportedFeatures`.

## Extensions & vendor data (1.0.0)

- **`extensions`** on requests (`/cart/add`, `/checkout/initiate`, `/checkout/confirm`, search filters) is an opaque object (`additionalProperties: true`). Reference servers **echo** client-provided `extensions` on cart and order resources; they never invent core keys inside `extensions`.
- **Reserved namespaces:** `fastbuyjson`, `x-fastbuyjson`. Vendors should use reverse-DNS keys (e.g. `com.example`) or an `x-` prefix for custom fields.
- **`filters.extensions`** is ignored for product matching (stability); it exists for forward-compatible client metadata.
- **Forward compatibility:** Unknown top-level request properties must not cause `VALIDATION_ERROR`. See [`COMPATIBILITY.md`](COMPATIBILITY.md).

Reference integrators may register extra shipping, promo, or tax entries via `src/extensions.js` / `src/python/extensions.py` (empty by default).

## Request validation (0.5.0+)

Mutating and search endpoints validate JSON request bodies against `schemas/*.json` (Draft 07) in both reference servers before business rules run. Failures return **400** `VALIDATION_ERROR` with `errors[]`. Format assertions are limited to `uuid`, `email`, and `date-time` for Node/Python parity; `additionalProperties` remains open on request objects in 1.x.

| Method | Path | Schema file |
|--------|------|-------------|
| `POST` | `/auth/login` | `login-request.json` |
| `POST` | `/auth/refresh` | `refresh-request.json` |
| `POST` | `/auth/certificate` | `certificate-request.json` |
| `POST` | `/products/search` | `product-search.json` |
| `POST` | `/cart/add` | `add-to-cart.json` |
| `PATCH` | `/cart/items/{itemId}` | `cart-update-item.json` |
| `POST` | `/cart/discount` | `cart-discount.json` |
| `POST` | `/checkout/initiate` | `checkout-initiate.json` |
| `POST` | `/checkout/confirm` | `checkout-confirm.json` |

JWT and idempotency middleware run in the same order as before: optional JWT first, then schema validation, then idempotency on applicable routes.

## Versioning

- OpenAPI `info.version`, packages, and `/detect` `specVersion` / `implementationVersion` are aligned at **1.0.0** for this release.
- SemVer policy for 1.x: [`COMPATIBILITY.md`](COMPATIBILITY.md).
- `standard` in `/detect` is the string `FastBuyJSON` (not a versioned product name).

## Conformance

Shared declarative scenarios live under [`conformance/`](../conformance/) and run in-process against both reference servers in CI.
