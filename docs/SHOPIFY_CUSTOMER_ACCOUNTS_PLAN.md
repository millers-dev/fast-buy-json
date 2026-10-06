# Shopify customer accounts plan

Status: proposed. English only. This file is the implementation plan for logging a buyer into the Shopify connector with Customer Accounts, and for requiring that login on `GET /api/fastbuyjson/orders/{orderId}`. It is documentation. Accepting it does not change the HTTP contract’s schemas, the OpenAPI document, the reference servers, the TypeScript SDK, the MCP server, or the connector runtime.

Checked against this repository at **1.0.0** (`docs/CONTRACT.md`, `schemas/order-status.json`, OpenAPI `getOrderStatus`) and against Shopify’s public docs on **2026-10-06**. Sources are listed at the end. The order route, the lookup, and the status map stay in [`SHOPIFY_ORDERS_PLAN.md`](SHOPIFY_ORDERS_PLAN.md). Mapping `delivered` stays in [`SHOPIFY_DELIVERED_PLAN.md`](SHOPIFY_DELIVERED_PLAN.md). The email address gate stays in [`SHOPIFY_EMAIL_ORDER_PLAN.md`](SHOPIFY_EMAIL_ORDER_PLAN.md) until the final pull request of this plan removes it. The v1 sequence stays in [`SHOPIFY_PLAN.md`](SHOPIFY_PLAN.md).

The defaults in section 1 were accepted on **2026-10-06** by Tomasz. Section 11 lists them again so a review comment can overturn one without reopening the rest.

## 1. Decision

| Topic | Default |
| --- | --- |
| Where the code lands | `millers-dev/fast-buy-json-shopify`, after the address-gate connector pull request in `SHOPIFY_EMAIL_ORDER_PLAN.md` section 5. This repository keeps the contract. |
| Approach | **A2.** Customer Account API for identity and ownership. Admin GraphQL for the order body. Reuse the status map, the delivered map, and the address map. |
| Shopify client | The app’s own `[customer_authentication]` client. Public PKCE. The token response has no refresh token. When the customer access token expires, the buyer logs in again. |
| Route | The same `GET /api/fastbuyjson/orders/{orderId}`. No list route. No new contract route. |
| End state | Anonymous `GET /orders/{orderId}` returns **401** `AUTHENTICATION_REQUIRED`. There is no anonymous status-only body. |
| Another customer’s order | **404** `ORDER_NOT_FOUND`, the same problem body as an unknown id. |
| JWT `sub` | `base64url(HMAC-SHA256(connectorSecret, customerGid))`. `connectorSecret` is `SHOPIFY_CUSTOMER_SUB_SECRET`. |
| Agent handoff | Device-style. The connector returns `loginUrl` and a poll token. The buyer finishes Shopify login in a browser. The agent polls until the connector returns the JWT. |
| Addresses | When customer mode is the default, map `shippingAddress` and `billingAddress` for the owner. That same pull request removes `SHOPIFY_ORDER_ADDRESS_GATE` and `?email=`. |
| Cart and checkout | Stay anonymous. One anonymous cart per process. Out of scope. |
| Schema | `schemas/order-status.json` already allows the address objects. This plan does not edit it. |

Accepting this plan accepts those defaults.

## 2. Problem

`SHOPIFY_ORDERS_PLAN.md` leaves `GET /orders/{orderId}` anonymous. A caller who can reach the process and try names inside the `read_orders` window (`1001`, `1002`, and the rest) receives status, items, totals, and tracking. `SHOPIFY_EMAIL_ORDER_PLAN.md` can add the two street addresses when `SHOPIFY_ORDER_ADDRESS_GATE` is on and `?email=` matches `Order.email`. That match is proof of knowledge. The address is often on the receipt and in the shop’s mail. With the flag on, a known email walked across the same names returns home and billing addresses. The flag defaults to off because of that walk, which also means the route still has no buyer.

`docs/CONTRACT.md` already says order identity is the JWT `sub`. This connector does not apply that identity today. Bearer on the order route is ignored. Customer Accounts are how this connector grows a buyer, proves the order is theirs, and then returns the body the existing mappers already know how to build.

## 3. Goal and non-goals

**Goal.** A buyer logs in through the app’s Customer Account API client. The connector issues a FastBuyJSON JWT. `GET /orders/{orderId}` requires that JWT, checks that the order is in that customer’s `orders` connection, and returns the Admin order mapped by the order-status, delivered, and address plans. An agent receives the JWT from a login URL plus a poll, because the reference MCP server has no browser.

**Non-goals.**

- Cart, catalog, discount, shipping options, and checkout stay the anonymous v1 surface. A Bearer token on those routes stays ignored. Idempotency identity on cart and checkout stays `anonymous`.
- No `GET /orders` list. No cancel, refund, or capture.
- No `read_all_orders`. No order or customer webhooks beyond the v1 compliance topics. No UCP. No Checkout MCP. No API pin change.
- No edit to `schemas/`, `openapi/`, the reference servers, the TypeScript SDK, or the MCP server.
- No refresh token, no `POST /auth/refresh` on the connector, and no `prompt=none` renewal.
- No Multipass, no Storefront `customerAccessTokenCreate`, and no headless or Hydrogen customer-account client.
- The body still omits email, phone, name, `lastFourDigits`, and `brand`.
- The reference MCP tool `getOrderStatus` stays a bare `GET /orders/{orderId}`. After the final pull request that call receives **401**. A later plan can add a login tool. This one does not.

