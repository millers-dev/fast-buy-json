/**
 * FastBuyJSON Demo Server
 *
 * Express.js implementation of the FastBuyJSON e-commerce API standard.
 * This server provides endpoints for product search, cart management, and checkout.
 */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { v4 as uuidv4 } from "uuid";
import { pathToFileURL } from "node:url";
import {
  authenticateUser,
  generateTokens,
  refreshAccessToken,
  verifyCertificate,
  optionalJwtMiddleware,
} from "./auth.js";

// Mock database
const db = {
  products: [
    {
      id: "acme-wh-001",
      name: "ACME Wireless Headphones Pro",
      brand: "Acme",
      description: "Premium wireless headphones with noise cancellation",
      price: {
        amount: 199.99,
        currency: "USD",
      },
      availability: {
        status: "in_stock",
        quantity: 42,
      },
      categories: ["Electronics", "Audio", "Headphones"],
      images: [
        {
          url: "https://example.com/images/acme-wh-001-main.jpg",
          alt: "ACME Wireless Headphones Pro - Black",
        },
      ],
      variants: [
        {
          id: "acme-wh-001-black",
          attributes: { color: "black" },
          price: { amount: 199.99, currency: "USD" },
        },
        {
          id: "acme-wh-001-white",
          attributes: { color: "white" },
          price: { amount: 199.99, currency: "USD" },
        },
      ],
    },
    {
      id: "acme-wh-002",
      name: "ACME Wireless Headphones Lite",
      brand: "Acme",
      description: "Lightweight wireless headphones for everyday use",
      price: {
        amount: 99.99,
        currency: "USD",
      },
      availability: {
        status: "in_stock",
        quantity: 78,
      },
      categories: ["Electronics", "Audio", "Headphones"],
      images: [
        {
          url: "https://example.com/images/acme-wh-002-main.jpg",
          alt: "ACME Wireless Headphones Lite - Silver",
        },
      ],
      variants: [
        {
          id: "acme-wh-002-silver",
          attributes: { color: "silver" },
          price: { amount: 99.99, currency: "USD" },
        },
        {
          id: "acme-wh-002-blue",
          attributes: { color: "blue" },
          price: { amount: 109.99, currency: "USD" },
        },
      ],
    },
  ],
  carts: {},
  orders: {},
};

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3000;

// Create router for API with standardized path
const apiRouter = express.Router();

const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : true;

app.use(express.json());
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  })
);
app.use(helmet());

app.use("/api/fastbuyjson", apiRouter);

const processedIdempotencyKeys = new Map();

function idempotencyMiddleware(req, res, next) {
  const idempotencyKey = req.headers["idempotency-key"];

  if (!idempotencyKey) {
    return next();
  }

  const cached = processedIdempotencyKeys.get(idempotencyKey);
  if (cached) {
    return res.status(cached.status).json(cached.body);
  }

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      processedIdempotencyKeys.set(idempotencyKey, {
        status: res.statusCode,
        body,
      });
    }
    return originalJson(body);
  };

  next();
}

function requestUserId(req) {
  return req.userId || "anonymous";
}

export function resetDemoState() {
  db.carts = {};
  db.orders = {};
  processedIdempotencyKeys.clear();
}

