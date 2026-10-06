# Shopify email order plan

Status: proposed. English only. This file is the implementation plan for returning `shippingAddress` and `billingAddress` on the Shopify connector’s order route after an email check. It is documentation. Accepting it does not change the HTTP contract, the JSON Schemas, the OpenAPI document, the reference servers, the TypeScript SDK, the MCP server, or the connector runtime.

Checked against this repository at **1.0.0** (`docs/CONTRACT.md`, `schemas/order-status.json`, OpenAPI `getOrderStatus`) and against Shopify’s public docs on **2026-10-06**. Sources are listed at the end. The order route, the lookup, and the status map stay in [`SHOPIFY_ORDERS_PLAN.md`](SHOPIFY_ORDERS_PLAN.md). Mapping `delivered` stays in [`SHOPIFY_DELIVERED_PLAN.md`](SHOPIFY_DELIVERED_PLAN.md). This plan starts after the order-status plan. It does not reopen either plan. The v1 sequence stays in [`SHOPIFY_PLAN.md`](SHOPIFY_PLAN.md).

The defaults in section 1 were accepted on **2026-10-06** by Tomasz and Shopify engineering. Section 7 lists them again so a review comment can overturn one without reopening the rest.

## 1. Decision

| Topic | Default |
| --- | --- |
| Where the code lands | `millers-dev/fast-buy-json-shopify`, after the order-status connector pull request in `SHOPIFY_ORDERS_PLAN.md` section 8. This repository keeps the contract. |
| Route | The same `GET /api/fastbuyjson/orders/{orderId}`. No new route. |
| Email input | Query parameter `email` on that GET. No request body. No email header. |
| Check | Trim both strings, then compare them case-insensitively to `Order.email` from the same Admin GraphQL order read. A missing Shopify email fails the check. |
| Failed check | **200**, the same order body as today, without `shippingAddress` and without `billingAddress`. Also without `lastFourDigits` and `brand`. The route does not answer **401** or **403**. |
| Unknown order | **404** `ORDER_NOT_FOUND`, whether or not `email` is present. |
| Passed check | Map `shippingAddress` and `billingAddress` when Shopify sends them. FastBuyJSON keys are `line1`, `line2`, `city`, `region`, `country`, `postalCode`. A missing required field omits that whole address object. |
| Card fragments | `lastFourDigits` and `brand` stay omitted. |
| Scope | `read_orders` only. No new OAuth scope. |
| Protected customer data | Custom app level 2. Partner Dashboard declares Address, and Email for the comparison only. The body does not return email, phone, or name. |
| Identity | Unchanged. JWT `sub` stays the contract identity. On this connector the email is a proof-of-knowledge gate for the two address objects. It does not filter the order and it does not set `userId`. |
| Schema | `schemas/order-status.json` already allows both addresses. This phase does not edit it. |

Accepting this plan accepts those defaults.

## 2. Recon, checked on 2026-10-06

API pin stays **2026-10**. Admin URL `https://{shop}.myshopify.com/admin/api/2026-10/graphql.json`. This phase does not bump the pin.

The working hypothesis was: the order read already used for status also carries `Order.email`, `shippingAddress`, and `billingAddress`, and those address objects use stable street, city, region, country-code, and postal-code fields on 2026-10. That holds, with the field names below. The connector pull request re-checks `Order.email`, `Order.shippingAddress`, `Order.billingAddress`, and the `MailingAddress` fields in section 3.3 on the pinned 2026-10 schema before the mapper freezes. A renamed or missing field is a fixture failure. The connector does not substitute `displayAddress`, the country name, `provinceCode`, or deprecated `countryCode`.