## 4. Identity model

The contract identity is the JWT `sub`. On this connector that string is:

`base64url(HMAC-SHA256(connectorSecret, customerGid))`

| Piece | Rule |
| --- | --- |
| `customerGid` | `Customer.id` from Customer Account API `customer { id }`. The connector accepts only a string matching `gid://shopify/Customer/` plus digits. Any other value fails the login. No JWT is issued. |
| `connectorSecret` | Environment variable `SHOPIFY_CUSTOMER_SUB_SECRET`, UTF-8. The operator sets it. It is not `SHOPIFY_CLIENT_SECRET`, not `TOKEN_ENCRYPTION_KEY`, and not `JWT_SECRET`. |
| HMAC | SHA-256, raw 32-byte digest. Node `crypto.createHmac('sha256', secret).update(customerGid, 'utf8').digest('base64url')`. |
| `base64url` | The Node `base64url` digest. Unpadded. `+` and `/` do not appear. |
| Stability | The same GID and the same secret always produce the same `sub`. The GID is not stored. A later `customers/redact` rebuilds the GID from the webhook and recomputes the HMAC to find the row. |
| JWT | Signed with `JWT_SECRET`. Claims are `sub`, `iat`, and `exp`. No GID, email, Shopify access token, `id_token`, username, or roles. |
| Lifetime | `exp` is `min(3600 seconds, expires_in from the customer token response)`, measured from the moment the JWT is signed. A missing or non-positive `expires_in` fails the login. |
| Body | `userId` stays omitted. `schemas/order-status.json` has no `userId`. The order body never contains `gid://`. |

A missing `SHOPIFY_CUSTOMER_SUB_SECRET` or `JWT_SECRET` fails login completion with **500** `INTERNAL_ERROR`. The body has no secret and no GID. While customer mode is on, the order route returns that same **500** when either secret is missing, rather than an anonymous order.

Rotating `SHOPIFY_CUSTOMER_SUB_SECRET` changes every future `sub`. Existing JWTs stay valid until `exp` if `JWT_SECRET` is unchanged, and their `sub` will not match a new login for the same customer. This plan does not migrate sessions. The buyer logs in again after the old JWT expires. Rotating `JWT_SECRET` invalidates outstanding JWTs immediately.

The HMAC is not reversible from `sub`. Logs, the HTTP body, and `extensions` do not contain the GID or the secret.

## 5. Approaches

Four ways to attach a buyer to the order route were on the table. **A2** is the one section 1 accepts.

### A. Customer Account API for the whole body

One token, one API. `customer.orders` is already limited to the logged-in customer, so ownership comes from the API. The FastBuyJSON body would be mapped from that API’s `Order`.

That `Order` is not the Admin `Order` the three mappers read. Section 6, R5, records the field gaps: money is `MoneyV2` rather than `MoneyBag.shopMoney`, fulfillment has no `deliveredAt`, and the address type uses `countryCode` rather than `countryCodeV2`. A Customer Account API mapper would be a second implementation of status, delivered, and address. This approach is rejected.

### B. Admin GraphQL only

Keep the mappers. After some login, filter Admin `orders` with `customer_id:`. Admin `read_orders` still returns every order in the window. The filter is application code on a token that can see the shop. A missed predicate returns another customer’s order. Admin does not authenticate the buyer, so this approach still needs a buyer login and then trusts the connector to enforce it. It is rejected as the ownership mechanism.

### C. Storefront customer token, or Multipass

Storefront `customerAccessTokenCreate` belongs to classic customer accounts. New customer accounts use the Customer Account API. Multipass is a Plus shared secret that signs a buyer in without that API. Neither is the app’s `[customer_authentication]` client, and neither is the `customer.orders` connection this plan uses for ownership. This approach is rejected.

### A2. Hybrid

Customer Account API does two jobs: identify the buyer (`customer { id }`) and decide ownership (`customer.orders`, exactly one node). Admin GraphQL does the third: load that order by the GID the ownership query returned, and run the existing mappers. The Admin read does not run until ownership has produced exactly one order. The customer access token is never sent to the agent.

## 6. Recon, checked on 2026-10-06

API pin stays **2026-10**. Admin URL `https://{shop}.myshopify.com/admin/api/2026-10/graphql.json`. Customer Account API URL is the discovered `graphql_api` with the version set to `2026-10` (`https://{shop-domain}/customer/api/2026-10/graphql`). Discovery may return a vanity host. The connector keeps that host and does not rewrite it to `myshopify.com`. This phase does not bump the pin.

The working hypothesis was: the app’s `[customer_authentication]` client can log a buyer in with PKCE and no refresh token, `customer.orders` can prove ownership, and the Admin order read can keep the mappers already written. That holds, with the limits in R2, R4, and R5. The connector pull request re-checks the discovery documents, the authorize scope string, `Customer.id`, and the `customer.orders` filter keys on the pinned 2026-10 schema before the client freezes. A renamed field is a fixture failure.

