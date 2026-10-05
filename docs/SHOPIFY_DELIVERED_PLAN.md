# Shopify delivered-status plan

Status: proposed. English only. This file is the implementation plan for mapping FastBuyJSON `order.status` `delivered` on the Shopify connector. It is documentation. Accepting it does not change the HTTP contract, the JSON Schemas, the OpenAPI document, the reference servers, the TypeScript SDK, the MCP server, or the connector runtime.

Checked against this repository at **1.0.0** (`docs/CONTRACT.md`, `schemas/order-status.json`, OpenAPI `getOrderStatus`) and against Shopify’s public docs on **2026-10-05**. Sources are listed at the end. The order route, the lookup, and the rest of the status map stay in [`SHOPIFY_ORDERS_PLAN.md`](SHOPIFY_ORDERS_PLAN.md). This plan starts after that one. It does not reopen it. The v1 sequence stays in [`SHOPIFY_PLAN.md`](SHOPIFY_PLAN.md).

## 1. Decision

| Topic | Default |
| --- | --- |
| Where the code lands | `millers-dev/fast-buy-json-shopify`, after the order-status connector pull request in `SHOPIFY_ORDERS_PLAN.md` section 8. This repository keeps the contract. |
| Route | The same `GET /api/fastbuyjson/orders/{orderId}`. No new route. |
| Shopify call | The same pull-only Admin GraphQL order read, API **2026-10**. |
| Signal | `Fulfillment.deliveredAt` is set. That field is on the 2026-10 `Fulfillment` object. |
| When `delivered` wins | After the cancelled and `REFUNDED` checks, and only for an order whose `displayFulfillmentStatus` is `FULFILLED`, when every active fulfillment has `deliveredAt` set and at least one active fulfillment exists. |
| `FULFILLED` without that signal | Stays `shipped`, as in `SHOPIFY_ORDERS_PLAN.md` section 4.3. |
| Scope added | None. `read_orders` from the order-status plan is enough to read `Fulfillment`. |
| Body besides `order.status` | Unchanged. `deliveredAt` is not copied into the response. `shipment.estimatedDelivery` stays omitted. |

Accepting this plan accepts those defaults. Section 7 lists them again so a review comment can overturn one without reopening the rest.

## 2. Recon, checked on 2026-10-05

API pin stays **2026-10**. Admin URL `https://{shop}.myshopify.com/admin/api/2026-10/graphql.json`. This phase does not bump the pin.

The working hypothesis was: set `order.status` to `delivered` only when a fulfillment, or the equivalent object on 2026-10, exposes an explicit delivered or `deliveredAt` field. The `Fulfillment` page has `deliveredAt`. That is the signal this phase uses. The same pages do not say Shopify writes that date from `displayStatus` or from a `DELIVERED` fulfillment event, so those values stay out of the mapper.

| Claim | Result |
| --- | --- |
| `Fulfillment.deliveredAt` exists on Admin GraphQL 2026-10. | Holds. It is a nullable `DateTime`. The page says “The date that this fulfillment was delivered.” |
| `Fulfillment.displayStatus` can be `DELIVERED`. | Holds. `FulfillmentDisplayStatus.DELIVERED` is “Displayed as Delivered.” The field is nullable. The `Fulfillment` page does not say this value is written whenever `deliveredAt` is set, or the reverse. This phase does not read `displayStatus`. |
| `FulfillmentEvent.status` can be `DELIVERED`. | Holds. The enum says “The fulfillment was successfully delivered.” `Fulfillment.events` is the connection. The event object also has `address1`, `city`, `zip`, `latitude`, and `longitude`. This phase does not select `events`. The event page and the `fulfillmentEventCreate` page do not say that a `DELIVERED` event writes `Fulfillment.deliveredAt`. |
| `Order.displayFulfillmentStatus` can be a delivered value. | Does not hold. `OrderDisplayFulfillmentStatus` on 2026-10 is still `FULFILLED`, `PARTIALLY_FULFILLED`, `UNFULFILLED`, `IN_PROGRESS`, `ON_HOLD`, `SCHEDULED`, `PENDING_FULFILLMENT`, `REQUEST_DECLINED`, `FULFILLMENT_NOT_REQUIRED`, `OPEN`, `RESTOCKED`. `FULFILLED` means all items have been fulfilled. |
| `Fulfillment.status` can be `DELIVERED`. | Does not hold. `FulfillmentStatus` is `SUCCESS`, `CANCELLED`, `ERROR`, `FAILURE`, plus deprecated `OPEN` and `PENDING`. `SUCCESS` means the fulfillment was completed. That is the merchant’s fulfillment work, which `SHOPIFY_ORDERS_PLAN.md` already maps from order-level `FULFILLED` to `shipped`. |
| `FulfillmentOrder` exposes `deliveredAt` or a delivered status. | Does not hold. Its dates are `fulfillAt` and `fulfillBy` (when work becomes fulfillable, and the latest time to fulfill). `FulfillmentOrderStatus` is `CANCELLED`, `CLOSED`, `IN_PROGRESS`, `INCOMPLETE`, `ON_HOLD`, `OPEN`, `SCHEDULED`. `CLOSED` means the fulfillment order has been completed and closed. `destination` is an address. This phase does not select `FulfillmentOrder`. |
| `estimatedDeliveryAt` or `inTransitAt` means the package was delivered. | Does not hold. `estimatedDeliveryAt` is “The estimated date that this fulfillment will arrive.” `inTransitAt` is when the fulfillment went into transit. |
| Reading `deliveredAt` needs a scope beyond `read_orders`. | Does not hold. The `Fulfillment` object accepts `read_orders` (one of several scopes, any one of which is enough). The order-status plan already adds `read_orders`. |
| `Order.fulfillments` is a paginated connection. | Does not hold. It is a non-null list `[Fulfillment!]!`. The `first` argument truncates that list. |