// Function to calculate risk score
function calculateRiskScore(customerInfo, shippingAddress, cart) {
  let score = 0;

  // Check order value
  const totalValue = cart.items.reduce(
    (sum, item) => sum + item.price.amount * item.quantity,
    0
  );
  if (totalValue > 1000) score += 30;
  else if (totalValue > 500) score += 15;
  else if (totalValue > 200) score += 5;

  // Check email domain reputation
  const emailDomain = customerInfo.email.split("@")[1];
  const highRiskDomains = ["tempmail.com", "mailinator.com", "throwaway.com"];
  if (highRiskDomains.includes(emailDomain)) score += 25;

  // Check for mismatch between email name and customer name (if provided)
  if (customerInfo.firstName && customerInfo.lastName) {
    const emailName = customerInfo.email.split("@")[0].toLowerCase();
    const customerName = (
      customerInfo.firstName + customerInfo.lastName
    ).toLowerCase();
    if (
      !emailName.includes(customerInfo.firstName.toLowerCase()) &&
      !emailName.includes(customerInfo.lastName.toLowerCase())
    ) {
      score += 10;
    }
  }

  // Check for unusual shipping address patterns
  if (shippingAddress.line1.toLowerCase().includes("po box")) score += 15;

  // Check for high-risk countries
  const highRiskCountries = ["XY", "ZZ"]; // Example fictional high-risk country codes
  if (highRiskCountries.includes(shippingAddress.country)) score += 20;

  // Return normalized score between 0-100
  return Math.min(Math.max(score, 0), 100);
}

// API Routes

/**
 * Authentication Endpoints
 */

/**
 * Login Endpoint
 * Authenticates a user and returns JWT tokens
 */
apiRouter.post("/auth/login", (req, res) => {
  const { username, password } = req.body;

  // Validate required fields
  if (!username || !password) {
    return res.status(400).json({
      error: "Missing required fields",
      required: ["username", "password"],
    });
  }

  // Authenticate user
  const user = authenticateUser(username, password);
  if (!user) {
    return res.status(401).json({
      error: "Authentication failed",
      message: "Invalid username or password",
    });
  }

  // Generate tokens
  const tokens = generateTokens(user);

  res.json({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    token_type: tokens.tokenType,
    expires_in: tokens.expiresIn,
  });
});

/**
 * Token Refresh Endpoint
 * Refreshes an expired JWT token
 */
apiRouter.post("/auth/refresh", (req, res) => {
  const { refresh_token } = req.body;

  // Validate required fields
  if (!refresh_token) {
    return res.status(400).json({
      error: "Missing required fields",
      required: ["refresh_token"],
    });
  }

  // Refresh token
  const result = refreshAccessToken(refresh_token);
  if (!result) {
    return res.status(401).json({
      error: "Invalid refresh token",
      message: "Token may be expired or invalid",
    });
  }

  res.json({
    access_token: result.accessToken,
    token_type: result.tokenType,
    expires_in: result.expiresIn,
  });
});

/**
 * Certificate Verification Endpoint
 * Verifies a client certificate and returns a session ID
 */
apiRouter.post("/auth/certificate", (req, res) => {
  const { certificate } = req.body;

  // Validate required fields
  if (!certificate) {
    return res.status(400).json({
      error: "Missing required fields",
      required: ["certificate"],
    });
  }

  // Verify certificate
  const result = verifyCertificate(certificate);
  if (!result) {
    return res.status(401).json({
      error: "Certificate verification failed",
      message: "Invalid or expired certificate",
    });
  }

  res.json({
    session_id: result.sessionId,
    expires_in: result.expiresIn,
  });
});

/**
 * Detect FastBuyJSON Support Endpoint
 * Allows AI agents to detect if a website supports the FastBuyJSON standard
 */
apiRouter.get("/detect", (req, res) => {
  res.json({
    standard: "FastBuyJSON 1.0.0",
    implementationVersion: "0.1.0",
    supportedFeatures: [
      "idempotency",
      "pagination",
      "schema_validation",
      "authentication",
      "anonymous_cart",
      "guest_checkout",
    ],
    endpoints: ["products", "cart", "checkout", "orders", "auth"],
    authentication: {
      methods: ["jwt", "certificate", "anonymous"],
      endpoints: ["/auth/login", "/auth/refresh", "/auth/certificate"],
    },
    checkout: {
      methods: ["registered_user", "guest_checkout"],
      verification: ["email", "phone", "credit_card"],
    },
    merchantInfo: {
      name: "FastBuyJSON Demo Store",
      url: "https://example.com",
    },
  });
});

/**
 * Product Search Endpoint
 * Accepts search parameters and returns matching products
 */