| ID | Claim | Result |
| --- | --- | --- |
| R1 | The shop publishes OpenID and Customer Account API discovery documents. | Holds. `GET https://{shop}/.well-known/openid-configuration` returns `authorization_endpoint`, `token_endpoint`, `end_session_endpoint`, `jwks_uri`, and `issuer`. `GET https://{shop}/.well-known/customer-account-api` returns `graphql_api` and `mcp_api`. `graphql_api` already includes a version. The docs say a specific version is built from that URL, for example `https://{shop-domain}/customer/api/2026-10/graphql`. |
| R2 | The app’s `[customer_authentication]` client is a public PKCE client and receives a refresh token. | The PKCE half holds. The refresh-token half does not. The app configuration page says an app that authenticates with its own client id through `[customer_authentication]` is a public client, uses PKCE, and does not receive a refresh token. The token response has `access_token`, `expires_in`, and `id_token`, and no `refresh_token`. `grant_type=refresh_token` returns **400** `unsupported_grant_type`. A customer-account client configured on the shop, such as a headless or Hydrogen storefront, does receive a refresh token. This plan does not create one. `grant_types_supported` on the OpenID document describes the authorization server, so it still lists `refresh_token`. `prompt=none` repeats the code flow without a login screen only while a Shopify session exists, and only as a top-level navigation. The authorization endpoint cannot be loaded in an iframe. |
| R3 | Buyer order reads use Admin `read_customers`. | Does not hold. Customer access scopes are a separate group. `customer_read_orders` grants Customer Account API `Order`. `customer_read_customers` grants Customer Account API `Customer`. Both are declared in the same `[access_scopes]` list as `read_orders`. The Customer Account API authentication examples also send the authorize scope `openid email customer-account-api:full`. Admin `read_orders` stays the scope for the order body. Admin `read_customers` is not added. |
| R4 | `order(id:)` on the Customer Account API is the ownership check. | Does not hold. `customer` returns the logged-in customer. `customer.orders` is that customer’s orders, and its filters include `name`, `confirmation_number`, and `id`. The `order` query is documented against the authentication-state labels `customer_read_unauthenticated`, `customer_read_pre_authenticated`, and `customer_read_payment_instrument_authenticated`. The access-scopes page says those labels record an authentication state, are not scopes the app requests, and points at the order status page. That page serves an unauthenticated link and a pre-authenticated notification link for one order without a customer login. This plan does not call `order(id:)` and does not use pre-authenticated order status. |
| R5 | Customer Account API `Order` can drive the existing status, delivered, and address mappers. | Does not hold. `financialStatus` uses `OrderFinancialStatus` (`PENDING`, `AUTHORIZED`, `PAID`, `PARTIALLY_PAID`, `PARTIALLY_REFUNDED`, `REFUNDED`, `EXPIRED`, `VOIDED`) on a field named `financialStatus`, not Admin `displayFinancialStatus`. `fulfillmentStatus` uses `OrderFulfillmentStatus`, which has no `REQUEST_DECLINED` and no `FULFILLMENT_NOT_REQUIRED`. Totals are `MoneyV2` (`subtotal`, `totalPrice`, `totalTax`, `totalShipping`), not `MoneyBag.shopMoney` and not the `current*` fallback pairs. `fulfillments` is a connection. Customer Account API `Fulfillment` has `latestShipmentStatus`, `trackingInformation`, and `estimatedDeliveryAt`. It has no `deliveredAt`. Addresses are `CustomerAddress`: `countryCode` and `zoneCode`, not Admin `MailingAddress.countryCodeV2`. The delivered plan’s signal and the address plan’s country field are on the Admin objects. |
| R6 | Admin `read_orders` returns only the buyer’s orders. | Does not hold. `read_orders` covers the shop’s orders in the default window of about 60 days. An order outside that window is null. `read_all_orders` stays off. The connector treats an Admin null, after a passed ownership check, as **404** `ORDER_NOT_FOUND`. |
| R7 | Returning street addresses still depends on the Partner Dashboard Address declaration. | Holds. The body is the Admin order. Protected customer data is separate from Customer Account API scopes. Level 2 for this custom app stays always available. Address is declared because the final phase selects `shippingAddress` and `billingAddress`. Name and Phone are not declared. The OIDC scope `email` may appear on the authorize request. The connector checks `nonce` on the `id_token` and then discards the token. It does not select `Order.email`, it does not read an email claim into the JWT, and it does not declare the Partner Dashboard Email field for a response that does not return email. |

## 7. What changes in the connector

Customer mode is the end state in section 1. Pull requests 2 through 4 keep it behind `SHOPIFY_CUSTOMER_ACCOUNTS` so the anonymous order route, and the address gate, stay available until the final pull request. The flag is on only when the trimmed value is `1` or `true`, compared case-insensitively. Unset, empty, `0`, `false`, and any other value are off.

When the flag is off, `GET /orders/{orderId}` behaves as the order-status plan plus the address gate if that pull request has merged. Bearer is ignored. `/detect` does not list `auth`. Sections 7.4 through 7.6 do not run. The login routes in section 7.2 may exist so the fixtures can exercise them. They are not advertised.

When the flag is on, sections 7.2 through 7.6 apply. `?email=` is ignored. `SHOPIFY_ORDER_ADDRESS_GATE` is not consulted. Pull request 4 is what adds the address objects while the flag is on. Pull request 3 still returns the address-free body to the owner.

Pull request 5 deletes the flag and deletes the address gate. The flag-on behavior, including addresses, is the only behavior.

### 7.1 Discovery and the app client

`[customer_authentication]` on the app sets `redirect_uris` to the connector callback:

