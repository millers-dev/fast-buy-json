# FastBuyJSON HTTP contract (0.2.0)

This document freezes the Phase 1 contract implemented by the reference Node and Python servers. The machine-readable spec is generated at [`openapi/fastbuyjson.yaml`](../openapi/fastbuyjson.yaml) from JSON Schemas in [`schemas/`](../schemas/).

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
| 404 | `CART_NOT_FOUND` | Unknown cart |
| 404 | `ORDER_NOT_FOUND` | Unknown order |
| 409 | `IDEMPOTENCY_KEY_CONFLICT` | Reserved — same key, different payload (Phase 2 enforcement) |
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
- Same key + prior **2xx** → replay cached status/body; response header `Idempotency-Replayed: true`.
- **4xx/5xx** do not store the key.
- Same key + different payload → **409** `IDEMPOTENCY_KEY_CONFLICT` (documented; durable fingerprint enforcement is Phase 2).
- Retention target: 24 hours (in-memory demos may not expire until Phase 2).

## Cache-Control

| Surface | Header |
|---------|--------|
| `GET /detect` | `public, max-age=300` |
| Auth + commerce | `no-store` |

Checkout session expiry remains in the JSON body (`expiresAt`, typically 1 hour).

## Versioning

- OpenAPI `info.version`, packages, and `/detect` `specVersion` / `implementationVersion` are aligned at **0.2.0** for this release.
- `standard` in `/detect` is the string `FastBuyJSON` (not a versioned product name).