| Claim | Result |
| --- | --- |
| `Order.email` exists on Admin GraphQL 2026-10. | Holds. It is a nullable `String`. The page says “The email address associated with the customer for this order” and “Returns `null` if no email address was provided during checkout.” |
| `Order.shippingAddress` and `Order.billingAddress` exist on the same object. | Holds. Both are nullable `MailingAddress`. Shipping is “where the order will be delivered” and is null for digital orders or orders that do not require shipping. Billing is “the billing address associated with the payment method” and is null when checkout provided none. |
| The street, city, region, country code, and postal code are `address1`, `address2`, `city`, `province`, `countryCodeV2`, and `zip`. | Holds. `address1` is “the first line of the address.” `address2` is “the second line.” `city` is the city, district, village, or town. `province` is “the region of the address, such as the province, state, or district.” `countryCodeV2` is a `CountryCode`, “the two-letter code for the country of the address. For example, US.” `zip` is “the zip or postal code of the address.” |
| `country` or `countryCode` is the alpha-2 field to copy into FastBuyJSON `country`. | Does not hold. `country` is “the name of the country.” `countryCode` is deprecated. This phase reads `countryCodeV2`. |
| `provinceCode` is the region field to copy. | Does not hold for this map. `provinceCode` is an alphanumeric region code (example `ON`). FastBuyJSON `region` follows the checkout map in `SHOPIFY_PLAN.md` section 6, which uses `province`. This phase reads `province`. |
| `Order.displayAddress` is a safe stand-in for the two addresses. | Does not hold. It is one `MailingAddress` that prioritizes shipping over billing. This phase does not select it. |
| `Order.phone`, `MailingAddress.name`, `firstName`, `lastName`, and `phone` are required to return an address. | Does not hold. Those fields exist. This phase does not select them and does not return them. |
| Reading `Order.email` or `MailingAddress` needs an OAuth scope beyond `read_orders`. | Does not hold. The `Order` object accepts `read_orders` (one of several scopes, any one of which is enough). Address and email are protected customer **fields** declared in the Partner Dashboard. They are not extra scopes. `read_customers` is not required for `Order.email`. |
| A custom app can use protected-customer-data level 2 without App Store review. | Holds. The protected-customer-data page says level 2 for a custom app is **always available**. Public apps need review. The same page lists the fields a partner declares one by one: Name, Address, Email, and Phone. Address is “address line 1, address line 2, geolocation, and zip codes in both billing and shipping addresses.” |
| `schemas/order-status.json` already allows the address objects. | Holds. `shippingAddress` and `billingAddress` are optional. Each object requires `line1`, `city`, `country`, and `postalCode`. `line2` and `region` are optional. `country` is documented as an ISO 3166-1 alpha-2 code. This phase does not edit the schema. |

## 3. What changes in the connector

The order-status connector pull request still ships with both addresses omitted and with `email` absent from the selection set. This phase is the next connector pull request on that route. It edits the selection set, adds the gate, and maps addresses when the gate opens. Lookup, money, items, payment, shipment, status, errors, cache, and the **404** rule stay as in `SHOPIFY_ORDERS_PLAN.md`. The delivered-status map, when that pull request has merged, stays as in `SHOPIFY_DELIVERED_PLAN.md`. This phase does not change either map.

`GET` has no JSON body. OpenAPI `getOrderStatus` has no `email` parameter. This phase does not add one. The connector reads the query on the existing route. Callers that omit it keep today’s body.

### 3.1 Gate

The handler resolves the order first, with the lookup in `SHOPIFY_ORDERS_PLAN.md` section 4.2. `email` is not a lookup key. The handler does not add an `email:` filter on `orders`, and it does not call a second Admin query to fetch the address. Zero matches, more than one match, an id outside the `read_orders` window, and any token that phase rejects are still **404** `ORDER_NOT_FOUND`. The 404 body does not say whether `email` was present or would have matched.

After one order is in hand, the gate opens only when all of the following are true:

