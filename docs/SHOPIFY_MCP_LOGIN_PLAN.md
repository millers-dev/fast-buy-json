# Shopify MCP login plan

Status: proposed. English only. This file is the implementation plan for customer login and token refresh on the reference MCP server in `mcp-server/`. It is documentation. Accepting it does not change the HTTP contract’s schemas, the OpenAPI document, the reference servers, the TypeScript SDK, the MCP server, or the Shopify connector.

Checked against this repository at **1.0.0** (`docs/CONTRACT.md`, `mcp-server/src/adapter.ts`, `mcp-server/src/index.ts`, `schemas/detect-response.json`) on **2026-10-07**. The connector routes this server will call are specified in [`SHOPIFY_CUSTOMER_ACCOUNTS_PLAN.md`](SHOPIFY_CUSTOMER_ACCOUNTS_PLAN.md). Order lookup and the status map stay in [`SHOPIFY_ORDERS_PLAN.md`](SHOPIFY_ORDERS_PLAN.md). The v1 sequence stays in [`SHOPIFY_PLAN.md`](SHOPIFY_PLAN.md).

The defaults in section 1 are locked. Section 11 lists them again so a review comment can overturn one without reopening the rest.

## 1. Decision

| Topic | Default |
| --- | --- |
| Where the code lands | `mcp-server/` in this repository, in the pull request after this one. This pull request is the plan and the pointers in section 9. No MCP code here. |
| Customer tools | `fastbuy_customer_login_start` and `fastbuy_customer_login_poll`. |
| Start | `POST {FASTBUYJSON_API_URL}/auth/customer/start`. Tool text is `loginUrl` and `userCode` only. `pollToken` stays in adapter memory. |
| Poll | `POST {FASTBUYJSON_API_URL}/auth/customer/poll` with the stored `pollToken`. The tool returns immediately. Pending stays pending. Complete stores the FastBuyJSON JWT as `Authorization: Bearer` for later calls, including `fastbuy_get_order_status`. Tool text says login is complete and includes `expires_in`. The raw JWT is not in the tool text. |
| Who waits | The agent calls poll again. The MCP process does not sleep, retry, or hold the tool call open. |
| Detect gate | Before start, `GET {FASTBUYJSON_API_URL}/detect`. Require `authentication.methods` to include `jwt` and `authentication.endpoints` to include `/auth/customer/start`. Otherwise a clear error and no start request. Reference demos fail this gate. |
| Demo login | The same implementation pull request adds `fastbuy_login`. Username and password go to `POST /auth/login`. The adapter stores `access_token` and `refresh_token`. Tool text does not include either token. |
| Refresh | The same implementation pull request adds `fastbuy_auth_refresh`. It calls `POST /auth/refresh` only when the adapter holds a `refresh_token`. With no refresh token it does not call the network. The error reads `GET /detect`: `jwt` plus `/auth/customer/start` means customer start and poll; `/auth/login` (the reference demos) means `fastbuy_login`. |
| Order status | `fastbuy_get_order_status` stays `GET /orders/{orderId}`. Once a JWT is stored, the existing request interceptor sends `Authorization: Bearer`. The tool gains no new argument. |
| Expired session | A stored JWT past `expires_in`, or a commerce **401** `AUTHENTICATION_REQUIRED` or `INVALID_TOKEN`, clears the Bearer and any `pollToken`. The error names `fastbuy_auth_refresh` when a refresh token remains. Otherwise it uses the same detect-aware login as refresh. It does not name poll or `fastbuy_get_order_status`. |
| Cart and checkout | Stay anonymous. The connector ignores Bearer on those routes. This plan does not strip the header. |
| Transport | stdio only. The same `StdioServerTransport` as today. |
| Out of scope | Connector changes. OpenAPI paths for `/auth/customer/*`. Schemas. SDK. Logout. An HTTP MCP listener. Shopify `grant_type=refresh_token`. Shopify `prompt=none`. |

Accepting this plan accepts those defaults.

## 2. Problem

[`SHOPIFY_CUSTOMER_ACCOUNTS_PLAN.md`](SHOPIFY_CUSTOMER_ACCOUNTS_PLAN.md) makes customer mode the only order behavior in its pull request 5. Anonymous `GET /orders/{orderId}` then returns **401** `AUTHENTICATION_REQUIRED`. The buyer’s FastBuyJSON JWT comes from `POST /auth/customer/start` and `POST /auth/customer/poll`. Those routes are connector routes. They are not in `openapi/fastbuyjson.yaml`.

`mcp-server/src/index.ts` registers nine tools, including `fastbuy_get_order_status`. It does not register a login tool. `FastBuyJSONAdapter.getOrderStatus` sends `GET /orders/{orderId}`. The axios interceptor adds `Authorization: Bearer` only when `authToken` is already set. Nothing in the tool list sets it. After the connector’s pull request 5, order status fails and cart and checkout still work.

`FastBuyJSONAdapter.login` already posts username and password to `/auth/login` and, on success, stores `access_token`. It is not wired to a tool. Its return value is the raw JSON body, so a caller that stringifies it would place `access_token` and `refresh_token` in the tool text. The method does not keep `refresh_token`. There is no method that posts `/auth/refresh`, and there is no method that posts `/auth/customer/start` or `/auth/customer/poll`.

The reference Node and Python servers still issue tokens from `POST /auth/login` and accept `POST /auth/refresh`. Their `/detect` documents list `jwt` and `/auth/login`, and they do not list `/auth/customer/start`. A customer-login tool that skips the detect gate would call a route those servers do not implement. A refresh tool that always posts `/auth/refresh` would call a route the Shopify connector does not implement.