The connector pull request re-checks `Fulfillment.deliveredAt`, `Fulfillment.status`, and `Order.fulfillments` on the pinned 2026-10 schema before the mapper freezes. A missing `deliveredAt` field is a fixture failure. The connector does not substitute `displayStatus`, an event, a day count, or a tracking scan.

## 3. What changes in the connector

The order-status connector pull request still ships with `delivered` unused. This phase is the next connector pull request. It edits the selection set and the status function. Lookup, money, items, payment, shipment, errors, cache, and logs stay as in `SHOPIFY_ORDERS_PLAN.md`.

### 3.1 Selection set

On the fulfillment nodes the order-status plan already walks, add `deliveredAt`.

The selection does not pass `first` on `Order.fulfillments`. Truncating the list can drop an active fulfillment whose `deliveredAt` is null and make the check in section 3.2 succeed on a short slice.

Still selected, from the order-status plan: fulfillment `status`, and `trackingInfo` `company`, `number`, and `url`.

Not selected: `events` (and therefore no event `status`, `address1`, `city`, `zip`, `latitude`, or `longitude`), `displayStatus`, `estimatedDeliveryAt`, `inTransitAt`, `originAddress`, `location`, `fulfillmentOrders`, and `FulfillmentOrder.destination`. Those objects are how a later change would pull an address or invent a second signal. This phase leaves them out of the query.

### 3.2 Status

First match wins. Later rows do not run. Rows 1, 2, 5, and 6 are the order-status plan’s rows 1, 2, 4, and 5. Row 3 is new. Row 4 is the old `FULFILLED` → `shipped` row, and it runs only when row 3 did not match.

| # | When | `order.status` |
| --- | --- | --- |
| 1 | `cancelledAt` is set | `cancelled` |
| 2 | `displayFinancialStatus` is `REFUNDED` | `refunded` |
| 3 | `displayFulfillmentStatus` is `FULFILLED` and the delivered signal below is present | `delivered` |
| 4 | `displayFulfillmentStatus` is `FULFILLED` | `shipped` |
| 5 | Paid and unfulfilled | `confirmed` |
| 6 | Anything else | `processing` |

Paid and unfulfilled keep the order-status definitions. Paid means `displayFinancialStatus` is `PAID`. Unfulfilled means `displayFulfillmentStatus` is `UNFULFILLED`, `OPEN`, or `RESTOCKED`.

**Delivered signal.** An active fulfillment has `status` other than `CANCELLED`, `ERROR`, or `FAILURE`. That is the same skip list as the shipment walk. Deprecated `OPEN` and `PENDING` are active if they appear. The signal is present when the active set has at least one fulfillment and every fulfillment in that set has `deliveredAt` set. An empty active set is not the signal. A `FULFILLED` order with no fulfillment nodes stays on row 4 (`shipped`).