`${APP_URL}/api/fastbuyjson/auth/customer/callback`

`APP_URL` is an HTTPS origin, the same requirement `SHOPIFY_PLAN.md` already puts on the merchant install callback. The Customer Account API redirect URI has to match that entry. A missing `APP_URL`, or an `APP_URL` that is not HTTPS, makes `POST /auth/customer/start` return **500** `INTERNAL_ERROR`. The client-credentials Admin token does not complete this browser step.

`[access_scopes]` gains `customer_read_orders` and `customer_read_customers`. It keeps `read_orders` and the four `unauthenticated_*` scopes. It does not gain `read_customers`, `write_customers`, `customer_write_orders`, `customer_write_customers`, or `read_all_orders`.

An install that already granted the earlier scopes does not gain the two customer scopes by itself. The merchant install goes through the authorization code grant again. Until that grant exists, a customer-mode order read returns the reinstall **500** in section 7.6. Catalog, cart, and checkout keep working.

The authorize request uses the discovered `authorization_endpoint` and the scope string `openid email customer-account-api:full`. The connector pull request re-checks that string. The token request is `application/x-www-form-urlencoded` to the discovered `token_endpoint`, with `grant_type=authorization_code`, `client_id`, `redirect_uri`, `code`, and `code_verifier`. No `Authorization: Basic` header. The Customer Account API GraphQL call sends `Authorization` set to the customer access token itself. The 2026-10 authentication page shows that header as the token, not as `Bearer <token>`. The connector pull request re-checks the header before the client freezes.

`code_verifier` is a high-entropy string of 43 to 128 unreserved characters from a CSPRNG. `code_challenge` is unpadded base64url of SHA-256 over the verifier’s ASCII bytes. `code_challenge_method` is `S256`. `state` and `nonce` are separate CSPRNG values stored on the poll row.

### 7.2 Device-style handoff

These routes are connector routes. They are not in `openapi/fastbuyjson.yaml`. `POST /auth/login` on the reference servers stays username and password. The connector does not implement that body.

| Step | Call | Result |
| --- | --- | --- |
| 1 | `POST /auth/customer/start` | Creates a poll row. Returns `loginUrl`, `pollToken`, and `expiresAt`. `loginUrl` is the connector URL in the next row. |
| 2 | Browser `GET /auth/customer/login/{pollToken}` | **302** to the discovered authorization endpoint with `client_id`, `response_type=code`, `redirect_uri`, `scope`, `state`, `nonce`, `code_challenge`, and `code_challenge_method=S256`. |
| 3 | Shopify redirects to the callback | The connector checks `state`, exchanges the code, checks `nonce` inside `id_token`, reads `customer { id }`, computes `sub`, stores the customer access token, and signs the JWT. |
| 4 | `GET /auth/customer/poll/{pollToken}` | Pending: **200** `{ "status": "pending" }`. Complete, first read: **200** `{ "status": "complete", "access_token", "token_type": "bearer", "expires_in" }`. The access token is the FastBuyJSON JWT. There is no `refresh_token`. |

The poll row lives **10 minutes**. `expiresAt` on the start response is that deadline. The connector does not hold the poll request open. An unknown poll token, an expired poll, a `state` mismatch, a `nonce` mismatch, a token response that fails, or a `Customer.id` that fails section 4, stores no session. The poll then answers **401** `INVALID_TOKEN`. A second poll after a successful handoff answers **401** `INVALID_TOKEN`. The JWT was returned once.

The start response and the poll response send `Cache-Control: no-store`. The login redirect and the callback do too. The callback’s HTML page does not contain the JWT, the customer access token, or the GID. The buyer can close it. The agent already has the poll.

The connector discards `id_token` after the nonce check. It discards `refresh_token` if one appears. It does not call `grant_type=refresh_token`. It does not send `prompt=none`. It does not call `end_session_endpoint`. When the stored customer access token is past `expires_in`, the session row is unusable and the buyer starts at step 1 again.

SQLite, encrypted with `TOKEN_ENCRYPTION_KEY`, gains two kinds of row. The poll row holds the poll-token hash, `state`, `nonce`, `code_verifier`, and expiry. The session row holds `sub`, the customer access token, and that token’s expiry. It does not hold the GID, the email, the `id_token`, or a refresh token. The poll token and `state` are stored as SHA-256 hashes. The raw poll token is returned once, at start.

`customers/redact` recomputes `sub` from the webhook’s customer id and deletes that session row. `customers/data_request` deletes the same way and exports nothing. `shop/redact` deletes every session row with the shop row. The v1 compliance topics stay as they are. This phase adds no subscription.

### 7.3 Order auth

This section runs only when customer mode is on.

| Request | Response |
| --- | --- |
| No `Authorization` header | **401** `AUTHENTICATION_REQUIRED` (`https://fastbuyjson.org/problems/authentication-required`). `WWW-Authenticate: Bearer`. |
| Bearer present, JWT missing, malformed, expired, or signed with the wrong secret | **401** `INVALID_TOKEN`. `WWW-Authenticate: Bearer`. |
| JWT valid, and the session row’s customer access token is missing or past its expiry | **401** `INVALID_TOKEN`. The buyer logs in again. |
| JWT valid, ownership fails or the order is unknown | **404** `ORDER_NOT_FOUND`. |
| JWT valid, exactly one owned order, Admin returns that order | **200** and the mapped body. |

