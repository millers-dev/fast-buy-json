#!/usr/bin/env node

/**
 * FastBuyJSON MCP Server (Reference Implementation)
 * 
 * Reference MCP server that talks to a FastBuyJSON HTTP API.
 * Point FASTBUYJSON_API_URL at the Node or Python demo server in this repo.
 *
 * Mock-only entry point: src/index-mock.ts
 * Commercial multi-tenant features: fast-buy-json-saas
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { FastBuyJSONAdapter } from './adapter.js';

// Initialize the MCP server
const server = new Server(
  {
    name: 'fastbuyjson-mcp-server-reference',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const adapter = new FastBuyJSONAdapter();

// Tool schemas for validation
const SearchProductsSchema = z.object({
  query: z.string().optional(),
  filters: z.object({
    brand: z.string().optional(),
    categories: z.array(z.string()).optional(),
    priceRange: z.object({
      min: z.number().optional(),
      max: z.number().optional(),
      currency: z.string().optional(),
    }).optional(),
    availability: z.array(z.string()).optional(),
    extensions: z.record(z.unknown()).optional(),
  }).optional(),
  sort: z.enum(['price_asc', 'price_desc', 'name_asc', 'name_desc', 'relevance', 'newest']).optional(),
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(100).default(10),
});

const AddToCartSchema = z.object({
  productId: z.string(),
  quantity: z.number().min(1).default(1),
  options: z.record(z.string()).optional(),
  extensions: z.record(z.unknown()).optional(),
});

const CheckoutInitiateSchema = z.object({
  cartId: z.string(),
  customerInfo: z.object({
    email: z.string().email(),
    phone: z.string(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
  }),
  shippingAddress: z.object({
    line1: z.string(),
    line2: z.string().optional(),
    city: z.string(),
    state: z.string().optional(),
    postalCode: z.string(),
    country: z.string(),
  }),
  billingAddress: z.object({
    line1: z.string(),
    line2: z.string().optional(),
    city: z.string(),
    state: z.string().optional(),
    postalCode: z.string(),
    country: z.string(),
  }).optional(),
  shippingOptionId: z.string().optional(),
  discountCode: z.string().optional(),
  extensions: z.record(z.unknown()).optional(),
});

const ApplyDiscountSchema = z.object({
  code: z.string().nullable().optional(),
});

const CheckoutConfirmSchema = z.object({
  sessionToken: z.string(),
  paymentDetails: z.object({
    method: z.enum(['credit_card', 'paypal', 'apple_pay', 'google_pay']),
    cardDetails: z.object({
      lastFourDigits: z.string().optional(),
      brand: z.string().optional(),
    }).optional(),
    transactionVerification: z.object({
      verificationMethod: z.enum([
        'captcha',
        'email_confirmation', 
        'sms_confirmation',
        'payment_provider_token',
        'oauth_token'
      ]),
      verificationToken: z.string(),
      verificationTimestamp: z.string().optional(),
    }),
  }),
});

const GetOrderStatusSchema = z.object({
  orderId: z.string(),
});

const NoArgsSchema = z.object({});

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

function parseLogin(args: unknown): { username: string; password: string } {
  const parsed = LoginSchema.safeParse(args);
  if (!parsed.success) {
    throw new Error('username and password are required strings');
  }
  return parsed.data;
}

const COMMERCE_REAUTH_HINT =
  'If the error is AUTHENTICATION_REQUIRED or INVALID_TOKEN, follow the error and do not call poll to recover.';

const CUSTOMER_POLL_DESCRIPTION = [
  'Poll the Shopify customer login started by fastbuy_customer_login_start. No arguments. The poll token stays in this process. The server does not sleep or retry.',
  'The connector poll row lives 10 minutes.',
  'status pending means call this tool again later. Do not call fastbuy_get_order_status while the login is pending.',
  'A 429 means wait and call this tool again. Do not start a second login while this poll token is still stored.',
  'After status complete, do not call this tool again. Call fastbuy_get_order_status for the order.',
  'If this tool reports that no login is in progress, do not call fastbuy_get_order_status and do not call this tool again. Run only the login tool the error names.',
  'A 401 means this attempt is finished. Do not call fastbuy_get_order_status to check it. Run fastbuy_customer_login_start again. Poll 401 is also the stop signal when expiresAt has passed.',
].join(' ');

const ORDER_STATUS_DESCRIPTION = [
  'Get the status and tracking information for an order.',
  'A result of AUTHENTICATION_REQUIRED or INVALID_TOKEN, or an error that says the session expired, means do not call this tool again and do not call fastbuy_customer_login_poll.',
  'Call fastbuy_auth_refresh only when the error names it. Call fastbuy_customer_login_start and then poll only when the error names customer login. Call fastbuy_login only when the error names it.',
  'Calling poll after this error does not recover a session. There is no poll token after a finished login, after local expiry, or after this 401.',
].join(' ');

// Define available tools
const tools: Tool[] = [
  {
    name: 'fastbuy_search_products',
    description: `Search for products in FastBuyJSON-compatible e-commerce stores. ${COMMERCE_REAUTH_HINT}`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for products',
        },
        filters: {
          type: 'object',
          properties: {
            brand: { type: 'string', description: 'Filter by brand' },
            categories: { type: 'array', items: { type: 'string' }, description: 'Match any category' },
            priceRange: {
              type: 'object',
              properties: {
                min: { type: 'number' },
                max: { type: 'number' },
                currency: { type: 'string' },
              },
            },
            availability: { type: 'array', items: { type: 'string' } },
          },
          description: 'Typed catalog filters',
        },
        sort: {
          type: 'string',
          enum: ['price_asc', 'price_desc', 'name_asc', 'name_desc', 'relevance', 'newest'],
          description: 'Sort order for results',
        },
        page: {
          type: 'number',
          minimum: 1,
          default: 1,
          description: 'Page number for pagination',
        },
        pageSize: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          default: 10,
          description: 'Number of results per page',
        },
      },
    },
  },
  {
    name: 'fastbuy_add_to_cart',
    description: `Add a product to the shopping cart. ${COMMERCE_REAUTH_HINT}`,
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'ID of the product to add to cart',
        },
        quantity: {
          type: 'number',
          minimum: 1,
          default: 1,
          description: 'Quantity of the product to add',
        },
        options: {
          type: 'object',
          description: 'Product options (e.g., color, size)',
        },
      },
      required: ['productId'],
    },
  },
  {
    name: 'fastbuy_get_cart',
    description: `Get the current cart contents. ${COMMERCE_REAUTH_HINT}`,
    inputSchema: {
      type: 'object',
      properties: {
        cartId: {
          type: 'string',
          description: 'Optional cart ID to retrieve specific cart',
        },
      },
    },
  },
  {
    name: 'fastbuy_checkout_initiate',
    description: `Initiate the checkout process with customer and shipping information. ${COMMERCE_REAUTH_HINT}`,
    inputSchema: {
      type: 'object',
      properties: {
        cartId: {
          type: 'string',
          description: 'ID of the cart to checkout',
        },
        customerInfo: {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email', description: 'Customer email' },
            phone: { type: 'string', description: 'Customer phone number' },
            firstName: { type: 'string', description: 'Customer first name' },
            lastName: { type: 'string', description: 'Customer last name' },
          },
          required: ['email', 'phone'],
          description: 'Customer information',
        },
        shippingAddress: {
          type: 'object',
          properties: {
            line1: { type: 'string', description: 'Address line 1' },
            line2: { type: 'string', description: 'Address line 2 (optional)' },
            city: { type: 'string', description: 'City' },
            state: { type: 'string', description: 'State/Province' },
            postalCode: { type: 'string', description: 'Postal/ZIP code' },
            country: { type: 'string', description: 'Country code' },
          },
          required: ['line1', 'city', 'postalCode', 'country'],
          description: 'Shipping address',
        },
        billingAddress: {
          type: 'object',
          properties: {
            line1: { type: 'string', description: 'Address line 1' },
            line2: { type: 'string', description: 'Address line 2 (optional)' },
            city: { type: 'string', description: 'City' },
            state: { type: 'string', description: 'State/Province' },
            postalCode: { type: 'string', description: 'Postal/ZIP code' },
            country: { type: 'string', description: 'Country code' },
          },
          description: 'Billing address (optional, uses shipping if not provided)',
        },
        shippingOptionId: {
          type: 'string',
          description: 'Shipping option id (standard or express)',
        },
        discountCode: {
          type: 'string',
          description: 'Optional promo code applied at checkout',
        },
      },
      required: ['cartId', 'customerInfo', 'shippingAddress'],
    },
  },
  {
    name: 'fastbuy_get_shipping_options',
    description: `List shipping options for the current cart context. ${COMMERCE_REAUTH_HINT}`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'fastbuy_apply_discount',
    description: `Apply or clear a promotional discount on the cart. ${COMMERCE_REAUTH_HINT}`,
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Promo code (omit or null to clear)',
        },
      },
    },
  },
  {
    name: 'fastbuy_checkout_confirm',
    description: `Confirm checkout and complete the order with payment details. ${COMMERCE_REAUTH_HINT}`,
    inputSchema: {
      type: 'object',
      properties: {
        sessionToken: {
          type: 'string',
          description: 'Session token from checkout initiation',
        },
        paymentDetails: {
          type: 'object',
          properties: {
            method: {
              type: 'string',
              enum: ['credit_card', 'paypal', 'apple_pay', 'google_pay'],
              description: 'Payment method',
            },
            cardDetails: {
              type: 'object',
              properties: {
                lastFourDigits: { type: 'string', description: 'Last 4 digits of card' },
                brand: { type: 'string', description: 'Card brand (Visa, Mastercard, etc.)' },
              },
              description: 'Card details (for credit card payments)',
            },
            transactionVerification: {
              type: 'object',
              properties: {
                verificationMethod: {
                  type: 'string',
                  enum: ['captcha', 'email_confirmation', 'sms_confirmation', 'payment_provider_token', 'oauth_token'],
                  description: 'Verification method used',
                },
                verificationToken: {
                  type: 'string',
                  description: 'Verification token/code',
                },
                verificationTimestamp: {
                  type: 'string',
                  description: 'Timestamp of verification',
                },
              },
              required: ['verificationMethod', 'verificationToken'],
              description: 'Transaction verification details',
            },
          },
          required: ['method', 'transactionVerification'],
          description: 'Payment details',
        },
      },
      required: ['sessionToken', 'paymentDetails'],
    },
  },
  {
    name: 'fastbuy_get_order_status',
    description: ORDER_STATUS_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {
        orderId: {
          type: 'string',
          description: 'ID of the order to check',
        },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'fastbuy_detect_support',
    description: 'Detect if a website supports FastBuyJSON standard',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Base URL of the e-commerce website to check',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'fastbuy_customer_login_start',
    description: 'Start Shopify customer login when GET /detect lists jwt and /auth/customer/start. Reference Node and Python demos do not advertise that route; use fastbuy_login for those. Show loginUrl and userCode to the user, and tell the user to continue in the browser only when the page shows the same code. The poll row lives 10 minutes. A poll 401 is the stop signal: run this tool again and do not keep polling. The next step is fastbuy_customer_login_poll. Do not ask the user for a poll token. A 429 RATE_LIMITED means wait and call this tool again. Do not call poll for the attempt that was limited. The server does not sleep or retry.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'fastbuy_customer_login_poll',
    description: CUSTOMER_POLL_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'fastbuy_login',
    description: 'Username and password login for the reference Node and Python demos. A Shopify customer session uses fastbuy_customer_login_start and fastbuy_customer_login_poll instead. The server does not sleep or retry.',
    inputSchema: {
      type: 'object',
      properties: {
        username: {
          type: 'string',
          description: 'Demo username',
        },
        password: {
          type: 'string',
          description: 'Demo password',
        },
      },
      required: ['username', 'password'],
    },
  },
  {
    name: 'fastbuy_auth_refresh',
    description: 'Exchange a stored refresh token at POST /auth/refresh. If no refresh token is stored, this tool does not call the network. The error names fastbuy_customer_login_start and fastbuy_customer_login_poll when GET /detect lists jwt and /auth/customer/start. The error names fastbuy_login when GET /detect lists /auth/login and does not list /auth/customer/start. Do not assume customer start. The server does not sleep or retry.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools,
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'fastbuy_search_products': {
        const validated = SearchProductsSchema.parse(args);
        const result = await adapter.searchProducts(validated);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'fastbuy_add_to_cart': {
        const validated = AddToCartSchema.parse(args);
        const result = await adapter.addToCart(validated);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'fastbuy_get_cart': {
        const { cartId } = args as { cartId?: string };
        const result = await adapter.getCart(cartId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'fastbuy_checkout_initiate': {
        const validated = CheckoutInitiateSchema.parse(args);
        const result = await adapter.initiateCheckout(validated);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'fastbuy_get_shipping_options': {
        const result = await adapter.getShippingOptions();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'fastbuy_apply_discount': {
        const validated = ApplyDiscountSchema.parse(args ?? {});
        const result = await adapter.applyDiscount(validated);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'fastbuy_checkout_confirm': {
        const validated = CheckoutConfirmSchema.parse(args);
        const result = await adapter.confirmCheckout(validated);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'fastbuy_get_order_status': {
        const validated = GetOrderStatusSchema.parse(args);
        const result = await adapter.getOrderStatus(validated.orderId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'fastbuy_detect_support': {
        const { url } = args as { url: string };
        const result = await adapter.detectSupport(url);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'fastbuy_customer_login_start': {
        NoArgsSchema.parse(args ?? {});
        const result = await adapter.customerLoginStart();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'fastbuy_customer_login_poll': {
        NoArgsSchema.parse(args ?? {});
        const result = await adapter.customerLoginPoll();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'fastbuy_login': {
        const validated = parseLogin(args);
        const result = await adapter.login(validated.username, validated.password);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'fastbuy_auth_refresh': {
        NoArgsSchema.parse(args ?? {});
        const result = await adapter.authRefresh();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('FastBuyJSON MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