1. The query string carries the parameter `email` exactly once. The name is case-sensitive. `Email` does not count. Zero values, or two or more values, leave the gate closed. The handler does not pick one of several values.
2. The decoded value, after trim, passes the `format: email` check this repository already uses for a customer email (JSON Schema draft-07). That is the RFC email check for this phase. The connector does not add a second parser. A value that fails the check leaves the gate closed.
3. `Order.email` on that order is a non-null string that is non-empty after trim. Null or blank leaves the gate closed. The handler does not fall back to `Customer.email`, `Order.phone`, a note, or a metafield.
4. The trimmed query value and the trimmed `Order.email` are equal under Unicode default case conversion (`toLowerCase()` on both sides). The comparison is not locale-sensitive. It does not strip dots, strip a plus-tag, or rewrite IDNA or punycode.

Trim removes the leading and trailing characters that `String.prototype.trim` removes. The query value is the decoded value from `URLSearchParams` rules, so a `+` in the query is a space. A plus inside the local part is sent as `%2B`.

A closed gate returns **200** and the order body from the order-status plan, with `shippingAddress` and `billingAddress` omitted. It does not return **401** `INVALID_TOKEN` or **403**. A wrong email and a missing email use the same response shape. The body does not say which of the four checks failed.

Headers are not an email input. `Authorization: Bearer` stays ignored, as in `SHOPIFY_ORDERS_PLAN.md` section 4.6. A JWT whose `sub` is present does not open the gate. `docs/CONTRACT.md` still says identity for orders is the JWT `sub`. This connector does not apply that identity to the order route. The query email is a proof-of-knowledge check that decides whether the two address objects are copied onto the response. It does not select a user, it does not write `userId`, and it does not create a session.

### 3.2 Selection set

On the order node that the lookup already reads (`order(id:)` and the `orders(first: 2)` node), add:

```graphql
email
shippingAddress {
  address1
  address2
  city
  province
  countryCodeV2
  zip
}
billingAddress {
  address1
  address2
  city
  province
  countryCodeV2
  zip
}
```

The same fields are on both queries, so the name path and the legacy-id path can run the gate without a follow-up read.

Not selected: `phone` on `Order`; `customer`; `displayAddress`; `billingAddressMatchesShippingAddress`; `MailingAddress` `name`, `firstName`, `lastName`, `phone`, `company`, `latitude`, `longitude`, `formatted`, `formattedArea`, `id`, `country`, `countryCode`, and `provinceCode`; `CardPaymentDetails`; fulfillment `originAddress`; `FulfillmentEvent` address fields; `FulfillmentOrder.destination`. `SHOPIFY_DELIVERED_PLAN.md` still keeps event addresses and `originAddress` out of the delivered-status query. This phase does not pull those objects either.

The Admin payload then contains the email and the street address on every successful order read, including a closed gate, because the comparison and the mapping share one read. Section 3.4 says what may leave the process.

### 3.3 Address map

The map runs only when the gate is open. Shipping and billing are independent. A null Shopify object omits that FastBuyJSON key. `billingAddressMatchesShippingAddress` is not selected and is not a reason to copy one address onto the other.

| FastBuyJSON | Shopify `MailingAddress` | Rule |
| --- | --- | --- |
| `line1` | `address1` | Required. Trim. Blank omits the whole address object. |
| `line2` | `address2` | Optional. Omit the key when null or blank after trim. |
| `city` | `city` | Required. Trim. Blank omits the whole address object. |
| `region` | `province` | Optional. Omit the key when null or blank after trim. Do not copy `provinceCode`. |
| `country` | `countryCodeV2` | Required. The two-letter `CountryCode`. Do not copy `country` (the name) or deprecated `countryCode`. Missing omits the whole address object. |
| `postalCode` | `zip` | Required. Trim. Blank omits the whole address object. |

Required means the schema’s required set: `line1`, `city`, `country`, `postalCode`. If any one of those is missing, omit that entire object. A partial object would fail `schemas/order-status.json` and the order-status plan would turn that into **500** `INTERNAL_ERROR`. Omitting the object keeps the route on **200**.

`countryCodeV2` is copied through as the enum’s string (`US`, `DE`). The connector does not translate a country name into a code.

### 3.4 Body, errors, logs

`shippingAddress` and `billingAddress` are the only response fields this phase adds, and only when the gate is open and the mapped object survives section 3.3.

