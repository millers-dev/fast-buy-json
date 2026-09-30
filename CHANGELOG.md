# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2025-09-30

### Added

- **Typed search filters:** `brand`, `categories[]`, `priceRange`, `availability[]`, and `extensions` on `POST /products/search` (both reference servers).
- **Shipping:** `GET /shipping/options`, cart `shipping` object, optional `shippingOptionId` on checkout initiate; `standard` and `express` catalog.
- **Tax:** `totals.taxBreakdown` with jurisdiction rules (default, `DE`, `GB`); checkout uses shipping country.
- **Discounts:** `POST /cart/discount`, seed promos `SAVE10` / `WELCOME5`, optional `discountCode` on checkout; `totals.discount` is computed.
- **Discovery:** `/detect` `capabilities` block and commerce feature flags.
- **Schemas:** `ShippingOption`, `TaxBreakdown`, `Applied Discount`, `CartDiscountRequest`, `ShippingOptionsResponse`.
- **Conformance:** `conformance/cases/commerce.json` for filters, totals, discounts, and shipping.
- **MCP:** `fastbuy_get_shipping_options`, `fastbuy_apply_discount`; typed filters with one-release legacy `minPrice`/`maxPrice`/`category` mapping.

### Changed

- **Totals pipeline:** Documented order of operations with `taxableBase` and `round2` half-up rounding (`src/commerce.js`, `src/python/commerce.py`).
- **Versions:** Packages, OpenAPI, MCP, and `/detect` aligned at **0.4.0**.

## [0.3.0] - 2025-09-30

### Added

- **Cart mutations:** `PATCH /cart/items/{itemId}`, `DELETE /cart/items/{itemId}`, and `DELETE /cart` with stable per-line `itemId` on add.
- **Error code:** `404 CART_ITEM_NOT_FOUND` for unknown line items.
- **Conformance suite v0:** Shared JSON scenarios under `conformance/` with Node and Python in-process runners wired into CI.
- **Schema:** `CartUpdateItemRequest` (`schemas/cart-update-item.json`).

### Changed

- **Idempotency:** Scoped store ``${identity}:${key}``, SHA-256 request fingerprints, `409 IDEMPOTENCY_KEY_CONFLICT` on payload mismatch, 24h lazy TTL; only 2xx responses are stored.
- **Versions:** Packages, OpenAPI, MCP, and `/detect` aligned at **0.3.0** (`scripts/check_versions.py`).

## [0.2.0] - 2025-09-30

### Contract (Phase 1)

- **Schemas as source of truth:** All request/response models live under `schemas/`; `openapi/fastbuyjson.yaml` is generated via `scripts/build_openapi.py` and drift-checked in CI.
- **Errors:** RFC 9457 `application/problem+json` with stable `code` values (see `docs/CONTRACT.md`).
- **Auth:** Identity from JWT `sub` only; removed `X-User-Id` from the OpenAPI contract; malformed/invalid Bearer tokens return `401` with `WWW-Authenticate: Bearer`.
- **Idempotency:** Optional `Idempotency-Key` on mutating POSTs; successful replays return `Idempotency-Replayed: true`; reserved `409 IDEMPOTENCY_KEY_CONFLICT` documented (enforcement deferred to Phase 2).
- **Caching:** `Cache-Control: no-store` on commerce/auth responses; `GET /detect` uses `public, max-age=300`.
- **Discovery:** `/detect` returns `standard: "FastBuyJSON"`, required `specVersion` and `implementationVersion` (both `0.2.0` in this release).
- **Version alignment:** Package, MCP, OpenAPI `info.version`, and demos unified at `0.2.0` (`scripts/check_versions.py`).

### Reference servers

- Node and Python demos emit identical problem details and headers for the behaviors above.

## [0.1.0] - 2026-09-30

### Added

- Recovered baseline snapshot after local tree loss: JSON Schemas (`schemas/`), reconstructed OpenAPI (`openapi/fastbuyjson.yaml`), Node.js and Python demo APIs, reference MCP server, Postman collection, and schema validation CI.

### Changed

- Version labels aligned to **0.1.0** across packages, OpenAPI `info.version`, `/detect` (`standard` and `implementationVersion`), and MCP server metadata. Replaces premature **1.0.0** labels that did not match the recovered implementation maturity.

### Notes

- This release documents the restored reference implementation, not a finalized 1.0 protocol contract.
