#!/usr/bin/env node
/**
 * FastBuyJSON MCP Server Test Script
 *
 * Tests the HTTP adapter against a running demo API.
 */

import { FastBuyJSONAdapter } from "./dist/adapter.js";

async function runTests() {
  console.log("🧪 FastBuyJSON MCP Server Tests");
  console.log("=================================\n");

  const adapter = new FastBuyJSONAdapter(
    process.env.FASTBUYJSON_API_URL || "http://localhost:3000/api/fastbuyjson"
  );

  try {
    // Test 1: Detect Support
    console.log("1️⃣ Testing FastBuyJSON detection...");
    const detectResult = await adapter.detectSupport("http://localhost:3000");
    console.log("✅ Detection result:", JSON.stringify(detectResult, null, 2));
    console.log();

    // Test 2: Search Products
    console.log("2️⃣ Testing product search...");
    const searchResult = await adapter.searchProducts({
      query: "headphones",
      sort: "price_asc",
      page: 1,
      pageSize: 5,
    });
    console.log("✅ Search result:", JSON.stringify(searchResult, null, 2));
    console.log();

    // Test 3: Add to Cart
    if (searchResult.results && searchResult.results.length > 0) {
      console.log("3️⃣ Testing add to cart...");
      const product = searchResult.results[0];
      const cartResult = await adapter.addToCart({
        productId: product.id,
        quantity: 1,
        options: { color: "black" },
      });
      console.log(
        "✅ Add to cart result:",
        JSON.stringify(cartResult, null, 2)
      );
      console.log();

      const cartId = cartResult.cart?.id;

      // Test 4: Get Cart
      console.log("4️⃣ Testing get cart...");
      const getCartResult = await adapter.getCart();
      console.log(
        "✅ Get cart result:",
        JSON.stringify(getCartResult, null, 2)
      );
      console.log();

      // Test 5: Get Cart by ID
      if (cartId) {
        console.log("5️⃣ Testing get cart by ID...");
        const getCartByIdResult = await adapter.getCart(cartId);
        console.log(
          "✅ Get cart by ID result:",
          JSON.stringify(getCartByIdResult, null, 2)
        );
        console.log();

        // Test 6: Initiate Checkout
        console.log("6️⃣ Testing checkout initiation...");
        const checkoutInitResult = await adapter.initiateCheckout({
          cartId: cartId,
          customerInfo: {
            email: "test@example.com",
            phone: "+1-555-0123",
            firstName: "John",
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
        console.log(
          "✅ Checkout initiation result:",
          JSON.stringify(checkoutInitResult, null, 2)
        );
        console.log();

        const sessionToken = checkoutInitResult.sessionToken;

        // Test 7: Confirm Checkout
        if (sessionToken) {
          console.log("7️⃣ Testing checkout confirmation...");
          const confirmResult = await adapter.confirmCheckout({
            sessionToken: sessionToken,
            paymentDetails: {
              method: "credit_card",
              cardDetails: {
                lastFourDigits: "1234",
                brand: "Visa",
              },
              transactionVerification: {
                verificationMethod: "email_confirmation",
                verificationToken: "test-verification-123",
                verificationTimestamp: new Date().toISOString(),
              },
            },
          });
          console.log(
            "✅ Checkout confirmation result:",
            JSON.stringify(confirmResult, null, 2)
          );
          console.log();

          const orderId = confirmResult.orderId;

          // Test 8: Get Order Status
          if (orderId) {
            console.log("8️⃣ Testing order status...");
            const orderStatusResult = await adapter.getOrderStatus(orderId);
            console.log(
              "✅ Order status result:",
              JSON.stringify(orderStatusResult, null, 2)
            );
            console.log();
          }
        }
      }
    }

    console.log("🎉 All tests completed successfully!");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

runTests();
