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
    category: z.string().optional(),
    minPrice: z.number().optional(),
    maxPrice: z.number().optional(),
  }).optional(),
  sort: z.enum(['price_asc', 'price_desc', 'name_asc', 'name_desc', 'relevance', 'newest']).optional(),
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(100).default(10),
});

const AddToCartSchema = z.object({
  productId: z.string(),
  quantity: z.number().min(1).default(1),
  options: z.record(z.string()).optional(),
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

// Define available tools
const tools: Tool[] = [
  {
    name: 'fastbuy_search_products',
    description: 'Search for products in FastBuyJSON-compatible e-commerce stores',
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
            category: { type: 'string', description: 'Filter by category' },
            minPrice: { type: 'number', description: 'Minimum price filter' },
            maxPrice: { type: 'number', description: 'Maximum price filter' },
          },
          description: 'Optional filters to apply to search',
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
    description: 'Add a product to the shopping cart',
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
    description: 'Get the current cart contents',
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
    description: 'Initiate the checkout process with customer and shipping information',
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
      },
      required: ['cartId', 'customerInfo', 'shippingAddress'],
    },
  },
  {
    name: 'fastbuy_checkout_confirm',
    description: 'Confirm checkout and complete the order with payment details',
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
    description: 'Get the status and tracking information for an order',
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