The body still omits `email`, `phone`, `name`, `firstName`, `lastName`, `company`, and `userId`. It still omits `lastFourDigits`, `brand`, and `externalPaymentId`. The selection set still does not read `CardPaymentDetails`. Payment `method` and `status` stay as in the order-status plan.

`order.id` still never contains `gid://`. `message` and `extensions` stay omitted. The email and the street address are not copied into `extensions`.

Errors stay as in `SHOPIFY_ORDERS_PLAN.md` section 4.5, with two redaction rows added:

| Condition | Response |
| --- | --- |
| GraphQL HTTP 200, order present, `errors` only redact `email` or an address field this phase selected | **200**. A redacted `email` closes the gate. A redacted required address field omits that address object. The rest of the order is returned. |
| The Order object itself is denied | **500** `INTERNAL_ERROR`, as in the order-status plan. |

A shop that has `read_orders` and has not declared Email or Address looks like a closed gate, not like a failed install. Missing `read_orders` is still the reinstall **500**.

Every response from this route, including both gate outcomes and errors, keeps `Cache-Control: no-store`. The body depends on the query string. This phase does not add a public cache and does not add a `Vary` header.

Logs for this route may include the HTTP status, whether the address gate opened, and the client order token under the order-status rules. They omit the query string, the query email, `Order.email`, every address field, phone, names, card numbers, last four, brand, Admin tokens, delegate tokens, and every `gid://` string. The connector does not write the email or either address to SQLite. Retention for those values is the lifetime of the request. The v1 compliance webhooks stay as they are. There is still no customer archive to export.

### 3.5 Partner Dashboard

Orders are protected customer data. This phase returns street addresses, so the app declares the fields it actually uses:

| Field | Declare | Why |
| --- | --- | --- |
| Protected customer data | Yes | The order read is customer data. The order-status phase already runs under that. |
| Address | Yes | `address1`, `address2`, `city`, `province`, and `zip` on shipping and billing. Coordinates are part of Shopify’s Address group. This phase does not select `latitude` or `longitude`. |
| Email | Yes | Compared to the query parameter. The HTTP body does not return it. |
| Name | No | Not selected. Not returned. |
| Phone | No | Not selected. Not returned. |

Distribution stays custom, as in `SHOPIFY_PLAN.md` section 8. Level 2 for that custom app is always available. This phase does not submit the app for App Store review. On a development store, the partner selects those fields in the Partner Dashboard. An install that already granted `read_orders` does not need a new authorization-code grant for this phase. It does need the field declaration. Until the declaration is in place, section 3.4’s redaction row applies.

### 3.6 Fixtures

The connector pull request adds these fixtures next to the order-status set. Each one is an Admin GraphQL payload, checked in, and validated against the vendored `schemas/order-status.json`. CI does not call Shopify.