The **401** body does not include a GID, a shop token, or a hint about whether the order exists. The **404** body matches the order-status plan: it does not say whether the id was unknown, outside the window, ambiguous, or another customer’s.

### 7.4 Ownership

The handler does not call Admin until this section returns exactly one order GID.

The client `orderId` uses the same accepted tokens as `SHOPIFY_ORDERS_PLAN.md` section 4.2. Anything else is **404** `ORDER_NOT_FOUND`. The token is not interpolated into the GraphQL document. It is passed only as a quoted search string on `customer.orders`.

The query is `customer { id orders(first: 2, query: "…") { nodes { id name } } }`, with the customer access token.

| Client `orderId` | Search string |
| --- | --- |
| `gid://shopify/Order/<digits>` | `id:<digits>`. The node `id` must equal that GID. |
| Digits, or digits with one leading `#` | `name:#<digits>` first. One node wins. More than one is **404**. Zero nodes, then `id:<digits>`. One node wins. |
| Any other accepted token | `name:"<value>" OR name:"#<value>" OR confirmation_number:"<value>"`. |

Zero nodes, or more than one node, is **404** `ORDER_NOT_FOUND`. The handler does not then search Admin for a different order. Exactly one node is the owned order. Its `id` is the GID passed to Admin `order(id:)`.

`customer { id }` on this read must be present. The session’s `sub` must equal the HMAC of that id. A mismatch is **401** `INVALID_TOKEN` and the session row is deleted. That catches a token swapped under a `sub`.

### 7.5 Admin body

Admin `order(id:)` loads the GID from section 7.4. Null is **404** `ORDER_NOT_FOUND`, including an order outside the `read_orders` window. The selection set is the order-status selection, plus `deliveredAt` when the delivered plan has merged.

From pull request 4 onward, while customer mode is on, the selection also adds the address fields from `SHOPIFY_EMAIL_ORDER_PLAN.md` section 3.2, without `email`:

```graphql
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

The map is that plan’s section 3.3, including the `ZZ` rule. Shipping and billing stay independent. The gate in that plan’s section 3.1 does not run. `Order.email` is not selected and is not compared.

Status follows `SHOPIFY_ORDERS_PLAN.md` section 4.3, then `SHOPIFY_DELIVERED_PLAN.md` when that map is present. Money, line items, payment, and shipment stay as in the order-status plan. `lastFourDigits`, `brand`, and `CardPaymentDetails` stay unselected. `order.id` follows the order-status rule and never contains `gid://`.

`message`, `extensions`, email, phone, and name stay omitted.

### 7.6 Errors, cache, logs

| Condition | Response |
| --- | --- |
| Customer Account API HTTP **401**, or an expired customer access token | **401** `INVALID_TOKEN`. |
| Customer scopes missing, or the Admin token cannot be refreshed | **500** `INTERNAL_ERROR`. `detail` says the shop must be reinstalled. The body has no token and no GID. |
| Shopify **429** or a documented throttle on either API | **429** `RATE_LIMITED`. One backoff using Shopify’s guidance, then the problem response. No retry loop. |
| GraphQL HTTP 200 with `errors` that deny the order, or an ownership query that errors | **500** `INTERNAL_ERROR`. No partial order. |
| Address-field redaction, once addresses are selected | The email plan’s section 3.4 redaction row, without the `email` path. A redacted address object is omitted. The status stays **200**. |
| The mapped body fails `schemas/order-status.json` | **500** `INTERNAL_ERROR`. The invalid body is not sent. |

Every response from the order route, the start route, the poll route, the login redirect, and the callback sends `Cache-Control: no-store`. `/detect` stays `Cache-Control: public, max-age=300`.

Logs may include the HTTP status, whether customer mode is on, and the client order token when that token is not a GID. A GID lookup is logged as a gid lookup without the GID. Logs omit the query string, authorization codes, `code_verifier`, `state`, `nonce`, poll tokens, JWTs, customer access tokens, Admin tokens, the HMAC secret, email, phone, names, addresses, card data, and every `gid://` string.

### 7.7 Discovery document

When the flag is off, `/detect` stays as the order-status plan left it: `authentication.methods` is `anonymous`, and `endpoints` has no `auth`.

When the flag is on, `endpoints` includes `auth` next to the groups already advertised. `authentication.methods` includes `anonymous` and `jwt`. `authentication.endpoints` includes `/auth/customer/start`. It does not include `/auth/login` or `/auth/refresh`. `anonymous` remains because cart and checkout stay anonymous. The order route’s **401** is how a client learns that orders are strict. This plan adds no per-route auth field to the detect schema.

Pull request 5 leaves that detect shape in place with no flag.

### 7.8 Partner Dashboard

| Field | Declare | Why |
| --- | --- | --- |
| Protected customer data | Yes | The Admin order read is customer data. |
| Address | Yes, from pull request 4 | Street lines on shipping and billing. |
| Email | No | Not selected on the Admin order. Not returned. The OIDC `email` scope is not this declaration. |
| Name | No | Not selected. Not returned. |
| Phone | No | Not selected. Not returned. |

Distribution stays custom. This phase does not submit the app for App Store review.

### 7.9 Fixtures

The connector pull requests add checked-in fixtures. CI does not call Shopify. Order responses are validated against the vendored `schemas/order-status.json`.

