import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import app, { resetDemoState } from "../../src/server.js";
import { FastBuyJSONAdapter } from "../dist/adapter.js";

let server;
let baseUrl;

before(async () => {
  resetDemoState();
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}/api/fastbuyjson`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

test("adapter completes demo commerce flow against in-process server", async () => {
  resetDemoState();
  const adapter = new FastBuyJSONAdapter(baseUrl);

  const detect = await adapter.detectSupport(baseUrl.replace("/api/fastbuyjson", ""));
  assert.equal(detect.supported, true);

  const search = await adapter.searchProducts({
    query: "headphones",
    filters: { priceRange: { max: 200 } },
    sort: "price_asc",
    page: 1,
    pageSize: 5,
  });
  assert.ok(search.results?.length > 0);

  const product = search.results[0];
  const added = await adapter.addToCart({
    productId: product.id,
    quantity: 1,
    options: { color: "black" },
  });
  const cartId = added.cart?.id;
  assert.ok(cartId);

  const cart = await adapter.getCart();
  assert.equal(cart.cart.id, cartId);

  const checkout = await adapter.initiateCheckout({
    cartId,
    customerInfo: {
      email: "test@example.com",
      phone: "+1-555-0123",
      firstName: "Jane",
      lastName: "Doe",
    },
    shippingAddress: {
      line1: "123 Test Street",
      city: "Test City",
      state: "CA",
      postalCode: "12345",
      country: "US",
    },
  });
  assert.ok(checkout.sessionToken);

  const confirmed = await adapter.confirmCheckout({
    sessionToken: checkout.sessionToken,
    paymentDetails: {
      method: "credit_card",
      cardDetails: { lastFourDigits: "1234", brand: "Visa" },
      transactionVerification: {
        verificationMethod: "email_confirmation",
        verificationToken: checkout.verificationToken,
        verificationTimestamp: new Date().toISOString(),
      },
    },
  });
  assert.ok(confirmed.orderId);

  const status = await adapter.getOrderStatus(confirmed.orderId);
  assert.equal(status.order.id, confirmed.orderId);
});