`requiresShipping: false` stays in the active set. A non-shipping fulfillment with null `deliveredAt` keeps a `FULFILLED` order on row 4. This phase does not treat “no shipping required” as delivered.

`PARTIALLY_REFUNDED` does not match row 2. When the delivered signal is also present, row 3 matches, so the order is `delivered`. `payment.status` stays `approved`, as in the order-status plan. A `PARTIALLY_REFUNDED` order that is `FULFILLED` without the signal stays `shipped` (row 4).

`PARTIALLY_FULFILLED` does not match row 3, including when the fulfillment that does exist has `deliveredAt` set. It is not paid-and-unfulfilled, so it stays `processing` (row 6).

A cancelled order that was delivered is `cancelled` (row 1). A delivered order whose financial status is `REFUNDED` is `refunded` (row 2).

`displayStatus` is not an input to this table. A payload that contains `displayStatus: DELIVERED` with `deliveredAt` null stays on row 4 when the order is `FULFILLED`. The same is true for `OUT_FOR_DELIVERY`, `ATTEMPTED_DELIVERY`, `NOT_DELIVERED`, `PICKED_UP`, and `READY_FOR_PICKUP`. A `FulfillmentEvent` with `status: DELIVERED` is not an input either, because `events` are not selected and the mapper does not derive `deliveredAt` from them.

### 3.3 Body

`order.status` is the only response field this phase changes.

The shipment walk is unchanged: skip `CANCELLED`, `ERROR`, and `FAILURE`, then the first remaining fulfillment with a `trackingInfo.number`. `deliveredAt` does not choose which fulfillment supplies `carrier`, `trackingNumber`, or `trackingUrl`.

`schemas/order-status.json` has `shipment.estimatedDelivery` and has no delivered timestamp. The connector still omits `estimatedDelivery`. It does not format `deliveredAt` or `estimatedDeliveryAt` into that key. It does not put `deliveredAt` in `extensions` or in logs. Logs still follow `SHOPIFY_ORDERS_PLAN.md` section 4.6, including the ban on `gid://` strings.

### 3.4 Fixtures

The connector pull request adds these fixtures next to the order-status set. Each one is an Admin GraphQL payload, checked in, and validated against the vendored `schemas/order-status.json`. CI does not call Shopify.

| Fixture | Expect |
| --- | --- |
| `FULFILLED`, one `SUCCESS` fulfillment, `deliveredAt` set | `delivered`. |
| `FULFILLED`, one `SUCCESS` fulfillment, `deliveredAt` null | `shipped`. The string `delivered` is absent. |
| `FULFILLED`, two `SUCCESS` fulfillments, only one `deliveredAt` set | `shipped`. |
| `FULFILLED`, no fulfillment nodes | `shipped`. |
| `FULFILLED`, `SUCCESS` with `deliveredAt` set, plus `CANCELLED` with `deliveredAt` null | `delivered`. The cancelled node is not active. |
| `FULFILLED`, `SUCCESS` with `deliveredAt` null, plus `CANCELLED` with `deliveredAt` set | `shipped`. |
| `PARTIALLY_FULFILLED`, the only fulfillment has `deliveredAt` set | `processing`. |
| `cancelledAt` set, `FULFILLED`, `deliveredAt` set | `cancelled`. |
| `REFUNDED`, `FULFILLED`, `deliveredAt` set | `refunded`. |
| `PARTIALLY_REFUNDED`, `FULFILLED`, every active fulfillment has `deliveredAt` set | `delivered`. `payment.status` is `approved`. |
| `FULFILLED`, payload includes `displayStatus: DELIVERED` and `deliveredAt` null, and the query does not ask for `displayStatus` | `shipped`. |
| `FULFILLED`, payload includes a `FulfillmentEvent` with `status: DELIVERED` and `deliveredAt` null, and the query does not ask for `events` | `shipped`. |
| `FULFILLED`, `estimatedDeliveryAt` in the past, `deliveredAt` null | `shipped`. No `estimatedDelivery`. |
| `FULFILLED`, `requiresShipping: false` with `deliveredAt` null, beside a `SUCCESS` fulfillment with `deliveredAt` set | `shipped`. |
| Selection-set fixture | The fulfillment selection includes `deliveredAt` and does not include `events`, `displayStatus`, `estimatedDeliveryAt`, `inTransitAt`, `originAddress`, or `location`. The `fulfillments` field has no `first` argument. |