## 3. Goal and non-goals

**Goal.** An agent logged into a connector that advertises customer login can start that login, show the buyer `loginUrl` and `userCode`, poll until the connector returns a FastBuyJSON JWT, and keep that JWT inside the MCP process. Later `fastbuy_get_order_status` calls send it as Bearer. The same implementation pull request can sign in to the Node or Python demo with username and password, store that demo’s refresh token, and exchange it at `POST /auth/refresh`. Secrets that redeem a session stay out of tool text.

**Non-goals.**

- No edit to the Shopify connector, including no `POST /auth/refresh` and no `grant_type=refresh_token` or `prompt=none`.
- No OpenAPI path, schema, or SDK method for `/auth/customer/start` or `/auth/customer/poll`.
- No logout, no revocation, and no call to Shopify `end_session_endpoint`.
- No HTTP listener. ChatGPT Developer Mode still has no URL to paste. `docs/INTEGRATIONS.md` already records that.
- No change to cart, catalog, discount, shipping, or checkout tools. Bearer on those routes stays attached when a token is stored. The connector ignores it, as [`SHOPIFY_CUSTOMER_ACCOUNTS_PLAN.md`](SHOPIFY_CUSTOMER_ACCOUNTS_PLAN.md) specifies.
- No binding of the anonymous cart to `sub`.
- The mock entry point `mcp-server/src/index-mock.ts` stays as it is.
- This pull request does not register the tools. Section 9’s second pull request does.

## 4. Process memory

One stdio process holds one `FastBuyJSONAdapter`, which is the object `mcp-server/src/index.ts` already constructs. Session state lives on that object. It is not written to disk, to the environment, or to a log line.

| Field | Set by | Cleared by | Sent to the agent |
| --- | --- | --- | --- |
| `authToken` | Customer poll complete, `fastbuy_login`, or a successful refresh. Already the interceptor’s Bearer value. | `clearSession`. A commerce **401** `AUTHENTICATION_REQUIRED` or `INVALID_TOKEN`. Local expiry past `accessExpiresAt`. | Never. |
| `refreshToken` | `fastbuy_login`, when the login body includes `refresh_token`. A refresh body that includes `refresh_token` replaces it. | Customer poll complete. A refresh **401**. `clearSession`. A commerce **401** does not clear it. | Never. |
| `pollToken` | Customer start, from the start JSON. A later start replaces it. | Customer poll complete, a poll **401**, a successful `fastbuy_login`, `clearSession`, a commerce **401** `AUTHENTICATION_REQUIRED` or `INVALID_TOKEN`, and local expiry. | Never. |
| `accessExpiresAt` | Poll complete, login, or refresh, when `expires_in` is a finite number. Milliseconds, `storedAt + expires_in * 1000`. | The same clears as `authToken`. | Never. The agent sees `expires_in` on the success result, not this timestamp. |
| `reauthRequired` | Local expiry, or a commerce **401** `AUTHENTICATION_REQUIRED` or `INVALID_TOKEN`. | Successful customer poll, `fastbuy_login`, or refresh. | Never. While it is set, `getOrderStatus` does not call the network. |

A process restart drops every field in the table. The buyer starts again.

Customer poll complete stores `access_token` and clears `refreshToken`. The connector returns no refresh token. If a poll body contains `refresh_token` anyway, the adapter does not store it and does not put it in tool text. `fastbuy_auth_refresh` then still has nothing to send.

`fastbuy_login` stores `access_token` and, when present, `refresh_token`. It clears `pollToken`, so the process has one session. A later customer start begins a new poll and does not clear `authToken` until that poll completes.

Node `POST /auth/refresh` returns `access_token`, `token_type`, and `expires_in`. It does not return a new `refresh_token`. A successful refresh stores the new access token and keeps the previous refresh token when the body omits one.

The response interceptor in `adapter.ts` clears `authToken` on every HTTP **401**. A failed poll or a failed login would drop a JWT that was still good. The implementation pull request exempts `GET /detect`, `POST /auth/customer/start`, `POST /auth/customer/poll`, `POST /auth/login`, and `POST /auth/refresh` from that clear. A **401** from `/auth/refresh` still clears `refreshToken`. A **401** from poll clears `pollToken` and does not clear `authToken`. A commerce **401** whose problem `code` is `AUTHENTICATION_REQUIRED` or `INVALID_TOKEN` clears `authToken` and `pollToken`, keeps `refreshToken`, and sets `reauthRequired`. Section 7.6 is that recovery. It does not leave a poll token for the agent to retry.

## 5. Approaches

Three ways to hand the connector’s device-style login to an agent were set aside. The pair of tools in section 1 is the one this plan accepts.

### A. Return `pollToken` and the JWT in the tool text

The start body and the poll body already contain those values. Stringifying them, which is what the other tools do with `response.data`, would put a bearer for the JWT and then the JWT itself into the chat transcript. A copied transcript can redeem the session until `exp`. This approach is rejected.

### B. Sleep inside the MCP tool until the buyer finishes

The connector does not hold `POST /auth/customer/poll` open. The poll row lives 10 minutes, and a poll faster than once per 2 seconds is **429** `RATE_LIMITED`. A tool that loops would sit inside one MCP call for that whole window and would trip the limit. This approach is rejected.

### C. Serve the MCP server over HTTP so a remote client can open the login URL

ChatGPT Developer Mode wants an HTTPS MCP URL. This server is stdio. Adding a listener is a different plan. This approach is rejected.

### D. Two customer tools, memory for the poll token, agent-driven poll