| Fixture | Expect |
| --- | --- |
| Order resolved, no `email` query, payload has both addresses and `Order.email` | **200**. `shippingAddress` and `billingAddress` are absent. `lastFourDigits` and `brand` are absent. |
| `email` matches after trim and case fold (`Buyer@Example.com` against `buyer@example.com`, and a value with leading and trailing spaces) | **200**. Both addresses are present when section 3.3’s required fields are present. |
| `email` is a different address | **200**. Both address keys are absent. The street strings are absent from the body. |
| `email` is `not-an-email`, or the parameter is empty, or `email` is repeated | **200**. Both address keys are absent. The status is not **400**. |
| `Order.email` is null or blank, query email is well formed | **200**. Both address keys are absent. |
| Query `email=buyer%2Btag@example.com` and `Order.email` is `buyer+tag@example.com` | Gate opens when the address fields are complete. |
| Query `email=buyer+tag@example.com` (the `+` decodes as a space) | Gate stays closed. |
| Email sent only on a header, no query parameter | Gate stays closed. |
| Bearer token present, no query email | **200**, same address-free body as the anonymous call. `userId` is absent. |
| Bearer token present, query email matches | Addresses follow section 3.3. `userId` is absent. The body contains no email. |
| Unknown id, with a well formed `email` | **404** `ORDER_NOT_FOUND`. No address object. Detail does not mention the email. |
| Gate open, shipping `address1` / `city` / `countryCodeV2` / `zip` set, `address2` and `province` set | `line1`, `line2`, `city`, `region`, `country`, `postalCode` mapped as in section 3.3. |
| Gate open, `address2` null, `province` null, required fields set | Address object present. `line2` and `region` absent. |
| Gate open, `zip` null, or `countryCodeV2` null, other street fields set | That whole address object is absent. |
| Gate open, `shippingAddress` null, billing complete | `shippingAddress` absent. `billingAddress` present. |
| Gate open, shipping missing `city`, billing complete | `shippingAddress` absent. `billingAddress` present. |
| Gate open, payload also has a card number, `paymentMethodName`, `Order.phone`, and a customer name, and the query does not ask for those fields | `lastFourDigits`, `brand`, `phone`, `email`, and name fields are absent. |
| Selection-set fixture | The order selection includes `email` and the six `MailingAddress` fields in section 3.2 on both `shippingAddress` and `billingAddress`. It does not include `phone`, `customer`, `displayAddress`, `name`, `firstName`, `lastName`, `company`, `latitude`, `longitude`, `country`, `countryCode`, `provinceCode`, or `CardPaymentDetails`. |
| Both gate outcomes | `Cache-Control: no-store`. Logged lines contain no email, no street line, and no `gid://`. |

The order-status fixture “payload includes a shipping address and a billing address, and the selection set does not ask for them” changes here. The body still omits both keys when the gate is closed. The selection set does ask for the fields in section 3.2. The card-fragment fixture stays: `lastFourDigits` and `brand` are absent on every response, including an open gate.

## 4. What this phase cannot do

- Answer **401** or **403** when `email` is missing or wrong.
- Look up an order by email, or add an `email:` filter on the `orders` connection.
- Read the email from a request body or from a header.
- Treat JWT `sub`, or any Bearer token, as the address gate.
- Return `email`, `phone`, `name`, `firstName`, `lastName`, or `company`.
- Return `lastFourDigits` or `brand`, or select `CardPaymentDetails`.
- Select `customer`, `displayAddress`, coordinates, fulfillment event addresses, `originAddress`, or `FulfillmentOrder.destination`.
- Copy billing from shipping, or the reverse, when one object is null.
- Fall back to `Customer.email` when `Order.email` is null.
- Fold Gmail dots, plus-tags, or IDNA forms into one address.
- Add `read_all_orders`, `read_customers`, `write_orders`, or any scope beyond the order-status list.
- Subscribe to order or customer webhooks. The v1 compliance webhooks stay as they are.
- Call Customer Account API, or log a buyer into Shopify Customer Accounts.
- Call Checkout MCP or register a UCP agent.
- Bump `SHOPIFY_API_VERSION` off `2026-10`.
- Redesign rate limits. Shopify **429** still maps as in the order-status plan.
- Edit `schemas/`, `openapi/`, the reference servers, the TypeScript SDK, or the MCP server.
- Store the email or either address in SQLite, logs, or `extensions`.
- Change the status map, including `delivered`.

## 5. Phased pull requests

| PR | Where | Ships |
| --- | --- | --- |
| 1. This plan | This repository | `docs/SHOPIFY_EMAIL_ORDER_PLAN.md`, plus the pointers in `SHOPIFY_PLAN.md` section 9 and `SHOPIFY_ORDERS_PLAN.md`. No schema, OpenAPI, SDK, MCP, or connector change. |
| 2. Address gate | `millers-dev/fast-buy-json-shopify` | After the order-status connector pull request. Add section 3.2 to the order selection, apply the gate, and map addresses. Fixtures from section 3.6. |

PR 2 merges on its own. It vendors schemas from this repository. It does not edit them. It does not wait on the delivered-status pull request. If that pull request is already merged, PR 2 leaves the status function alone. Runtime stays Node.js 18+, TypeScript, global `fetch`, `node:test`, API `2026-10`.

