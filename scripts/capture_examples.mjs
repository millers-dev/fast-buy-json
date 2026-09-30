#!/usr/bin/env node
/**
 * Capture canonical response examples from the in-process Node demo server.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import app, { resetDemoState } from "../src/server.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "examples", "responses");
const MANIFEST_PATH = join(OUT_DIR, "manifest.json");

const API = "/api/fastbuyjson";
const CANON = {
  accessToken: "canonical-access-token",
  refreshToken: "canonical-refresh-token",
  cartId: "00000000-0000-4000-8000-000000000001",
  itemId: "00000000-0000-4000-8000-000000000002",
  sessionToken: "00000000-0000-4000-8000-000000000003",
  verificationToken: "00000000-0000-4000-8000-000000000004",
  orderId: "00000000-0000-4000-8000-000000000005",
  timestamp: "2024-01-15T12:00:00.000Z",
};

const TOKEN_KEYS = new Set([
  "access_token",
  "refresh_token",
  "sessionToken",
  "verificationToken",
]);
const UUID_KEYS = new Set(["id", "itemId", "cartId", "orderId"]);
const TIME_KEYS = new Set(["created", "updated", "expiresAt", "verificationTimestamp"]);

function canonicalize(value, key = "") {
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalize(item, String(index)));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = canonicalize(v, k);
    }
    return out;
  }
  if (typeof value === "string") {
    if (TOKEN_KEYS.has(key)) {
      if (key === "access_token") return CANON.accessToken;
      if (key === "refresh_token") return CANON.refreshToken;
      if (key === "sessionToken") return CANON.sessionToken;
      if (key === "verificationToken") return CANON.verificationToken;
    }
    if (UUID_KEYS.has(key) && /^[0-9a-f-]{36}$/i.test(value)) {
      if (key === "itemId") return CANON.itemId;
      if (key === "orderId") return CANON.orderId;
      return CANON.cartId;
    }
    if (TIME_KEYS.has(key) || /^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return CANON.timestamp;
    }
  }
  return value;
}

async function request(baseUrl, method, path, { body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${API}${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json();
  return { status: response.status, json };
}

function writeExample(filename, payload) {
  const path = join(OUT_DIR, filename);
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return filename;
}

async function captureFlow(baseUrl) {
  resetDemoState();
  const manifest = {};

  const detect = await request(baseUrl, "GET", "/detect");
  manifest["GET /detect"] = { 200: writeExample("detect-200.json", canonicalize(detect.json)) };

  const login = await request(baseUrl, "POST", "/auth/login", {
    body: { username: "demo", password: "password123" },
  });
  manifest["POST /auth/login"] = {
    200: writeExample("auth-login-200.json", canonicalize(login.json)),
  };
  const token = login.json.access_token;

  const search = await request(baseUrl, "POST", "/products/search", {
    body: { query: "headphones", page: 1, pageSize: 2 },
    headers: { Authorization: `Bearer ${token}` },
  });
  manifest["POST /products/search"] = {
    200: writeExample("product-search-200.json", canonicalize(search.json)),
  };

  const add = await request(baseUrl, "POST", "/cart/add", {
    body: { productId: "acme-wh-001", quantity: 1, options: { color: "black" } },
    headers: { Authorization: `Bearer ${token}` },
  });
  manifest["POST /cart/add"] = {
    200: writeExample("cart-add-200.json", canonicalize(add.json)),
  };
  const cartId = add.json.cart.id;

  const cart = await request(baseUrl, "GET", "/cart", {
    headers: { Authorization: `Bearer ${token}` },
  });
  manifest["GET /cart"] = { 200: writeExample("cart-get-200.json", canonicalize(cart.json)) };

  const shipping = await request(baseUrl, "GET", "/shipping/options", {
    headers: { Authorization: `Bearer ${token}` },
  });
  manifest["GET /shipping/options"] = {
    200: writeExample("shipping-options-200.json", canonicalize(shipping.json)),
  };

  const initiate = await request(baseUrl, "POST", "/checkout/initiate", {
    body: {
      cartId,
      customerInfo: {
        email: "customer@example.com",
        phone: "+49 30 12345678",
        firstName: "John",
        lastName: "Doe",
      },
      shippingAddress: {
        line1: "123 Main St",
        city: "Berlin",
        country: "DE",
        postalCode: "10115",
      },
    },
    headers: { Authorization: `Bearer ${token}` },
  });
  manifest["POST /checkout/initiate"] = {
    200: writeExample("checkout-initiate-200.json", canonicalize(initiate.json)),
  };

  const confirm = await request(baseUrl, "POST", "/checkout/confirm", {
    body: {
      sessionToken: initiate.json.sessionToken,
      paymentDetails: {
        method: "credit_card",
        cardDetails: { lastFourDigits: "4242", brand: "Visa" },
        transactionVerification: {
          verificationMethod: "email_confirmation",
          verificationToken: initiate.json.verificationToken,
          verificationTimestamp: new Date().toISOString(),
        },
      },
    },
    headers: { Authorization: `Bearer ${token}` },
  });
  manifest["POST /checkout/confirm"] = {
    200: writeExample("checkout-confirm-200.json", canonicalize(confirm.json)),
  };

  const orderId = confirm.json.orderId;
  const order = await request(baseUrl, "GET", `/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  manifest[`GET /orders/{orderId}`] = {
    200: writeExample("order-status-200.json", canonicalize(order.json)),
  };

  const validation = await request(baseUrl, "POST", "/auth/login", {
    body: { username: "demo" },
  });
  manifest["POST /auth/login"]["400"] = writeExample(
    "auth-login-400.json",
    canonicalize(validation.json)
  );

  return manifest;
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  mkdirSync(OUT_DIR, { recursive: true });

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const manifest = await captureFlow(baseUrl);
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });

  const rendered = `${JSON.stringify(manifest, null, 2)}\n`;
  if (checkOnly) {
    const existing = readFileSync(MANIFEST_PATH, "utf8");
    if (existing !== rendered) {
      console.error("Response example drift; run: node scripts/capture_examples.mjs");
      process.exit(1);
    }
    console.log("Response examples are up to date.");
    return;
  }

  writeFileSync(MANIFEST_PATH, rendered, "utf8");
  console.log(`Wrote ${MANIFEST_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