apiRouter.post("/products/search", (req, res) => {
  const { query, filters, sort, page = 1, pageSize = 10 } = req.body;

  let results = [...db.products];

  // Apply text search if query is provided
  if (query) {
    const searchTerm = query.toLowerCase();
    results = results.filter(
      (product) =>
        product.name.toLowerCase().includes(searchTerm) ||
        product.description.toLowerCase().includes(searchTerm) ||
        product.brand.toLowerCase().includes(searchTerm)
    );
  }

  // Apply filters
  if (filters) {
    if (filters.brand) {
      results = results.filter(
        (product) => product.brand.toLowerCase() === filters.brand.toLowerCase()
      );
    }

    // Add more filter handling as needed
  }

  if (sort) {
    switch (sort) {
      case "price_asc":
        results.sort((a, b) => a.price.amount - b.price.amount);
        break;
      case "price_desc":
        results.sort((a, b) => b.price.amount - a.price.amount);
        break;
      case "name_asc":
        results.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "name_desc":
        results.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case "newest":
        results.sort((a, b) => b.id.localeCompare(a.id));
        break;
      case "relevance":
        break;
      default: {
        const _exhaustive = sort;
        void _exhaustive;
        break;
      }
    }
  }

  // Apply pagination
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedResults = results.slice(startIndex, endIndex);

  res.json({
    results: paginatedResults,
    pagination: {
      currentPage: page,
      pageSize: pageSize,
      totalItems: results.length,
      totalPages: Math.ceil(results.length / pageSize),
    },
  });
});

/**
 * Add to Cart Endpoint
 * Adds a product to the user's cart
 */
apiRouter.post("/cart/add", optionalJwtMiddleware, idempotencyMiddleware, (req, res) => {
  const { productId, quantity = 1, options = {} } = req.body;

  const product = db.products.find((p) => p.id === productId);
  if (!product) {
    return res.status(404).json({
      error: "Product not found",
      productId,
    });
  }

  const userId = requestUserId(req);

  if (!db.carts[userId]) {
    db.carts[userId] = {
      id: uuidv4(),
      items: [],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      totals: {
        subtotal: 0,
        tax: 0,
        shipping: 0,
        total: 0,
      },
    };
  }

  const cart = db.carts[userId];

  // Check if item already exists in cart
  const existingItemIndex = cart.items.findIndex(
    (item) =>
      item.productId === productId &&
      JSON.stringify(item.options) === JSON.stringify(options)
  );

  if (existingItemIndex >= 0) {
    // Update quantity if item exists
    cart.items[existingItemIndex].quantity += quantity;
  } else {
    // Add new item if it doesn't exist
    let variant = product;

    // Check for variant if options are provided
    if (options.color && product.variants) {
      const matchingVariant = product.variants.find(
        (v) => v.attributes.color === options.color
      );

      if (matchingVariant) {
        variant = {
          ...product,
          id: matchingVariant.id,
          price: matchingVariant.price,
        };
      }
    }

    cart.items.push({
      productId: variant.id,
      name: product.name,
      quantity,
      options,
      price: variant.price,
      lineTotal: {
        amount: variant.price.amount * quantity,
        currency: variant.price.currency,
      },
    });
  }

  // Recalculate cart totals
  cart.updated = new Date().toISOString();
  cart.totals.subtotal = cart.items.reduce(
    (sum, item) => sum + item.lineTotal.amount,
    0
  );
  cart.totals.tax = cart.totals.subtotal * 0.1; // Example 10% tax
  cart.totals.shipping = cart.totals.subtotal > 100 ? 0 : 10; // Free shipping over $100
  cart.totals.total =
    cart.totals.subtotal + cart.totals.tax + cart.totals.shipping;

  res.json({
    cart,
    message: "Item added to cart successfully",
  });
});

/**
 * Get Cart Endpoint
 * Retrieves the current state of the user's cart
 */
