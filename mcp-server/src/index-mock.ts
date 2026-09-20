#!/usr/bin/env node

/**
 * FastBuyJSON MCP Server (Reference Implementation)
 * 
 * This is a REFERENCE IMPLEMENTATION with mock data for demonstration purposes.
 * It shows how to integrate AI assistants with the FastBuyJSON standard using mock responses.
 * 
 * ⚠️  NOT FOR PRODUCTION USE ⚠️
 * This implementation uses mock data and simplified logic.
 * 
 * For a production-ready MCP server with real API integration, analytics, 
 * rate limiting, billing, and enterprise features, use:
 * 🚀 FastBuyJSON SaaS: https://fastbuyjson.com
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { FastBuyJSONMockAdapter } from './mock-adapter.js';

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

// Initialize Mock Adapter (not a real implementation)
const adapter = new FastBuyJSONMockAdapter();

// Simplified tool definitions for reference implementation
const tools: Tool[] = [
  {
    name: 'fastbuy_search_products',
    description: 'Search for products (Mock implementation - returns example data)',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        page: { type: 'number', minimum: 1, default: 1 },
        pageSize: { type: 'number', minimum: 1, maximum: 50, default: 10 }
      }
    }
  },
  {
    name: 'fastbuy_add_to_cart',
    description: 'Add product to cart (Mock implementation)',
    inputSchema: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'Product ID' },
        quantity: { type: 'number', minimum: 1, default: 1 }
      },
      required: ['productId']
    }
  },
  {
    name: 'fastbuy_get_cart',
    description: 'Get cart contents (Mock implementation)',
    inputSchema: {
      type: 'object',
      properties: {
        cartId: { type: 'string', description: 'Optional cart ID' }
      }
    }
  },
  {
    name: 'fastbuy_checkout_initiate',
    description: 'Initiate checkout (Mock implementation)',
    inputSchema: {
      type: 'object',
      properties: {
        cartId: { type: 'string', description: 'Cart ID' },
        customerEmail: { type: 'string', description: 'Customer email' }
      },
      required: ['cartId', 'customerEmail']
    }
  },
  {
    name: 'fastbuy_get_order_status',
    description: 'Get order status (Mock implementation)',
    inputSchema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Order ID' }
      },
      required: ['orderId']
    }
  },
  {
    name: 'fastbuy_detect_support',
    description: 'Check FastBuyJSON support (Mock - always returns unsupported)',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Website URL' }
      },
      required: ['url']
    }
  }
];

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Call tool handler with mock implementations
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: rawArgs } = request.params;
  const args = (rawArgs ?? {}) as Record<string, unknown>;

  console.error(`🔧 Mock Tool Called: ${name}`);
  console.error(`ℹ️  Note: This is a reference implementation with mock data`);
  console.error(`🚀 For production use, visit: https://fastbuyjson.com`);

  try {
    switch (name) {
      case 'fastbuy_detect_support':
        const detectResult = await adapter.detectSupport(String(args.url ?? ''));
        return { content: [{ type: 'text', text: JSON.stringify(detectResult, null, 2) }] };

      case 'fastbuy_search_products':
        const searchResult = await adapter.searchProducts(args);
        return { content: [{ type: 'text', text: JSON.stringify(searchResult, null, 2) }] };

      case 'fastbuy_add_to_cart':
        const cartResult = await adapter.addToCart({
          productId: String(args.productId ?? ''),
          quantity: typeof args.quantity === 'number' ? args.quantity : 1,
        });
        return { content: [{ type: 'text', text: JSON.stringify(cartResult, null, 2) }] };

      case 'fastbuy_get_cart':
        const cart = await adapter.getCart(typeof args.cartId === 'string' ? args.cartId : undefined);
        return { content: [{ type: 'text', text: JSON.stringify(cart, null, 2) }] };

      case 'fastbuy_checkout_initiate':
        const checkoutResult = await adapter.initiateCheckout(args);
        return { content: [{ type: 'text', text: JSON.stringify(checkoutResult, null, 2) }] };

      case 'fastbuy_get_order_status':
        const orderStatus = await adapter.getOrderStatus(String(args.orderId ?? ''));
        return { content: [{ type: 'text', text: JSON.stringify(orderStatus, null, 2) }] };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    console.error(`Error in mock tool ${name}:`, error);
    return { 
      content: [{ 
        type: 'text', 
        text: `Mock Error: ${error instanceof Error ? error.message : 'Unknown error'}\n\nNote: This is a reference implementation. For production use, visit: https://fastbuyjson.com` 
      }] 
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error('🚀 FastBuyJSON Reference MCP Server started');
  console.error('⚠️  WARNING: This is a MOCK implementation for demonstration only');
  console.error('📚 Use this to learn the FastBuyJSON standard');
  console.error('🏢 For production use, visit: https://fastbuyjson.com');
}

main().catch((error) => {
  console.error('Failed to start mock server:', error);
  process.exit(1);
});