Start returns `loginUrl` and `userCode`. Poll sends the stored `pollToken` and returns pending or a completion summary. The implementation pull request also registers demo login and refresh, because the reference servers already implement those routes and the adapter’s login method is not yet a tool. This is the approach section 1 accepts.

## 6. Recon, checked on 2026-10-07

The working hypothesis was: the reference MCP server can obtain a connector JWT without a new contract route, and it can keep using `/auth/login` and `/auth/refresh` against the demos. That holds, with the limits in M2, M5, and M6.

| ID | Claim | Result |
| --- | --- | --- |
| M1 | `fastbuy_get_order_status` already sends a stored Bearer token. | The send path holds. `getOrderStatus` does not set its own header. The request interceptor adds `Authorization: Bearer` when `authToken` is set. No registered tool sets `authToken`. |
| M2 | `adapter.login` is a safe MCP login. | Does not hold. The method posts `{ username, password }` to `/auth/login`, stores `access_token`, and returns `response.data`. That body includes `access_token` and `refresh_token` on the reference servers (`examples/responses/auth-login-200.json`). `index.ts` does not register the method. `refresh_token` is not stored. |
| M3 | The adapter can refresh. | Does not hold. There is no `POST /auth/refresh` call. `schemas/refresh-request.json` requires `refresh_token`. |
| M4 | `detectSupport` is the customer-login gate. | Does not hold. `detectSupport` takes a site origin and requests `${url}/api/fastbuyjson/detect` on a separate axios call. Customer start uses the adapter base URL, `GET /detect`, which is `{FASTBUYJSON_API_URL}/detect`. |
| M5 | Demo `/detect` advertises customer login. | Does not hold. `examples/responses/detect-200.json` and the Node and Python reference servers list `authentication.methods` of `jwt`, `certificate`, and `anonymous`, and `authentication.endpoints` of `/auth/login`, `/auth/refresh`, and `/auth/certificate`. They do not list `/auth/customer/start`. An `endpoints` group entry of `auth` is not that path. |
| M6 | The connector customer poll returns a refresh token, or `/detect` lists `/auth/refresh`. | Does not hold. [`SHOPIFY_CUSTOMER_ACCOUNTS_PLAN.md`](SHOPIFY_CUSTOMER_ACCOUNTS_PLAN.md) section 7.2 returns `access_token`, `token_type` `bearer`, and `expires_in`. Section 7.7 lists `/auth/customer/start` under `authentication.endpoints` and does not list `/auth/login` or `/auth/refresh`. `authentication.methods` includes `jwt` and `anonymous`. |
| M7 | Node `POST /auth/refresh` rotates `refresh_token`. | Does not hold. The handler returns `access_token`, `token_type`, and `expires_in`. The stored refresh token remains the one from login. |
| M8 | Any HTTP **401** should drop the stored JWT. | Holds in the current interceptor, and it is the wrong rule for poll and login. A poll **401** means that poll token is dead. It does not mean a previously stored demo JWT is dead. Section 4 exempts the auth routes. A commerce **401** `AUTHENTICATION_REQUIRED` or `INVALID_TOKEN` still drops the JWT. Section 7.6 also drops `pollToken` and names the next login. |

## 7. What the implementation pull request changes

The pull request edits `mcp-server/src/adapter.ts`, `mcp-server/src/index.ts`, and tests under `mcp-server/test/`. It updates the tool table in `mcp-server/README.md`. It updates the short note this plan adds to `docs/INTEGRATIONS.md` so the note names the shipped tools. It does not edit `src/index-mock.ts`.

Runtime stays Node.js 18+, TypeScript, the existing axios client, and `node:test`. Root `npm run mcp:test` already runs `node --test mcp-server/test/*.test.js` after a build. New tests join that glob. They do not start the demo and they do not call Shopify.

### 7.1 Detect gate

`customerLoginStart` requests `GET /detect` on the adapter client before `POST /auth/customer/start`.

The check passes only when both are true:

- `authentication.methods` is an array that contains the string `jwt`.
- `authentication.endpoints` is an array that contains the string `/auth/customer/start`.

That is the detect shape in [`SHOPIFY_CUSTOMER_ACCOUNTS_PLAN.md`](SHOPIFY_CUSTOMER_ACCOUNTS_PLAN.md) section 7.7. A missing `authentication` object, a non-array, or any other nesting fails the gate. The group name `auth` on `endpoints` does not pass the gate.

On failure the method throws a clear error and does not post start. The error says customer login is not advertised, names the two fields the document must contain, and tells the agent that the reference demos use `fastbuy_login` instead. A detect HTTP failure uses `throwHttpError` and still does not post start.

`fastbuy_login` does not use this gate. The demos advertise `/auth/login` and do not advertise `/auth/customer/start`. A connector that has no username route returns whatever HTTP status it returns, through the existing problem formatter.

**Login hint.** Refresh with no `refresh_token`, an empty poll when no Bearer is stored, and the expired-session path in section 7.6 share one hint. The adapter `GET`s `/detect` and does not post start, poll, or refresh as part of that read.

| Detect | Hint |
| --- | --- |
| `authentication.methods` contains `jwt` and `authentication.endpoints` contains `/auth/customer/start` | Run `fastbuy_customer_login_start`, then `fastbuy_customer_login_poll`. Do not run `fastbuy_login`. |
| Otherwise, `authentication.endpoints` contains `/auth/login` | Run `fastbuy_login`. Do not run customer start. This is the reference-demo shape (`/auth/login`, `/auth/refresh`, `/auth/certificate`). |
| Detect HTTP failure, or neither path | Say `/detect` did not name a login route. Do not pick customer start or `fastbuy_login` as the only next step. |