| Fixture | Expect |
| --- | --- |
| Flag off. Anonymous `GET /orders/1001` | The order-status body. Bearer ignored. Addresses follow the address-gate plan, not this one. |
| Flag off. `POST /auth/customer/start` | Not advertised on `/detect`. |
| Start, then login redirect | **302** to the discovered authorization endpoint. The query carries `code_challenge_method=S256` and does not carry `client_secret` or `prompt`. |
| Token response with `access_token`, `expires_in`, `id_token`, and no `refresh_token` | Session row has the access token and `sub`. It has no refresh token, no GID, and no email. |
| Token response that includes `refresh_token` | The refresh token is absent from SQLite. `grant_type=refresh_token` is not called. |
| `id_token` nonce mismatch | No session row. Poll returns **401** `INVALID_TOKEN`. |
| `Customer.id` is `gid://shopify/Customer/42` | `sub` equals the unpadded base64url HMAC from section 4. The JWT payload has no GID. |
| `Customer.id` missing the `gid://shopify/Customer/` prefix | No JWT. |
| Poll twice after success | First **200** has `access_token` and no `refresh_token`. Second is **401** `INVALID_TOKEN`. |
| Flag on. No `Authorization` | **401** `AUTHENTICATION_REQUIRED`. `WWW-Authenticate: Bearer`. Body is the problem response, not an order. `Cache-Control: no-store`. |
| Flag on. Expired JWT | **401** `INVALID_TOKEN`. |
| Flag on. Owned order, one `customer.orders` node, Admin body populated | **200**. Status, money, and shipment follow the existing mappers. `order.id` has no `gid://`. |
| Flag on. `customer.orders` returns zero nodes, or two | **404** `ORDER_NOT_FOUND`. Admin was not called. Detail does not say “another customer”. |
| Flag on. Ownership passes, Admin `order(id:)` is null | **404** `ORDER_NOT_FOUND`. Same problem body as the zero-node case. |
| Flag on, before the address pull request. Payload has street addresses | Both address keys are absent. |
| Flag on, address pull request merged. Owner, both addresses complete | Both addresses mapped as in the email plan’s section 3.3. `?email=` is ignored. `Order.email` is not in the selection set. |
| Flag on. `countryCodeV2` is `ZZ` | That whole address object is absent. |
| Flag on. Payload includes a card number and `paymentMethodName` | `lastFourDigits` and `brand` are absent. |
| Customer Account API HTTP **401** | **401** `INVALID_TOKEN`. |
| Token without `customer_read_orders` | **500** `INTERNAL_ERROR`, reinstall detail, no token in the body. |
| Flag on. Detect | `endpoints` includes `auth` and `orders`. `authentication.methods` includes `anonymous` and `jwt`. `confirmCreatesOrder` is false. |
| Cart `POST /cart/add` with a Bearer JWT, flag on | The anonymous cart. The JWT does not select a second cart. |

## 8. Constraints

- Require a buyer on cart, checkout, catalog, or shipping routes.
- Bind the anonymous cart to `sub`, or honor a JWT for idempotency identity on cart and checkout.
- Return an anonymous order body, including a status-only body, after customer mode is the default.
- Answer **403** for another customer’s order, or put “not your order” in the **404** detail.
- Call Customer Account API `order(id:)`, or use a pre-authenticated order-status link as the ownership check.
- Map the FastBuyJSON order from the Customer Account API `Order` type.
- Filter Admin `orders` by `customer_id:` and skip the Customer Account API ownership query.
- Put the customer GID, the email, or the Shopify access token in the JWT, the order body, `extensions`, or logs.
- Store the GID, the email, the `id_token`, or a refresh token in SQLite.
- Call `grant_type=refresh_token` or send `prompt=none`.
- Implement `POST /auth/login` username and password, or `POST /auth/refresh`, on the connector.
- Use a headless or Hydrogen customer client, Multipass, or Storefront `customerAccessTokenCreate`.
- Add `read_customers`, `read_all_orders`, `write_orders`, or a customer write scope.
- Select `CardPaymentDetails`, or return `lastFourDigits` or `brand`.
- Return email, phone, or name.
- Keep `SHOPIFY_ORDER_ADDRESS_GATE` or `?email=` after the pull request that makes customer mode the default.
- Add an MCP tool, an SDK method, or an OpenAPI path for the poll.
- Bump `SHOPIFY_API_VERSION` off `2026-10`.
- Subscribe to order or customer webhooks beyond the v1 compliance topics.

## 9. Phased pull requests

| PR | Where | Ships |
| --- | --- | --- |
| 1. This plan | This repository | `docs/SHOPIFY_CUSTOMER_ACCOUNTS_PLAN.md`, the pointers in `SHOPIFY_PLAN.md` section 9, `SHOPIFY_ORDERS_PLAN.md`, and `SHOPIFY_EMAIL_ORDER_PLAN.md`, and the `docs/CONTRACT.md` note. No schema, OpenAPI, SDK, MCP, reference-server, or connector change. |
| 2. Login | `millers-dev/fast-buy-json-shopify` | `[customer_authentication]` callback, the two customer scopes, discovery, PKCE, start / login redirect / callback / poll, the HMAC `sub`, the encrypted rows, and the compliance deletes. `SHOPIFY_CUSTOMER_ACCOUNTS` default off. Orders and `/detect` unchanged while it is off. |
| 3. Ownership | Connector | When the flag is on, section 7.3 and section 7.4. The Admin body uses the existing status, delivered, money, items, payment, and shipment mappers. Addresses stay omitted. `?email=` is ignored while the flag is on. |
| 4. Addresses | Connector | When the flag is on, add section 7.5’s address selection and the email plan’s address map. Declare Address. Card fragments stay omitted. |
| 5. Default | Connector | Remove `SHOPIFY_CUSTOMER_ACCOUNTS`. Customer mode is the only order behavior. Remove `SHOPIFY_ORDER_ADDRESS_GATE` and `?email=`. `/detect` advertises `jwt` without a flag. Anonymous `GET /orders/{orderId}` is **401** `AUTHENTICATION_REQUIRED`. |

