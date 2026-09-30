# FastBuyJSON compatibility policy (1.x)

FastBuyJSON **1.0.0** is the first stable major line. This document defines what integrators and agents can rely on within **1.x** releases.

## Semantic versioning

- **Major (`1.x` → `2.0.0`):** May introduce breaking changes. Breaking changes require a new major version and a published migration guide.
- **Minor (`1.0` → `1.1`):** Additive only — new optional fields, endpoints, error codes (with new HTTP statuses only when unavoidable), and capability descriptors.
- **Patch (`1.0.0` → `1.0.1`):** Bug fixes and documentation; no contract changes.

Within **1.x**, the following stability guarantees apply.

## Additive-only contract

1. **Request bodies** keep `additionalProperties` open (or equivalent forward-compat parsing). Clients may send unknown top-level properties; reference servers must not reject them with `VALIDATION_ERROR` solely for being unknown.
2. **Response bodies** may gain new optional fields at any time. Clients must ignore unknown fields.
3. **`extensions` objects** are vendor-owned. The core specification does not define keys inside `extensions`. Reserved namespaces: `fastbuyjson`, `x-fastbuyjson`.
4. **No removal or renaming** of documented fields, endpoints, or stable error `code` values within 1.x.
5. **Totals math** for the reference seed catalog (shipping options, tax rules, promos) remains stable unless a patch explicitly documents a correction.

## Stable error registry

Problem `code` values listed in [`CONTRACT.md`](CONTRACT.md) are stable for 1.x. New codes may be added; existing codes keep the same HTTP status mapping.

## Stable headers

The following request/response headers are stable for 1.x:

- `Authorization` (Bearer JWT)
- `Idempotency-Key`
- `Content-Type` / `Accept` (`application/json`, `application/problem+json`)
- `X-Certificate-Session` (reserved)
- MCP reference headers (`X-MCP-Client`, `X-User-Agent`)

## Deprecation policy

1. Deprecated features are announced in `CHANGELOG.md` and marked in OpenAPI descriptions when applicable.
2. Deprecated behavior remains functional for at least one **minor** release before removal (which itself requires a major bump).
3. `/detect` `supportedFeatures` and `capabilities` advertise what the server implements; clients should prefer capability discovery over hard-coded assumptions.

## What “stable” does not cover

- Demo catalog product IDs, prices, and inventory (reference data only).
- Unpublished SaaS or hosted offerings (separate repositories).
- npm publication of `@fastbuyjson/sdk` (local path in this monorepo).
