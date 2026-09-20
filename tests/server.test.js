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
  return { status: response.status, json };
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
  const { status } = await request("GET", `${API}/cart`, {
    headers: { Authorization: "Bearer not-a-jwt" },
  });
  assert.equal(status, 401);
});