apiRouter.get("/cart", optionalJwtMiddleware, (req, res) => {
  const userId = requestUserId(req);

  if (!db.carts[userId]) {
    return res.status(404).json({
      error: "Cart not found",
      userId,
    });
  }

  res.json({
    cart: db.carts[userId],
  });
});
/**
 * Get Cart by ID
 * Retrieves a cart by its cartId. Searches all stored carts and returns the match.
 */
apiRouter.get("/cart/:cartId", optionalJwtMiddleware, (req, res) => {
  const { cartId } = req.params;
  const userId = requestUserId(req);
  const ownedCart = db.carts[userId];

  if (ownedCart && ownedCart.id === cartId) {
    return res.json({ cart: ownedCart });
  }

  return res.status(404).json({ error: "Cart not found", cartId });
});

/**
 * Checkout - Initiate Endpoint
 * Starts the checkout process with shipping and billing information
 */
apiRouter.post("/checkout/initiate", optionalJwtMiddleware, (req, res) => {
  const { cartId, shippingAddress, billingAddress, customerInfo } = req.body;
  const userId = requestUserId(req);

  // Validate cart exists
  if (!db.carts[userId] || db.carts[userId].id !== cartId) {
    return res.status(404).json({
      error: "Cart not found",
      cartId,
    });
  }

  // Validate customer info (accept 'phone' or legacy 'phoneNumber')
  if (!customerInfo || !customerInfo.email) {
    return res
      .status(400)
      .json({ error: "Customer email and phone number are required" });
  }

  // Normalize phone field
  const phoneValue = customerInfo.phone || customerInfo.phoneNumber;
  if (!phoneValue) {
    return res
      .status(400)
      .json({ error: "Customer email and phone number are required" });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(customerInfo.email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  // Validate phone number format
  const phoneRegex = /^\+?[0-9\s\-\(\)]{8,20}$/;
  if (!phoneRegex.test(phoneValue)) {
    return res.status(400).json({ error: "Invalid phone number format" });
  }

  // Store normalized phone back
  customerInfo.phone = phoneValue;

  // Validate addresses
  if (
    !shippingAddress ||
    !shippingAddress.line1 ||
    !shippingAddress.city ||
    !shippingAddress.country ||
    !shippingAddress.postalCode
  ) {
    return res.status(400).json({
      error: "Invalid shipping address",
      required: ["line1", "city", "country", "postalCode"],
    });
  }

  const sessionToken = uuidv4();
  const verificationToken = uuidv4();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 1);

  const riskScore = calculateRiskScore(
    customerInfo,
    shippingAddress,
    db.carts[userId]
  );

  db.carts[userId].checkoutSession = {
    sessionToken,
    verificationToken,
    expiresAt: expiresAt.toISOString(),
    shippingAddress,
    billingAddress: billingAddress || shippingAddress,
    customerInfo,
    riskAssessment: {
      score: riskScore,
      verificationRequired: true,
    },
  };

  res.json({
    sessionToken,
    verificationToken,
    expiresAt: expiresAt.toISOString(),
    cart: db.carts[userId],
    riskAssessment: db.carts[userId].checkoutSession.riskAssessment,
  });
});

/**
 * Checkout - Confirm Endpoint
 * Completes the checkout process and creates an order
 */
apiRouter.post("/checkout/confirm", optionalJwtMiddleware, (req, res) => {
  const { sessionToken, paymentDetails } = req.body;
  const userId = requestUserId(req);

  // Validate session
  if (
    !db.carts[userId] ||
    !db.carts[userId].checkoutSession ||
    db.carts[userId].checkoutSession.sessionToken !== sessionToken
  ) {
    return res.status(400).json({
      error: "Invalid checkout session",
      sessionToken,
    });
  }

  // Check if session is expired
  const expiresAt = new Date(db.carts[userId].checkoutSession.expiresAt);
  if (expiresAt < new Date()) {
    return res.status(400).json({
      error: "Checkout session expired",
      sessionToken,
    });
  }

  // Validate payment details (simplified for demo)
  if (!paymentDetails || !paymentDetails.method) {
    return res.status(400).json({
      error: "Invalid payment details",
      required: ["method"],
    });
  }

  // Reject cash on delivery payments
  if (paymentDetails.method === "cash_on_delivery") {
    return res.status(400).json({
      error: "Cash on delivery payments are not supported",
    });
  }

  // Validate transaction verification
  if (
    !paymentDetails.transactionVerification ||
    !paymentDetails.transactionVerification.verificationMethod ||
    !paymentDetails.transactionVerification.verificationToken
  ) {
    return res.status(400).json({
      error: "Transaction verification is required",
      required: ["verificationMethod", "verificationToken"],
    });
  }

  // Check verification method and token
  const validVerificationMethods = [
    "captcha",
    "email_confirmation",
    "sms_confirmation",
    "payment_provider_token",
    "oauth_token",
  ];

  if (
    !validVerificationMethods.includes(
      paymentDetails.transactionVerification.verificationMethod
    )
  ) {
    return res.status(400).json({
      error: "Invalid verification method",
      validMethods: validVerificationMethods,
    });
  }

  // For high-risk orders, require stronger verification
  const riskScore = db.carts[userId].checkoutSession.riskAssessment?.score || 0;
  if (
    riskScore > 50 &&
    !["sms_confirmation", "payment_provider_token"].includes(
      paymentDetails.transactionVerification.verificationMethod
    )
  ) {
    return res.status(400).json({
      error: "This order requires stronger verification due to risk assessment",
      requiredMethods: ["sms_confirmation", "payment_provider_token"],
      riskScore,
    });
  }

  const expectedToken = db.carts[userId].checkoutSession.verificationToken;
  const providedToken =
    paymentDetails.transactionVerification.verificationToken;
  if (!expectedToken || providedToken !== expectedToken) {
    return res.status(400).json({
      error: "Invalid verification token",
    });
  }

  // Create order
  const orderId = uuidv4();
  const order = {
    id: orderId,
    userId,
    status: "confirmed",
    items: db.carts[userId].items,
    totals: db.carts[userId].totals,
    customerInfo: db.carts[userId].checkoutSession.customerInfo,
    shippingAddress: db.carts[userId].checkoutSession.shippingAddress,
    billingAddress: db.carts[userId].checkoutSession.billingAddress,
    payment: {
      method: paymentDetails.method,
      status: "approved",
      verificationMethod:
        paymentDetails.transactionVerification.verificationMethod,
      verificationTimestamp:
        paymentDetails.transactionVerification.verificationTimestamp ||
        new Date().toISOString(),
      lastFourDigits: paymentDetails.cardDetails?.lastFourDigits,
      brand: paymentDetails.cardDetails?.brand,
    },
    riskAssessment: db.carts[userId].checkoutSession.riskAssessment,
    created: new Date().toISOString(),
    fraudCheck: {
      status: "passed",
      score: db.carts[userId].checkoutSession.riskAssessment?.score || 0,
      timestamp: new Date().toISOString(),
    },
  };

  // Store order
  db.orders[orderId] = order;

  // Clear cart
  delete db.carts[userId];

  res.json({
    order,
    orderId: orderId, // Explicitly include orderId for easy reference
    orderStatusUrl: `/api/fastbuyjson/orders/${orderId}`, // Include URL for status checks
    message: "Order confirmed successfully",
  });
});

/**
 * Order Status Endpoint
 * Retrieves the current state of an order
 */
apiRouter.get("/orders/:orderId", optionalJwtMiddleware, (req, res) => {
  const { orderId } = req.params;
  const userId = requestUserId(req);
  const order = db.orders[orderId];

  if (!order || order.userId !== userId) {
    return res.status(404).json({
      error: "Order not found",
      orderId,
    });
  }

  res.json({
    order,
  });
});

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  app.listen(PORT, () => {
    console.log(`FastBuyJSON demo server running at http://localhost:${PORT}`);
    console.log(`API is available at http://localhost:${PORT}/api/fastbuyjson`);
  });
}

export default app;