The hint does not name `fastbuy_customer_login_poll` by itself, and it does not name `fastbuy_get_order_status`. Customer poll is only the second step after a start that returned `loginUrl` and `userCode`.

### 7.2 `fastbuy_customer_login_start`

No arguments. `POST /auth/customer/start` with no body fields.

The adapter reads `loginUrl`, `userCode`, and `pollToken` from the JSON object. All three must be non-empty strings. If any is missing, it stores nothing and throws an error that does not include `pollToken`, `loginUrl`, or any token field from the body.

On success it stores `pollToken`, replacing any previous poll token. The method returns an object whose only keys are `loginUrl` and `userCode`. The tool handler stringifies that object the same way the other tools stringify their results, so the tool text cannot grow extra keys unless the return value grows them.

The connector start body also includes `expiresAt`. [`SHOPIFY_CUSTOMER_ACCOUNTS_PLAN.md`](SHOPIFY_CUSTOMER_ACCOUNTS_PLAN.md) section 7.2 sets that deadline **10 minutes** after the row is written. `expiresAt` is not a bearer. It stays out of tool text so the return value stays the two keys above. The tool description states that 10-minute poll-row lifetime. A later poll **401** is the stop signal: the row is dead, section 7.3 clears `pollToken`, and the agent runs start again. The agent does not keep calling poll after that **401**, and does not call `fastbuy_get_order_status` to see whether the expired attempt produced an order.

A start **429** `RATE_LIMITED` stores no new `pollToken` and does not clear one already stored, because the connector writes no row when the limit trips. The tool does not sleep and does not retry. The error surfaces `RATE_LIMITED`. The agent waits and calls start again. It does not call poll for the attempt that was limited.

The tool description tells the agent to show both values to the user, and to tell the user to continue in the browser only when the page shows the same code. It states the 10-minute lifetime, names poll **401** as the stop signal, and says the next step is `fastbuy_customer_login_poll`. It tells the agent not to ask the user for a poll token.

### 7.3 `fastbuy_customer_login_poll`

No arguments. The agent cannot pass `pollToken`.

If no poll token is stored, the method does not call the network. It does not invent a poll.

- When `authToken` is stored, the error says login already completed and the next call is `fastbuy_get_order_status`. It does not say to run start, and it does not say to call poll again.
- When `authToken` is not stored, including after section 7.6 has cleared an expired Bearer, the error says there is nothing to poll. It uses the login hint in section 7.1. It does not name `fastbuy_get_order_status`. It does not say to call poll again. An empty `pollToken` is not a pending login.

If a poll token is stored, the method posts `{ "pollToken": "<stored>" }` to `/auth/customer/poll`.

| HTTP result | Adapter result |
| --- | --- |
| **200** and `status` `pending` | Return `{ "status": "pending" }`. Keep `pollToken`. |
| **200** and `status` `complete`, with a non-empty string `access_token` | Store it as `authToken`. Set `accessExpiresAt` when `expires_in` is a finite number. Clear `refreshToken`, `pollToken`, and `reauthRequired`. Return `{ "status": "complete", "expires_in": <number> }` when `expires_in` is a finite number. When it is not, return `{ "status": "complete" }`. Do not copy `access_token`, `token_type`, or `refresh_token` into the result. |
| **200** and `status` `complete` without a usable `access_token` | Store nothing new. Clear `pollToken`. Throw an error that does not quote the body. |
| **401** | Clear `pollToken`. Do not clear `authToken`. Surface the problem body through `throwHttpError`. The message tells the agent to run start again. It does not tell the agent to call `fastbuy_get_order_status`. |
| **429** | Keep `pollToken`. Surface `RATE_LIMITED`. Do not sleep. |

Any other body is an error that omits token fields. The server does not wait.

The `fastbuy_customer_login_poll` description must say all of the following, so an expired session cannot bounce between poll and order status:

- `status` `pending` means call this tool again later. Do not call `fastbuy_get_order_status` while the login is pending.
- A **429** means wait and call this tool again. Do not start a second login while this poll token is still stored.
- After `status` `complete`, do not call this tool again. Call `fastbuy_get_order_status` for the order.
- If this tool reports that no login is in progress, do not call `fastbuy_get_order_status` and do not call this tool again. Run only the login tool the error names.
- A **401** means this attempt is finished. Do not call `fastbuy_get_order_status` to check it. Run `fastbuy_customer_login_start` again. Poll **401** is also the stop signal when `expiresAt` has passed.

### 7.4 `fastbuy_login`

Arguments are `username` and `password`, both required strings. Validation failure does not include the password. The method posts `{ username, password }` to `/auth/login`, which is the body `adapter.login` already sends.

On success, `access_token` must be a non-empty string or the method throws without echoing the body. The adapter stores it and sets `accessExpiresAt` when `expires_in` is a finite number. It stores `refresh_token` when that field is a non-empty string, and clears any previous refresh token when it is not. It clears `pollToken` and `reauthRequired`. The return value is `{ "status": "complete", "expires_in": <number>, "refresh": true }` or the same object with `"refresh": false` when no refresh token was stored. `expires_in` is included only when it is a finite number. The password, `access_token`, and `refresh_token` are not return fields.

The existing error prefix stays `Login`, so the current `throwHttpError` expectation in `mcp-server/test/http-error.test.js` still matches. A **401** from this route does not clear a previously stored `authToken`. It also does not store a new one.

The tool description says this is the username and password login for the reference Node and Python demos, and that a Shopify customer session uses the customer start and poll tools.

### 7.5 `fastbuy_auth_refresh`

No arguments.