The order-status fixtures for name lookup, money, addresses, card fragments, and cache stay in force. The old “`FULFILLED` and paid → `shipped`, and the string `delivered` is absent” fixture remains the null-`deliveredAt` case above.

## 4. What this phase cannot do

- Set `delivered` from a number of days after `FULFILLED`, from `inTransitAt`, from `estimatedDeliveryAt`, or from the text of a tracking page.
- Treat `Fulfillment.status` `SUCCESS`, or order-level `FULFILLED`, as delivered on its own.
- Treat `FulfillmentOrder` `CLOSED`, `fulfillAt`, or `fulfillBy` as delivered.
- Read `displayStatus` or walk `events` to fill in a null `deliveredAt`.
- Call `fulfillmentEventCreate` or any other fulfillment write. No `write_fulfillments`.
- Add `read_all_orders`, `read_customers`, fulfillment-order scopes, or any scope beyond the order-status list.
- Select an address, a card fragment, event coordinates, or `FulfillmentOrder.destination`.
- Subscribe to fulfillment or order webhooks.
- Bump `SHOPIFY_API_VERSION` off `2026-10`.
- Edit `schemas/`, `openapi/`, the reference servers, the TypeScript SDK, or the MCP server.
- Put `deliveredAt` on the HTTP body, or set `shipment.estimatedDelivery`.
- Return `delivered` for `PARTIALLY_FULFILLED`, or for a `FULFILLED` order whose active fulfillments are not all dated.

## 5. Phased pull requests

| PR | Where | Ships |
| --- | --- | --- |
| 1. This plan | This repository | `docs/SHOPIFY_DELIVERED_PLAN.md`, plus the pointers in `SHOPIFY_PLAN.md` section 9 and `SHOPIFY_ORDERS_PLAN.md`. No schema, OpenAPI, SDK, MCP, or connector change. |
| 2. Delivered status | `millers-dev/fast-buy-json-shopify` | After the order-status connector pull request. Add `deliveredAt` to the fulfillment selection and apply section 3.2. Fixtures from section 3.4. |

PR 2 merges on its own. It vendors schemas from this repository. It does not edit them. Runtime stays Node.js 18+, TypeScript, global `fetch`, `node:test`, API `2026-10`.

This repository needs no further code change for PR 2. `getOrderStatus` is already on the SDK and on the reference MCP server.

## 6. Risks

**`deliveredAt` and `displayStatus` can diverge.** The 2026-10 pages document both, and they do not document that Shopify writes them together. A shop that shows Delivered in the admin while `deliveredAt` is null stays `shipped` here. Switching the signal to `displayStatus`, or accepting either field, is a review comment on section 7, not a silent fallback in the mapper.

**Events are a second source with addresses attached.** `FulfillmentEvent.status` `DELIVERED` is explicit. The same object carries a street address and coordinates. Selecting the connection to read one enum would pull those fields into the query. The pages also do not say the event is what sets `deliveredAt`. This phase keeps the query on the date field.

**Split shipments.** One delivered package and one package with null `deliveredAt` stay `shipped` for the whole order. FastBuyJSON has one `order.status`. The shipment object still describes a single tracking number, chosen by the existing walk, which may be a package that is not the one with `deliveredAt`.

**Non-shipping lines.** A digital or no-shipping fulfillment with null `deliveredAt` blocks `delivered` for an otherwise dated order. Treating `requiresShipping: false` as outside the active set would mark that order delivered without a date on every fulfillment. Section 7 keeps those nodes in the set.

**The field arrives when Shopify sets it.** Carrier scans update Shopify on Shopify’s schedule. Until `deliveredAt` is non-null, a `FULFILLED` order stays `shipped`. This phase does not poll a carrier and does not add a webhook.

**Truncation.** Passing `first` on `fulfillments` hides later nodes. The selection omits `first`. If a future pin makes `first` required, PR 2 stops on that fixture. It does not pick a page size.

**API calendar.** `SHOPIFY_PLAN.md` records that 2026-10 falls out of support on 2026-10-16. This phase does not bump the pin. A later pull request bumps it while a version is still supported, and re-checks `deliveredAt` on that pin. If the field is gone, `delivered` stays unmapped until a plan names the replacement. The connector does not invent one during the bump.

**Order-level vocabulary.** Agents that treat `FULFILLED` as delivered will still see `shipped` when the date is absent. That is the order-status plan’s row, kept on purpose.

## 7. Defaults this plan accepts