The Partner Dashboard declaration in section 3.5 is an app setting. It is not a commit in either repository.

This repository needs no further code change for PR 2. `getOrderStatus` stays on the SDK and on the reference MCP server with an order id and no email argument. A client that wants the address objects sends `?email=` on the HTTP request. The reference MCP tool keeps calling `GET /orders/{orderId}` without that parameter, so it keeps receiving the address-free body.

## 6. Risks

**The gate is also an email check against a known order id.** The order-status plan already returns status, items, totals, and tracking to any caller who knows an accepted id. This phase adds a visible difference: addresses appear only when the query matches `Order.email`. A caller can try addresses against `1001` and learn which one matches. Rate limits stay as they are. A shared secret on the order URL, or a login, is a later plan.

**Proof of knowledge is not a buyer login.** The email is often on the receipt and in the shop’s own mail. Matching it does not bind the caller to JWT `sub`, does not set `userId`, and does not replace `docs/CONTRACT.md`. Anonymous callers remain allowed. Bearer remains ignored.

**Guessable ids remain for everything except the two address objects.** `1001` and `1002` still return the address-free body inside the `read_orders` window. Customer Accounts stay out of this phase.

**Some orders have no email.** Point of sale and some checkouts leave `Order.email` null. The gate stays closed, including when a customer record would have had an email. This phase does not read `customer`.

**Case folding is the only normalization.** `Buyer@Example.com` matches. `buyer+tag@example.com` does not match `buyer@example.com`. Dotted and undotted Gmail forms do not match. A buyer who types a canonical address and fails the gate still receives **200** without addresses, so the failure looks like a wrong email.

**`+` in the query string.** Under `URLSearchParams` rules, `+` decodes as a space. Plus-addressing has to be `%2B`. A client that copies the address into the query without encoding will fail the format check and see the address-free body.

**Redaction looks like a closed gate.** If the Partner Dashboard step is skipped, Shopify returns null for `email` or for address fields and an `errors` entry. The route stays **200** and omits addresses. The install **500** is reserved for a missing `read_orders` grant or a token that cannot be refreshed.

**The Admin payload is wider than the HTTP body.** Every successful order read now includes the email and the street lines, including when the response omits them. They must not be logged or written to SQLite. A reverse proxy that records request URLs will store the buyer email, because the value sits in the query string. Connector logs omit the query string.

**Caches that ignore the query string.** `Cache-Control` stays `no-store`. A cache that keys only on the path would attach one caller’s addresses to another caller’s later GET. This phase does not add a second cache header.

**Country code versus country name.** `country` on `MailingAddress` is a name. The FastBuyJSON field is an alpha-2 code. Copying the name would put `Germany` in `country`. A null `countryCodeV2` omits the whole object even when the street, city, and zip are present.

**Partial objects become 500 if they are emitted.** The omit-whole-object rule is what keeps a missing zip on **200**. A later edit that returns a partial address reintroduces that **500**.

**API calendar.** `SHOPIFY_PLAN.md` records that 2026-10 falls out of support on 2026-10-16. This phase does not bump the pin. A later pull request bumps it while a version is still supported, and re-checks `Order.email` and the `MailingAddress` fields on that pin. If a field is gone, addresses stay omitted until a plan names the replacement. The connector does not invent one during the bump.

**A public listing is a different approval.** Level 2 is always available for this custom app. Listing the app later requires protected-customer-data review for Address and Email. This phase does not list the app.

**Agent transcripts.** A client that records the request URL records the email. The response body still omits it. The reference MCP server does not send the parameter.

## 7. Defaults this plan accepts

No open product question blocks the connector pull request. Merging this plan accepts the following. A review comment that names the row is enough to change it. These rows are the 2026-10-06 defaults.