When `refreshToken` is absent, the method does not call `/auth/refresh`. The error says no refresh token is stored, then uses the login hint in section 7.1. A connector detect document (`jwt` and `/auth/customer/start`) sends the agent to customer start and poll. A reference-demo document (`/auth/login`, and no `/auth/customer/start`) sends the agent to `fastbuy_login`. The error does not always name customer start. Customer poll never stores a refresh token, and the connector does not implement `/auth/refresh`, so the customer branch of the hint is the connector failure. The demo branch is the failure for a password login that returned no refresh token.

When `refreshToken` is present, the method posts `{ "refresh_token": "<stored>" }` to `/auth/refresh`.

On success it stores the new `access_token`, sets `accessExpiresAt`, and clears `reauthRequired`, under the same rules as login. A new `refresh_token` in the body replaces the stored one. A body without one keeps the previous refresh token. The return value matches poll complete: `status` `complete` and `expires_in` when it is a finite number. Token strings are not returned.

On **401**, clear `refreshToken`, do not clear `authToken`, and surface the problem without copying a token out of the body. Tell the agent to run `fastbuy_login` again when this process had stored a refresh token from that tool. A missing route surfaces through `throwHttpError`. The adapter does not invent a refresh grant and does not fall through to customer poll.

### 7.6 Order status and the other tools

`getOrderStatus` stays a `GET` of `/orders/{orderId}`. After section 7.3 or section 7.4 has stored `authToken`, the interceptor sends Bearer. The implementation pull request does not add an order-id argument for the token and does not read a token from the tool arguments.

**Recovery.** This runs before the order request, and again when the order response is a **401** whose problem `code` is `AUTHENTICATION_REQUIRED` or `INVALID_TOKEN`. The same response rule applies to any other commerce method that receives those two codes. Cart and checkout on the connector do not return them for a Bearer they ignore.

| Trigger | What the adapter does |
| --- | --- |
| `accessExpiresAt` is set and now is at or past it | Clear `authToken` and `pollToken`. Keep `refreshToken`. Set `reauthRequired`. Do not send the expired Bearer. |
| Commerce **401** `AUTHENTICATION_REQUIRED` or `INVALID_TOKEN` | Clear `authToken` and `pollToken`. Keep `refreshToken`. Set `reauthRequired`. |

While `reauthRequired` is set, `getOrderStatus` throws and does not call `GET /orders/{orderId}`. A second call does not fall through to an anonymous **200** on the reference demos. Successful customer poll, `fastbuy_login`, or refresh clears `reauthRequired` and stores a new Bearer.

The thrown text does not include the JWT or `pollToken`. It does not tell the agent to call `fastbuy_customer_login_poll` or `fastbuy_get_order_status`. Those two calls are the loop: poll has nothing stored, and order status is what just failed.

| Stored refresh token | Error tells the agent to |
| --- | --- |
| Present | Run `fastbuy_auth_refresh` once. Do not run customer start and do not send the password again unless refresh fails. |
| Absent | Use the login hint in section 7.1. Customer detect means `fastbuy_customer_login_start`, then poll after start returns. Demo detect means `fastbuy_login`. |

The `fastbuy_get_order_status` description must say:

- A result of `AUTHENTICATION_REQUIRED` or `INVALID_TOKEN`, or an error that says the session expired, means do not call this tool again and do not call `fastbuy_customer_login_poll`.
- Call `fastbuy_auth_refresh` only when the error names it. Call `fastbuy_customer_login_start` and then poll only when the error names customer login. Call `fastbuy_login` only when the error names it.
- Calling poll after this error does not recover a session. There is no poll token after a finished login, after local expiry, or after this **401**.

Cart, checkout, discount, shipping, and catalog calls keep going through the same interceptor. A stored JWT that is still inside `accessExpiresAt` is attached there too. On the Shopify connector those routes ignore Bearer and stay anonymous. On the reference demos the contract uses JWT `sub` as cart identity, so a demo session that has logged in will send Bearer on later cart calls. This plan does not add a per-route strip to stop that. Once section 7.6 has cleared an expired Bearer, those calls send no `Authorization` until the next login. That is the token being gone, not a header filter.

`clearSession` clears `authToken`, `refreshToken`, `pollToken`, `accessExpiresAt`, `reauthRequired`, and the checkout fields it already clears. No tool in this plan calls it. Logout stays out of scope.

`setBaseUrl` clears `authToken`, `refreshToken`, `pollToken`, `accessExpiresAt`, and `reauthRequired` before it points the client at the new base. A token from one host is not sent to the next, and the new host is not stuck in `reauthRequired`.

Errors that go through `throwHttpError` must not contain `pollToken`, `access_token`, `refresh_token`, or the password. When a problem body includes those fields, the adapter removes them before `formatHttpError` appends the JSON. Other problem fields, including `code` and `detail`, stay.

### 7.7 Tool wiring

`mcp-server/src/index.ts` registers the four tools next to the existing list and handles them in the same `CallTool` switch, before the `default` throw. Each customer, login, and refresh handler validates with zod and returns `JSON.stringify` of the adapter result. It does not merge `response.data` back in.

Tool names:

| Tool | Adapter method | Arguments |
| --- | --- | --- |
| `fastbuy_customer_login_start` | `customerLoginStart` | None. |
| `fastbuy_customer_login_poll` | `customerLoginPoll` | None. |
| `fastbuy_login` | `login` | `username`, `password`. |
| `fastbuy_auth_refresh` | `authRefresh` | None. |

`index-mock.ts` does not gain these names. The mock adapter does not grow login methods.