No open product question blocks the connector pull request. Merging this plan accepts the following. A review comment that names the row is enough to change it.

| # | Default |
| --- | --- |
| D1 | The only delivered signal is non-null `Fulfillment.deliveredAt`. `displayStatus`, `FulfillmentEvent.status`, `estimatedDeliveryAt`, `inTransitAt`, and `FulfillmentOrder` are not read. |
| D2 | Status follows section 3.2. `delivered` sits after `cancelled` and `REFUNDED`, and before `shipped`. `FULFILLED` without the signal stays `shipped`. |
| D3 | The signal requires a non-empty active set, and `deliveredAt` on every member. Active means `status` other than `CANCELLED`, `ERROR`, or `FAILURE`. |
| D4 | `requiresShipping: false` stays in the active set. Null `deliveredAt` on that node blocks `delivered`. |
| D5 | `PARTIALLY_FULFILLED` stays `processing` even when a fulfillment has `deliveredAt`. `PARTIALLY_REFUNDED` with the signal is `delivered`, and `payment.status` stays `approved`. |
| D6 | The selection adds `deliveredAt` only. It does not pass `first` on `fulfillments`. It does not select `events`, `displayStatus`, `estimatedDeliveryAt`, `inTransitAt`, `originAddress`, or `location`. |
| D7 | The HTTP body gains no field. `shipment.estimatedDelivery` stays omitted. `deliveredAt` is not logged. |
| D8 | No new scope, no `read_all_orders`, no fulfillment write, no webhook, no Customer Accounts, no UCP, no pin change, no schema edit. |
| D9 | One connector pull request, after the order-status connector pull request, carries the selection change, the status table, and the fixtures. |

## 8. Sources

FastBuyJSON, this repository, release 1.0.0:

- `docs/SHOPIFY_ORDERS_PLAN.md` — order route, section 4.3 status map, shipment walk, `read_orders`, and the rule that the order-status phase leaves `delivered` unused.
- `docs/SHOPIFY_PLAN.md` — v1 sequence and the pointer in section 9.
- `schemas/order-status.json` — `OrderStatusResponse`. The status enum already includes `delivered`. `shipment.estimatedDelivery` is optional. This phase does not edit the schema.
- OpenAPI operation `getOrderStatus`.

Shopify, read 2026-10-05. The connector still pins API `2026-10`.

- `Fulfillment`, including `deliveredAt`, `displayStatus`, `events`, `estimatedDeliveryAt`, `inTransitAt`, and `status`: <https://shopify.dev/docs/api/admin-graphql/2026-10/objects/Fulfillment>
- `FulfillmentDisplayStatus` (`DELIVERED`, and the values this phase does not treat as delivered): <https://shopify.dev/docs/api/admin-graphql/2026-10/enums/FulfillmentDisplayStatus>
- `FulfillmentStatus` (`SUCCESS`, `CANCELLED`, `ERROR`, `FAILURE`): <https://shopify.dev/docs/api/admin-graphql/2026-10/enums/FulfillmentStatus>
- `FulfillmentEvent` (status plus address and coordinates): <https://shopify.dev/docs/api/admin-graphql/2026-10/objects/FulfillmentEvent>
- `FulfillmentEventStatus` (`DELIVERED`): <https://shopify.dev/docs/api/admin-graphql/2026-10/enums/FulfillmentEventStatus>
- `fulfillmentEventCreate` (a write this phase does not call): <https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/fulfillmentEventCreate>
- `Order.fulfillments` (`[Fulfillment!]!`, optional `first` truncation) and `displayFulfillmentStatus`: <https://shopify.dev/docs/api/admin-graphql/2026-10/objects/Order>
- `OrderDisplayFulfillmentStatus` (no delivered value): <https://shopify.dev/docs/api/admin-graphql/2026-10/enums/OrderDisplayFulfillmentStatus>
- `FulfillmentOrder` (`fulfillAt`, `fulfillBy`, `destination`; no `deliveredAt`): <https://shopify.dev/docs/api/admin-graphql/2026-10/objects/FulfillmentOrder>
- `FulfillmentOrderStatus` (no delivered value): <https://shopify.dev/docs/api/admin-graphql/2026-10/enums/FulfillmentOrderStatus>
- Order access scopes, including the `read_orders` window: <https://shopify.dev/docs/api/usage/access-scopes>
- API versioning (2026-10): <https://shopify.dev/docs/api/usage/versioning>