| # | Default |
| --- | --- |
| E1 | The only email input is one query parameter named `email` on `GET /orders/{orderId}`. No body. No email header. |
| E2 | Compare the trimmed query value to trimmed `Order.email` from the same order read, with Unicode default case conversion. No dot folding, no plus-tag folding, no IDNA rewrite. Null or blank `Order.email` fails the gate. The format check is JSON Schema draft-07 `format: email`. |
| E3 | A missing parameter, a repeated parameter, a value that fails the format check, or a value that does not match returns **200** without `shippingAddress` and without `billingAddress`. The route does not use **401** or **403**. An unknown order id is still **404** `ORDER_NOT_FOUND`. |
| E4 | On an open gate, map shipping and billing independently. Missing `line1`, `city`, `country`, or `postalCode` omits that whole object. `line2` and `region` are optional keys. |
| E5 | The Shopify fields are `address1`, `address2`, `city`, `province`, `countryCodeV2`, and `zip`. `provinceCode`, the country name, deprecated `countryCode`, and `displayAddress` are not read. |
| E6 | `lastFourDigits` and `brand` stay omitted. `CardPaymentDetails` stays unselected. |
| E7 | The body does not include email, phone, or name. `userId` stays omitted. JWT `sub` is unchanged. Bearer stays ignored. The email is a proof-of-knowledge gate for the address objects on this connector. |
| E8 | The scope stays `read_orders`. The Partner Dashboard declares Address and Email. Name and Phone are not declared. Custom app protected-customer-data level 2. No new OAuth grant. |
| E9 | No webhooks, no `read_all_orders`, no Customer Accounts, no UCP, no pin change, no rate-limit redesign, no schema edit, and no SQLite copy of the email or the address. |
| E10 | One connector pull request, after the order-status connector pull request, carries the selection change, the gate, the map, and the fixtures. It does not depend on the delivered-status pull request. |

## 8. Sources

FastBuyJSON, this repository, release 1.0.0:

- `docs/SHOPIFY_ORDERS_PLAN.md` — order route, lookup, the address-free body, `read_orders`, anonymous access, and the **404** / **500** / **429** rows this phase keeps.
- `docs/SHOPIFY_DELIVERED_PLAN.md` — delivered status. This phase does not change that map and does not select fulfillment addresses.
- `docs/SHOPIFY_PLAN.md` — v1 sequence, `region` → `province` on the way into Shopify, custom distribution, and the pointer in section 9.
- `docs/CONTRACT.md` — order identity is the JWT `sub`. Optional Bearer on commerce routes. `ORDER_NOT_FOUND`. `format: email` is one of the format assertions the reference servers apply.
- `schemas/order-status.json` — optional `shippingAddress` and `billingAddress`. Required keys `line1`, `city`, `country`, `postalCode`. This phase does not edit the schema.
- OpenAPI operation `getOrderStatus` — path parameter `orderId`, no `email` query parameter, `Cache-Control: no-store` on the 200 response. This phase does not edit the document.
- `sdk/typescript/src/client.ts` and `mcp-server/src/adapter.ts` — `getOrderStatus(orderId)` with no email argument.

Shopify, read 2026-10-06. The connector still pins API `2026-10`.

- `Order`, including `email`, `phone`, `shippingAddress`, `billingAddress`, `displayAddress`, and the `read_orders` scope: <https://shopify.dev/docs/api/admin-graphql/2026-10/objects/Order>
- `MailingAddress`, including `address1`, `address2`, `city`, `province`, `provinceCode`, `country`, `countryCodeV2`, deprecated `countryCode`, `zip`, `name`, `firstName`, `lastName`, `phone`, `latitude`, and `longitude`: <https://shopify.dev/docs/api/admin-graphql/2026-10/objects/MailingAddress>
- Protected customer data (custom app level 2 always available; Name, Address, Email, and Phone declared separately): <https://shopify.dev/docs/apps/launch/protected-customer-data>
- Order access scopes, including the `read_orders` window: <https://shopify.dev/docs/api/usage/access-scopes>
- API versioning (2026-10): <https://shopify.dev/docs/api/usage/versioning>