Descriptions are the agent’s instructions. They state the detect split (customer tools versus `fastbuy_login`), the ban on sleeping inside the server, and the detect-aware refresh failure from section 7.5. The poll description includes every sentence in section 7.3. The order-status description includes every sentence in section 7.6. PR 2 tests those strings. Removing one fails the test. Other commerce tools that can surface `AUTHENTICATION_REQUIRED` or `INVALID_TOKEN` say the same next step as section 7.6: follow the error, and do not call poll to recover.

### 7.8 Tests

New cases live in a `node:test` file under `mcp-server/test/`, built the same way as `http-error.test.js`: a loopback HTTP server, `new FastBuyJSONAdapter(baseUrl)`, no demo process, no Shopify. Assertions are on the adapter return value, the request the loopback recorded, and the `Authorization` header on the next commerce call. The return value is the tool text, because section 7.7 stringifies it and adds nothing.

| Case | Expect |
| --- | --- |
| `GET /detect` has `jwt` and not `/auth/customer/start` | Start throws. `POST /auth/customer/start` is not called. The error mentions `fastbuy_login`. |
| `GET /detect` omits `jwt` | Start throws. Start is not called. |
| Detect HTTP error | Start throws. Start is not called. |
| Detect lists `jwt` and `/auth/customer/start`. Start returns `loginUrl`, `userCode`, `pollToken`, `expiresAt` | The return value is `{ loginUrl, userCode }` only. `expiresAt` is absent. The stored token is the one the next poll posts. |
| Start **429** `RATE_LIMITED` | Throws. No new `pollToken` is stored. A poll token already stored is still the one a later poll posts. The test records one start request. |
| Start JSON missing `pollToken`, `loginUrl`, or `userCode` | Throws. The error text does not contain a poll token. A later poll does not call the network. |
| Poll with nothing stored and no `authToken` | Throws. `POST /auth/customer/poll` is not called. The error uses the section 7.1 hint and does not name `fastbuy_get_order_status`. |
| Poll with nothing stored while `authToken` is set | Throws. Poll is not called. The error names `fastbuy_get_order_status` and does not say to run start. |
| Poll **200** `{ "status": "pending" }` | Return value is `{ "status": "pending" }`. The same poll token is sent on the next poll. |
| Poll **200** complete with `access_token` and `expires_in`, no `refresh_token` | Return value has `status` `complete` and `expires_in`, and does not contain the JWT. The next `getOrderStatus` sends `Authorization: Bearer` and that JWT. `POST /auth/refresh` is not used by a following `authRefresh`. |
| Poll complete body that also includes `refresh_token` | The refresh token is not in the return value. `authRefresh` does not post. |
| Second poll after complete | Does not call the network. The error names `fastbuy_get_order_status` and does not say to run start. |
| Poll **401** | `pollToken` is dropped. A JWT stored earlier is still sent on `getOrderStatus`. The error tells the agent to run start again and does not name `fastbuy_get_order_status`. |
| Poll **429** | Error surfaces `RATE_LIMITED`. The poll token remains. The test records one poll request, not a retry. |
| `login` **200** with `access_token` and `refresh_token` | Return value has `refresh: true` and no token strings. `authRefresh` posts `{ refresh_token }` and not the access token. |
| `login` **200** with `access_token` and no `refresh_token`. Detect lists `/auth/login` and not `/auth/customer/start` | `refresh` is false. `authRefresh` does not post `/auth/refresh`. The error names `fastbuy_login` and does not name customer start. |
| No `refreshToken`. Detect lists `jwt` and `/auth/customer/start` | `authRefresh` does not post `/auth/refresh`. The error names `fastbuy_customer_login_start` and poll. It does not name `fastbuy_login`. |
| `login` **401** while a JWT is already stored | The earlier JWT is still sent on `getOrderStatus`. |
| Refresh **200** with a new `access_token` and no `refresh_token` | The new access token is the next Bearer. The following refresh posts the original refresh token. |
| Refresh **401** | The refresh token is dropped. The current access token is still sent on `getOrderStatus`. |
| `POST /cart/add` after a stored JWT | The request still includes `Authorization: Bearer`. |
| `getOrderStatus` after `accessExpiresAt` | No `GET /orders/{orderId}`. `authToken` and `pollToken` are cleared. `reauthRequired` is set. With a customer detect document, the error names customer start and does not name poll or `fastbuy_get_order_status`. A second `getOrderStatus` still does not call the network. |
| `getOrderStatus` **401** `AUTHENTICATION_REQUIRED`, no refresh token, customer detect | `authToken` and `pollToken` are cleared. A following poll does not post and does not name `fastbuy_get_order_status`. The error names customer start. |
| `getOrderStatus` **401** `INVALID_TOKEN` while `refreshToken` is stored | `authToken` and `pollToken` are cleared. `refreshToken` remains. The error names `fastbuy_auth_refresh` and does not name customer start. `authRefresh` then posts that refresh token. |
| Problem body that echoes `access_token` or `refresh_token` | The thrown message does not contain those values. |
| Tool description strings for poll and `fastbuy_get_order_status` | They contain the sentences required in section 7.3 and section 7.6. |

`mcp-server/test.js` stays the live script against a running demo. The new file does not depend on it.

### 7.9 Docs in that pull request

`mcp-server/README.md` lists the four tools beside the current nine. `docs/INTEGRATIONS.md` replaces this plan’s “tools are planned” sentence with the tool names and the same split: customer start and poll after the connector advertises them, `fastbuy_login` and `fastbuy_auth_refresh` for the reference demos. The stdio config block stays as it is. No new environment variable is required. `FASTBUYJSON_API_URL` remains the HTTP base.

## 8. Constraints

Do not:

