import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import app, { resetDemoState } from "../src/server.js";

const API = "/api/fastbuyjson";
let server;
let baseUrl;

before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

beforeEach(() => {
  resetDemoState();
});

async function request(method, path, { headers = {}, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  const responseHeaders = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key.toLowerCase()] = value;
  });
  return { status: response.status, json, headers: responseHeaders };
}

function expectProblem(body, { status, code }) {
  assert.equal(body?.status, status);
  assert.equal(body?.code, code);
  assert.ok(body?.type?.includes("/problems/"));
}

async function login(username = "demo", password = "password123") {
  const { status, json } = await request("POST", `${API}/auth/login`, {
    body: { username, password },
  });
  assert.equal(status, 200);
  return json.access_token;
}

const shippingAddress = {
  line1: "123 Main St",
  city: "Berlin",
  country: "DE",
  postalCode: "10115",
};

const customerInfo = {
  email: "customer@example.com",
  phone: "+49 30 12345678",
  firstName: "John",
  lastName: "Doe",
};

test("rejects spoofed X-User-Id and uses JWT identity", async () => {
  const token = await login();
  const added = await request("POST", `${API}/cart/add`, {
    headers: { Authorization: `Bearer ${token}` },
    body: { productId: "acme-wh-001", quantity: 1 },
  });
  assert.equal(added.status, 200);
  const cartId = added.json.cart.id;

  const spoofed = await request("GET", `${API}/cart/${cartId}`, {
    headers: { "X-User-Id": "user1" },
  });
  assert.equal(spoofed.status, 404);

  const owned = await request("GET", `${API}/cart/${cartId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(owned.status, 200);
  assert.equal(owned.json.cart.id, cartId);
});

test("replays successful idempotent cart adds and does not burn keys on 404", async () => {
  const key = "idem-cart-1";
  const missing = await request("POST", `${API}/cart/add`, {
    headers: { "Idempotency-Key": key },
    body: { productId: "does-not-exist", quantity: 1 },
  });
  assert.equal(missing.status, 404);

  const first = await request("POST", `${API}/cart/add`, {
    headers: { "Idempotency-Key": key },
    body: { productId: "acme-wh-001", quantity: 1 },
  });
  assert.equal(first.status, 200);
  const quantityAfterFirst = first.json.cart.items[0].quantity;

  const replay = await request("POST", `${API}/cart/add`, {
    headers: { "Idempotency-Key": key },
    body: { productId: "acme-wh-001", quantity: 1 },
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.json.cart.items[0].quantity, quantityAfterFirst);
});

test("checkout confirm requires the issued verification token", async () => {
  const add = await request("POST", `${API}/cart/add`, {
    body: { productId: "acme-wh-001", quantity: 1 },
  });
  assert.equal(add.status, 200);

  const initiated = await request("POST", `${API}/checkout/initiate`, {
    body: {
      cartId: add.json.cart.id,
      shippingAddress,
      customerInfo,
    },
  });
  assert.equal(initiated.status, 200);
  assert.ok(initiated.json.verificationToken);

  const badConfirm = await request("POST", `${API}/checkout/confirm`, {
    body: {
      sessionToken: initiated.json.sessionToken,
      paymentDetails: {
        method: "credit_card",
        transactionVerification: {
          verificationMethod: "email_confirmation",
          verificationToken: "not-the-issued-token",
        },
      },
    },
  });
  assert.equal(badConfirm.status, 400);

  const confirm = await request("POST", `${API}/checkout/confirm`, {
    body: {
      sessionToken: initiated.json.sessionToken,
      paymentDetails: {
        method: "credit_card",
        transactionVerification: {
          verificationMethod: "email_confirmation",
          verificationToken: initiated.json.verificationToken,
        },
      },
    },
  });
  assert.equal(confirm.status, 200);
  assert.equal(confirm.json.order.status, "confirmed");
});

test("sorts products by name", async () => {
  const { status, json } = await request("POST", `${API}/products/search`, {
    body: { sort: "name_desc" },
  });
  assert.equal(status, 200);
  const names = json.results.map((product) => product.name);
  const sorted = [...names].sort((a, b) => b.localeCompare(a));
  assert.deepEqual(names, sorted);
});

test("rejects invalid bearer tokens", async () => {
  const { status, json, headers } = await request("GET", `${API}/cart`, {
    headers: { Authorization: "Bearer not-a-jwt" },
  });
  assert.equal(status, 401);
  assert.ok(headers["content-type"]?.startsWith("application/problem+json"));
  expectProblem(json, { status: 401, code: "INVALID_TOKEN" });
  assert.match(headers["www-authenticate"] || "", /Bearer/i);
});

test("detect advertises specVersion 1.0.0", async () => {
  const { status, json, headers } = await request("GET", `${API}/detect`);
  assert.equal(status, 200);
  assert.equal(json.standard, "FastBuyJSON");
  assert.equal(json.specVersion, "1.0.0");
  assert.equal(json.implementationVersion, "1.0.0");
  assert.equal(headers["cache-control"], "public, max-age=300");
});

test("404 product responses are problem+json", async () => {
  const { status, json, headers } = await request("POST", `${API}/cart/add`, {
    body: { productId: "missing-product", quantity: 1 },
  });
  assert.equal(status, 404);
  assert.ok(headers["content-type"]?.startsWith("application/problem+json"));
  expectProblem(json, { status: 404, code: "PRODUCT_NOT_FOUND" });
});

async function addProduct(quantity = 1) {
  const res = await request("POST", `${API}/cart/add`, {
    body: { productId: "acme-wh-001", quantity },
  });
  assert.equal(res.status, 200);
  return res.json;
}

test("PATCH cart item updates quantity", async () => {
  const added = await addProduct(1);
  const itemId = added.cart.items[0].itemId;
  assert.ok(itemId);

  const patched = await request("PATCH", `${API}/cart/items/${itemId}`, {
    body: { quantity: 4 },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.cart.items[0].quantity, 4);
});

test("PATCH rejects quantity below 1", async () => {
  const added = await addProduct(1);
  const itemId = added.cart.items[0].itemId;
  const bad = await request("PATCH", `${API}/cart/items/${itemId}`, {
    body: { quantity: 0 },
  });
  assert.equal(bad.status, 400);
  expectProblem(bad.json, { status: 400, code: "VALIDATION_ERROR" });
});

test("DELETE cart item and clear cart", async () => {
  const added = await addProduct(2);
  const itemId = added.cart.items[0].itemId;
  const cartId = added.cart.id;

  const removed = await request("DELETE", `${API}/cart/items/${itemId}`);
  assert.equal(removed.status, 200);
  assert.equal(removed.json.cart.items.length, 0);

  const readded = await addProduct(1);
  assert.equal(readded.cart.id, cartId);

  const cleared = await request("DELETE", `${API}/cart`);
  assert.equal(cleared.status, 200);
  assert.equal(cleared.json.cart.id, cartId);
  assert.equal(cleared.json.cart.items.length, 0);
  assert.equal(cleared.json.cart.totals.total, 0);
  assert.equal(cleared.json.cart.totals.discount, 0);
});

test("DELETE unknown cart item returns CART_ITEM_NOT_FOUND", async () => {
  await addProduct(1);
  const missing = await request(
    "DELETE",
    `${API}/cart/items/00000000-0000-4000-8000-000000000099`
  );
  assert.equal(missing.status, 404);
  expectProblem(missing.json, { status: 404, code: "CART_ITEM_NOT_FOUND" });
});

test("idempotency conflict on same key with different payload", async () => {
  const key = "idem-conflict";
  const first = await request("POST", `${API}/cart/add`, {
    headers: { "Idempotency-Key": key },
    body: { productId: "acme-wh-001", quantity: 1 },
  });
  assert.equal(first.status, 200);

  const conflict = await request("POST", `${API}/cart/add`, {
    headers: { "Idempotency-Key": key },
    body: { productId: "acme-wh-001", quantity: 2 },
  });
  assert.equal(conflict.status, 409);
  expectProblem(conflict.json, {
    status: 409,
    code: "IDEMPOTENCY_KEY_CONFLICT",
  });
});

test("expired idempotency record allows reuse", async () => {
  const { idempotencyStore } = await import("../src/idempotency.js");
  const key = "idem-expired";
  const first = await request("POST", `${API}/cart/add`, {
    headers: { "Idempotency-Key": key },
    body: { productId: "acme-wh-001", quantity: 1 },
  });
  assert.equal(first.status, 200);

  const record = idempotencyStore.get(`anonymous:${key}`);
  assert.ok(record);
  record.expiresAt = new Date(Date.now() - 1000).toISOString();

  const second = await request("POST", `${API}/cart/add`, {
    headers: { "Idempotency-Key": key },
    body: { productId: "acme-wh-001", quantity: 2 },
  });
  assert.equal(second.status, 200);
  assert.equal(second.json.cart.items[0].quantity, 3);
});

test("typed filters and legacy totals without discount", async () => {
  const search = await request("POST", `${API}/products/search`, {
    body: {
      filters: {
        brand: "Acme",
        categories: ["Headphones"],
        priceRange: { min: 90, max: 210 },
      },
    },
  });
  assert.equal(search.status, 200);
  assert.equal(search.json.pagination.totalItems, 2);

  const added = await request("POST", `${API}/cart/add`, {
    body: { productId: "acme-wh-002", quantity: 1 },
  });
  assert.equal(added.status, 200);
  assert.equal(added.json.cart.totals.subtotal, 99.99);
  assert.equal(added.json.cart.totals.shipping, 10);
  assert.equal(added.json.cart.totals.tax, 10);
  assert.equal(added.json.cart.totals.total, 119.99);
  assert.ok(added.json.cart.totals.taxBreakdown);
});

test("discount apply and invalid code", async () => {
  await request("POST", `${API}/cart/add`, {
    body: { productId: "acme-wh-002", quantity: 1 },
  });
  const applied = await request("POST", `${API}/cart/discount`, {
    body: { code: "SAVE10" },
  });
  assert.equal(applied.status, 200);
  assert.equal(applied.json.cart.totals.discount, 10);

  const bad = await request("POST", `${API}/cart/discount`, {
    body: { code: "NOPE" },
  });
  assert.equal(bad.status, 422);
  expectProblem(bad.json, { status: 422, code: "INVALID_DISCOUNT_CODE" });
});

test("detect exposes capabilities at 1.0.0", async () => {
  const { status, json } = await request("GET", `${API}/detect`);
  assert.equal(status, 200);
  assert.equal(json.specVersion, "1.0.0");
  assert.ok(json.capabilities?.shipping?.options?.includes("express"));
  assert.ok(json.supportedFeatures.includes("discounts"));
});

test("shipping options endpoint", async () => {
  const { status, json } = await request("GET", `${API}/shipping/options`);
  assert.equal(status, 200);
  assert.equal(json.currency, "USD");
  assert.ok(json.options.some((option) => option.id === "standard"));
});

test("idempotent replay sets Idempotency-Replayed header", async () => {
  const key = "idem-header-test";
  const first = await request("POST", `${API}/cart/add`, {
    headers: { "Idempotency-Key": key },
    body: { productId: "acme-wh-001", quantity: 1 },
  });
  assert.equal(first.status, 200);

  const replay = await request("POST", `${API}/cart/add`, {
    headers: { "Idempotency-Key": key },
    body: { productId: "acme-wh-001", quantity: 1 },
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.headers["idempotency-replayed"], "true");
});