Each connector pull request merges on its own. Runtime stays Node.js 18+, TypeScript, global `fetch`, `node:test`, API `2026-10`. The connector vendors schemas. It does not edit them.

PR 5 is the end state in section 1. PR 2 through PR 4 are the path that keeps today’s anonymous order route working until that pull request.

This repository needs no further code change for those pull requests. The reference MCP server keeps calling `GET /orders/{orderId}` with no Bearer token. After PR 5 that call receives **401** `AUTHENTICATION_REQUIRED`. Pointing `FASTBUYJSON_API_URL` at the connector does not add a login tool.

The Partner Dashboard declaration and the `[customer_authentication]` redirect are app settings. The redirect URI is also a line in the connector’s app configuration. The field declaration is not a commit in this repository.

## 10. Risks

**Guessable names stop returning orders only when customer mode is on.** Until PR 5, the flag defaults to off and the anonymous route remains. After PR 5, a caller without a JWT learns nothing about `1001` except that the route requires a buyer.

**The 404 is shared on purpose.** Another customer’s order, an unknown id, an ambiguous confirmation number, and an order outside the `read_orders` window use one problem body. A client cannot tell those cases apart. That is the point of the shared **404**.

**Admin is still shop-wide.** The customer access token is what limits ownership. The Admin token can still read the order. The handler must not call Admin before section 7.4 returns one GID, and it must not log that GID. A bug that skips the ownership query returns the anonymous-era data to whoever holds a JWT. The fixtures in section 7.9 lock the “Admin was not called” case.

**Two windows.** Customer Account API `customer.orders` and Admin `read_orders` can disagree at the edge of the 60-day window. Either side returning nothing is **404**. This plan does not add `read_all_orders` to paper over that.

**No refresh token.** The app client cannot renew the customer access token in the background. A long agent session logs in again when `expires_in` elapses. `prompt=none` needs a browser session this poll does not keep. The JWT does not outlive the customer access token.

**`grant_types_supported` lists `refresh_token`.** That list describes the server. Calling the grant on this client returns **400** `unsupported_grant_type`. The connector does not try it.

**The poll token is a bearer for the JWT.** It is single-use and lives 10 minutes. A proxy that logs the start response captures it. Connector logs omit it. The callback page does not echo the JWT.

**HTTPS callback.** Local client-credentials development has no browser redirect until `APP_URL` is an HTTPS tunnel registered as a `redirect_uri`. Catalog and cart do not gain that requirement.

**OIDC `email`.** The documented authorize scope includes `email`. The `id_token` may therefore carry an email claim. The connector checks `nonce` and drops the token. A later edit that logs the `id_token` would log the buyer’s email.

**Detect cannot say “orders are strict, cart is not”.** `authentication.methods` lists both `anonymous` and `jwt`. Clients that treat `anonymous` as “every commerce route is optional” will see **401** on orders. That is the end state, not a detect bug this plan papers over with a schema change.

**Reference MCP.** `mcp-server/src/adapter.ts` `getOrderStatus` sends no Authorization header. After PR 5 the tool fails with `AUTHENTICATION_REQUIRED`. Cart and checkout tools keep working. This plan does not change the MCP server.

**Secret rotation.** Changing `SHOPIFY_CUSTOMER_SUB_SECRET` splits identity for the same Shopify customer across the rotation. Carts are unaffected because they stay anonymous. Order history has no local archive keyed by `sub`.

**API calendar.** `SHOPIFY_PLAN.md` records that 2026-10 falls out of support on 2026-10-16. This plan does not bump the pin. A later pull request bumps Admin and the Customer Account API together, and re-checks R1 through R5 on that pin.

## 11. Defaults this plan accepts

No open product question blocks pull request 2. Merging this plan accepts the following. A review comment that names the row is enough to change it. These rows are the 2026-10-06 defaults.