- Put `pollToken`, `access_token`, `refresh_token`, or the buyer’s password in tool text, an error string, or a log line.
- Accept `pollToken`, `access_token`, or `refresh_token` as a tool argument.
- Sleep, poll in a loop, or retry a **429** inside the MCP process.
- Call `POST /auth/customer/start` when the detect gate in section 7.1 fails.
- Treat an `endpoints` entry of `auth`, or a demo list that contains `/auth/login`, as customer login.
- Call `POST /auth/refresh` when the adapter has no `refresh_token`.
- Send the agent to customer start when no refresh token is stored and `/detect` lists `/auth/login` without `/auth/customer/start`. Use the login hint in section 7.1.
- After a commerce **401** `AUTHENTICATION_REQUIRED` or `INVALID_TOKEN`, or after the stored JWT is past `expires_in`, tell the agent to call `fastbuy_customer_login_poll` or `fastbuy_get_order_status`.
- Leave `pollToken` set across that commerce **401** or across local expiry.
- Tell an empty poll to call `fastbuy_get_order_status` when no Bearer is stored.
- Store a `refresh_token` from the customer poll body.
- Clear `authToken` on a **401** from detect, customer start, customer poll, `/auth/login`, or `/auth/refresh`.
- Strip `Authorization` on cart or checkout. The connector ignores Bearer there. The demos may honor it.
- Add a logout tool, an HTTP transport, a connector route, an OpenAPI path, a schema change, or an SDK method.
- Call Shopify `grant_type=refresh_token` or send `prompt=none`.
- Register these tools on `index-mock.ts`.
- Change `fastbuy_get_order_status` into a login tool. It stays a get of one order.

## 9. Phased pull requests

| PR | Where | Ships |
| --- | --- | --- |
| 1. This plan | `millers-dev/fast-buy-json` | `docs/SHOPIFY_MCP_LOGIN_PLAN.md`. Pointers in `docs/SHOPIFY_CUSTOMER_ACCOUNTS_PLAN.md`, `docs/INTEGRATIONS.md`, and `docs/SHOPIFY_PLAN.md` section 9. No schema, OpenAPI, SDK, MCP, reference-server, or connector change. |
| 2. MCP tools | `mcp-server/` in this repository | `fastbuy_customer_login_start`, `fastbuy_customer_login_poll`, `fastbuy_login`, and `fastbuy_auth_refresh`. Adapter storage for `pollToken`, `authToken`, and `refreshToken`. The detect gate. Tests in section 7.8. README and the `INTEGRATIONS.md` note from section 7.9. |

PR 2 merges on its own after this plan. It does not wait on a connector release to compile. Its tests use a loopback server. A live check against the connector happens only after that connector’s customer-accounts pull request 5 is what `FASTBUYJSON_API_URL` points at, and it is not part of PR 2’s CI.

This pull request does not implement PR 2.

## 10. Risks

**Tool text is the leak.** The other tools stringify the HTTP body. Customer start and customer poll must not. A review that “returns the API response” puts `pollToken` or the JWT in the transcript. Section 7.8 locks the return keys.

**The password still enters the process.** `fastbuy_login` takes `password` as a tool argument because the reference demos have no other login. The host that records tool calls will record it. The customer tools do not take a password. The Shopify buyer signs in in the browser.

**One process, one buyer.** A second start replaces `pollToken`. The first browser login can still finish on the connector, and this process can no longer poll it. A second `fastbuy_login` replaces the JWT. The plan does not keep a map of buyers.

**Restart drops the session.** The JWT is memory. A client that restarts the stdio process must log in again. That matches the connector, which has no refresh token to reload.

**Detect is advisory.** A server can advertise `/auth/customer/start` and then reject the post. The gate stops the known demo shape. It does not prove the connector is healthy. A failed start still returns the problem body, with token fields removed.

**Demo cart identity changes once login is used.** After `fastbuy_login` or a customer poll, the interceptor sends Bearer on cart and checkout as well as on orders. The connector ignores it. The reference demos treat JWT `sub` as the cart identity. An agent that logs in and then adds to cart on a demo is on that user’s cart. This plan does not strip the header to keep the demo cart anonymous.

**Refresh against the wrong server.** If a demo refresh token is still in memory and `FASTBUYJSON_API_URL` is later pointed at the connector in the same process, `fastbuy_auth_refresh` would post it. The base URL is fixed for the process lifetime in normal use. `setBaseUrl` does not clear tokens today. PR 2 clears `authToken`, `refreshToken`, `pollToken`, `accessExpiresAt`, and `reauthRequired` inside `setBaseUrl` so a base-URL change cannot replay a token at a different host.

**Poll limit.** The connector allows one poll per row per 2 seconds. An agent that calls poll in a tight loop receives **429**. The tool returns that error once. It does not back off inside the process.

**`grant_types_supported` on the shop is not this server’s refresh.** The customer-accounts plan already records that the authorization server lists `refresh_token` and that this app client rejects the grant. The MCP server does not try it. Absence of a stored refresh token is the signal.

**Re-auth loop.** After poll complete, `pollToken` is gone. A later **401** on order status used to clear only the Bearer and then an empty poll told the agent to call `fastbuy_get_order_status` again. Sections 7.3, 7.6, and 7.7 close that loop: the dead Bearer and the poll token are cleared, `reauthRequired` blocks another anonymous order read, and both tool descriptions forbid poll after that error. A refresh token from `fastbuy_login` is the one credential that stays, so a demo can refresh.

**Interceptor today.** Until PR 2, a **401** clears `authToken`. PR 2’s exemption is easy to miss if a new axios instance is constructed for the auth calls and the commerce client stays strict. The tests that poll **401** and login **401** with a JWT already stored are the check. The commerce **401** tests in section 7.8 are the check that order status does not keep that JWT.