| # | Default |
| --- | --- |
| C1 | Approach A2. Customer Account API proves identity and ownership. Admin GraphQL supplies the order body. The status, delivered, and address mappers stay on the Admin payload. |
| C2 | The Shopify client is the app’s `[customer_authentication]` PKCE client. No refresh token is stored or sent. `prompt=none` is not used. An expired customer access token requires a new login. |
| C3 | End state: anonymous `GET /orders/{orderId}` is **401** `AUTHENTICATION_REQUIRED`. There is no anonymous status-only response. `WWW-Authenticate: Bearer` is sent on that **401** and on **401** `INVALID_TOKEN`. |
| C4 | An order that is not the caller’s, an unknown id, an ambiguous match, and an order outside the `read_orders` window are **404** `ORDER_NOT_FOUND` with one problem body. |
| C5 | JWT `sub` is unpadded base64url of HMAC-SHA256 over the customer GID, keyed with `SHOPIFY_CUSTOMER_SUB_SECRET`. The GID is not a claim, not a response field, and not a log field. |
| C6 | The agent handoff is `POST /auth/customer/start`, a browser `loginUrl`, and `GET /auth/customer/poll/{pollToken}`. The poll returns the JWT once and returns no refresh token. The poll row lives 10 minutes. |
| C7 | Pull request 5 removes `SHOPIFY_ORDER_ADDRESS_GATE` and `?email=`. Addresses are mapped for the authenticated owner with the email plan’s section 3.3. Until that pull request, `SHOPIFY_CUSTOMER_ACCOUNTS` defaults to off and the earlier order plans stay in force. |
| C8 | Cart and checkout stay anonymous and out of scope. Bearer on those routes stays ignored. |
| C9 | Ownership is `customer.orders` with `first: 2`. `order(id:)` on the Customer Account API is not called. Admin `order(id:)` runs only with the one owned GID. |
| C10 | Scopes added are `customer_read_orders` and `customer_read_customers`. Admin `read_orders` stays. `read_customers`, `read_all_orders`, and customer write scopes stay off. |
| C11 | No schema, OpenAPI, SDK, MCP, or reference-server change. No pin change. No new webhook topic. |
| C12 | `customers/redact` and `customers/data_request` delete the session row for the recomputed `sub` and export nothing. |

## 12. Sources

FastBuyJSON, this repository, release 1.0.0:

- `docs/SHOPIFY_ORDERS_PLAN.md` — order route, lookup, status map, anonymous access, `read_orders`, and the **404** / **500** / **429** rows this plan keeps for the Admin read.
- `docs/SHOPIFY_DELIVERED_PLAN.md` — `Fulfillment.deliveredAt` on the Admin order. This plan does not reimplement that map.
- `docs/SHOPIFY_EMAIL_ORDER_PLAN.md` — address field names, the `ZZ` rule, and `SHOPIFY_ORDER_ADDRESS_GATE`. Pull request 5 of this plan removes that gate.
- `docs/SHOPIFY_PLAN.md` — v1 sequence, custom distribution, `APP_URL`, SQLite, compliance webhooks, and the pointer in section 9.
- `docs/CONTRACT.md` — JWT `sub` as the order identity, optional Bearer on commerce routes, `AUTHENTICATION_REQUIRED`, `INVALID_TOKEN`, `ORDER_NOT_FOUND`.
- `schemas/order-status.json` — `OrderStatusResponse`. Optional addresses. No `userId`. This plan does not edit the schema.
- OpenAPI operation `getOrderStatus` — path parameter `orderId`, no email parameter, `Cache-Control: no-store` on the 200 response. This plan does not edit the document.
- `examples/responses/auth-login-200.json` — reference login returns `access_token`, `refresh_token`, `token_type`, and `expires_in`. The connector poll returns a JWT `access_token` and does not return `refresh_token`.
- `mcp-server/src/adapter.ts` — `getOrderStatus` sends no Authorization header. `login` posts username and password to `/auth/login`. This plan does not change that file.
- `schemas/detect-response.json` — `endpoints` may include `auth`. `authentication.methods` may include `jwt` and `anonymous`. This plan does not edit the schema.

Shopify, read 2026-10-06. The connector still pins API `2026-10`.

- Customer Account API authentication, discovery, PKCE, and the app-client rule that no refresh token is returned: <https://shopify.dev/docs/api/customer/2026-10>
- `[customer_authentication]` (`redirect_uris`, public PKCE client, `unsupported_grant_type` on refresh): <https://shopify.dev/docs/apps/build/cli-for-apps/app-configuration>
- Customer Account API `customer`, including `id` and `orders` filters `name`, `confirmation_number`, and `id`: <https://shopify.dev/docs/api/customer/2026-10/queries/customer>
- Customer Account API `order` query and its authentication-state labels: <https://shopify.dev/docs/api/customer/2026-10/queries/order>
- Customer Account API `Order`: <https://shopify.dev/docs/api/customer/2026-10/objects/Order>
- Customer Account API `OrderFinancialStatus`: <https://shopify.dev/docs/api/customer/2026-10/enums/OrderFinancialStatus>
- Customer Account API `OrderFulfillmentStatus`: <https://shopify.dev/docs/api/customer/2026-10/enums/OrderFulfillmentStatus>
- Customer Account API `Fulfillment` (no `deliveredAt`): <https://shopify.dev/docs/api/customer/2026-10/objects/Fulfillment>
- Customer Account API `CustomerAddress` (`countryCode`, `zoneCode`): <https://shopify.dev/docs/api/customer/2026-10/objects/CustomerAddress>
- Order status page authentication states (unauthenticated, pre-authenticated, fully authenticated): <https://shopify.dev/docs/apps/build/customer-accounts/order-status-page>
- Access scopes, including `customer_read_orders`, `customer_read_customers`, and the `read_orders` window: <https://shopify.dev/docs/api/usage/access-scopes>
- Protected customer data: <https://shopify.dev/docs/apps/launch/protected-customer-data>
- Admin `Order` used by the existing mappers: <https://shopify.dev/docs/api/admin-graphql/2026-10/objects/Order>
- API versioning (2026-10): <https://shopify.dev/docs/api/usage/versioning>