## 11. Defaults this plan accepts

No open product question blocks pull request 2. Merging this plan accepts the following. A review comment that names the row is enough to change it.

| # | Default |
| --- | --- |
| L1 | This pull request is documentation. MCP code lands in the following pull request, in `mcp-server/`. |
| L2 | Customer login is `fastbuy_customer_login_start` and `fastbuy_customer_login_poll`. Start posts `/auth/customer/start`. Poll posts `/auth/customer/poll`. |
| L3 | Start’s tool text is `loginUrl` and `userCode` only. `pollToken` stays in adapter memory and is never a tool argument, a tool result, an error string, or a log line. |
| L4 | Poll pending returns pending. Poll complete stores the JWT as Bearer and returns `status` plus `expires_in` when that number is present. The raw JWT is not in the tool text. |
| L5 | The MCP process does not sleep or retry. The agent calls poll again. |
| L6 | Start requires `GET /detect` to list `jwt` and `/auth/customer/start` before it posts. Anything else is a clear error, including the reference demos. |
| L7 | The same implementation pull request adds `fastbuy_login` for `POST /auth/login`, storing `access_token` and `refresh_token`, and `fastbuy_auth_refresh` for `POST /auth/refresh` only when a refresh token is stored. |
| L8 | With no refresh token, refresh does not call `/auth/refresh`. The error says no refresh token is stored. If `/detect` lists `jwt` and `/auth/customer/start`, it tells the agent to run customer start and poll. If `/detect` lists `/auth/login` and not `/auth/customer/start`, it tells the agent to run `fastbuy_login`. |
| L9 | A customer poll does not store `refresh_token` even if the body contains one. |
| L10 | Cart and checkout stay anonymous on the connector. Bearer stays attached. This plan does not strip it. |
| L11 | Out of scope: connector edits, OpenAPI `/auth/customer/*`, schemas, SDK, logout, HTTP MCP, Shopify `grant_type=refresh_token`, and `prompt=none`. |
| L12 | Tests in the implementation pull request use a loopback HTTP server for start, poll, login, and refresh. `index.ts` wires the four tools. `index-mock.ts` does not. |
| L13 | A **401** on detect, customer start, customer poll, login, or refresh does not clear a stored access token. A poll **401** clears `pollToken`. A refresh **401** clears `refreshToken`. |
| L14 | `setBaseUrl` clears `authToken`, `refreshToken`, `pollToken`, `accessExpiresAt`, and `reauthRequired`. |
| L15 | A stored JWT past `expires_in`, or a commerce **401** `AUTHENTICATION_REQUIRED` or `INVALID_TOKEN`, clears `authToken` and `pollToken`, sets `reauthRequired`, and keeps `refreshToken`. The error names `fastbuy_auth_refresh` when a refresh token remains. Otherwise it uses the section 7.1 login hint. It does not name poll or `fastbuy_get_order_status`. `getOrderStatus` does not call the network while `reauthRequired` is set. |
| L16 | Start’s HTTP body may include `expiresAt`. Tool text omits it. The poll description states the connector’s 10-minute poll-row lifetime, and a poll **401** is the stop signal. A start **429** stores no new `pollToken`, does not sleep, and does not retry. |

## 12. Sources

FastBuyJSON, this repository, release 1.0.0, read 2026-10-07:

- [`SHOPIFY_CUSTOMER_ACCOUNTS_PLAN.md`](SHOPIFY_CUSTOMER_ACCOUNTS_PLAN.md) — `POST /auth/customer/start`, `POST /auth/customer/poll`, `loginUrl`, `pollToken`, `userCode`, the JWT `access_token` with no `refresh_token`, detect `jwt` plus `/auth/customer/start`, anonymous cart and checkout, and the **401** on anonymous order reads after connector pull request 5.
- [`SHOPIFY_PLAN.md`](SHOPIFY_PLAN.md) — v1 sequence and the follow-on list in section 9.
- [`SHOPIFY_ORDERS_PLAN.md`](SHOPIFY_ORDERS_PLAN.md) — `GET /orders/{orderId}` before customer mode is the default.
- `docs/CONTRACT.md` — optional Bearer on commerce routes, `POST /auth/login` and `POST /auth/refresh` on the reference servers, `AUTHENTICATION_REQUIRED` when a server requires a bearer on the order route.
- `docs/INTEGRATIONS.md` — stdio process, `FASTBUYJSON_API_URL` as the HTTP base, no MCP URL.
- `schemas/detect-response.json` — `authentication.methods` and `authentication.endpoints`. This plan does not edit the schema.
- `schemas/refresh-request.json` — body `{ "refresh_token" }`.
- `examples/responses/auth-login-200.json` — `access_token`, `refresh_token`, `token_type`, `expires_in`.
- `examples/responses/detect-200.json` — demo detect lists `/auth/login` and `/auth/refresh`, not `/auth/customer/start`.
- `mcp-server/src/adapter.ts` — interceptor Bearer header, **401** clears `authToken`, `getOrderStatus`, `login` returns `response.data` and does not store `refresh_token`, `detectSupport` uses a site origin.
- `mcp-server/src/index.ts` — registered tools and `StdioServerTransport`. No login tool.
- `mcp-server/src/http-error.ts` — problem bodies are appended to the tool error string. Section 7.8 requires token fields to be removed first.
- `mcp-server/test/http-error.test.js` — loopback adapter tests, including the `Login` error prefix.
- `src/server.js` and `src/python/server.py` — reference `POST /auth/login` and `POST /auth/refresh`. Node refresh returns a new access token and no new refresh token.
- `package.json` script `mcp:test` — build, then `node --test mcp-server/test/*.test.js`.
