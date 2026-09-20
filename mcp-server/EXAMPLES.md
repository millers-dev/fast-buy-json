# Examples of using FastBuyJSON MCP Server

This document provides practical examples of how to use the FastBuyJSON MCP Server with AI assistants like Claude.

## Basic Shopping Workflow

### 1. Detect FastBuyJSON Support

**Prompt to AI:**

```
Check if the website https://demo-store.example.com supports FastBuyJSON
```

**Expected response:**
The AI will use `fastbuy_detect_support` tool and report whether the site supports the standard.

### 2. Search for Products

**Prompt to AI:**

```
Search for "wireless headphones" under $150, sorted by price from low to high
```

**What happens:**

- AI calls `fastbuy_search_products` with parameters:
  - query: "wireless headphones"
  - filters: { maxPrice: 150 }
  - sort: "price_asc"

### 3. Add Product to Cart

**Prompt to AI:**

```
Add the ACME Wireless Headphones Pro in black color to my cart
```

**What happens:**

- AI identifies the product ID (e.g., "acme-wh-001-black") from previous search
- Calls `fastbuy_add_to_cart` with:
  - productId: "acme-wh-001-black"
  - quantity: 1
  - options: { color: "black" }

### 4. View Cart

**Prompt to AI:**

```
Show me what's in my cart
```

**What happens:**

- AI calls `fastbuy_get_cart`
- Displays items, quantities, prices, and totals

### 5. Checkout Process

**Prompt to AI:**

```
I want to checkout. My email is john@example.com, phone is +1-555-0123.
Ship to: 123 Main Street, Anytown, CA 90210, USA
```

**What happens:**

- AI calls `fastbuy_checkout_initiate` with customer and shipping info
- Returns session token and order summary

### 6. Complete Payment

**Prompt to AI:**

```
Complete the checkout using credit card payment. I received verification code "ABC123" via email.
```

**What happens:**

- AI calls `fastbuy_checkout_confirm` with:
  - sessionToken from previous step
  - paymentDetails with method "credit_card" and verification

### 7. Track Order

**Prompt to AI:**

```
Check the status of my order
```

**What happens:**

- AI uses the order ID from checkout confirmation
- Calls `fastbuy_get_order_status`
- Shows order status, tracking info, estimated delivery

## Advanced Examples

### Multi-Store Shopping

**Setup different stores:**

```
Set the FastBuyJSON API URL to https://store-a.com/api/fastbuyjson for electronics
```

**Switch between stores:**

```
Now search for books on https://bookstore.com/api/fastbuyjson
```

### Comparison Shopping

**Prompt to AI:**

```
Compare prices for "iPhone 15" across multiple stores that support FastBuyJSON
```

**What happens:**

- AI detects multiple FastBuyJSON stores
- Searches each store
- Compares prices and features

### Bulk Operations

**Prompt to AI:**

```
Add the following to my cart:
- 2x ACME Headphones in black
- 1x ACME Speaker in blue
- 3x USB cables
```

**What happens:**

- AI makes multiple `fastbuy_add_to_cart` calls
- Shows cart summary with all items

### Gift Purchases

**Prompt to AI:**

```
Checkout this cart as a gift. Ship to:
Jane Doe, 456 Oak Avenue, Portland, OR 97201, USA
Bill to my address: 123 Main St, Seattle, WA 98101, USA
```

**What happens:**

- AI uses separate shipping and billing addresses
- Handles gift message if supported

## Error Handling Examples

### Out of Stock

**Prompt to AI:**

```
Add 10 units of this limited edition product to cart
```

**AI Response:**
"I tried to add 10 units but only 3 are available. I've added 3 to your cart. Would you like to proceed or wait for restock?"

### Invalid Payment

**Prompt to AI:**

```
Complete checkout with invalid verification code
```

**AI Response:**
"The verification code was rejected. Please check your email/SMS for the correct code, or request a new one."

### Session Timeout

**Prompt to AI:**

```
Complete checkout after waiting 2 hours
```

**AI Response:**
"Your checkout session has expired. Let me restart the checkout process with your cart."

## Integration Examples

### Claude Desktop

```json
{
  "mcpServers": {
    "fastbuyjson": {
      "command": "node",
      "args": ["/path/to/fastbuyjson-mcp-server/dist/index.js"],
      "env": {
        "FASTBUYJSON_API_URL": "http://localhost:8000/api/fastbuyjson"
      }
    }
  }
}
```

### Custom AI Assistant

```python
# Example Python integration
import mcp_client

client = mcp_client.connect("fastbuyjson-mcp-server")

# Search products
result = client.call_tool("fastbuy_search_products", {
    "query": "laptop",
    "filters": {"brand": "Apple"}
})

print(result)
```

### Multiple Environment Setup

**Development:**

```json
{
  "env": {
    "FASTBUYJSON_API_URL": "http://localhost:8000/api/fastbuyjson"
  }
}
```

**Staging:**

```json
{
  "env": {
    "FASTBUYJSON_API_URL": "https://staging-api.store.com/api/fastbuyjson"
  }
}
```

**Production:**

```json
{
  "env": {
    "FASTBUYJSON_API_URL": "https://api.store.com/api/fastbuyjson"
  }
}
```

## Troubleshooting Examples

### Debug Connection Issues

**Prompt to AI:**

```
The store seems to be offline. Can you check if it supports FastBuyJSON?
```

**AI checks connectivity and reports status**

### Reset Cart

**Prompt to AI:**

```
Something went wrong with my cart. Can you clear it and start fresh?
```

**AI handles cart reset gracefully**

### Authentication Issues

**Prompt to AI:**

```
I'm getting authentication errors. Help me reconnect.
```

**AI guides through re-authentication process**

## Best Practices

1. **Always start with detection** - Check FastBuyJSON support before shopping
2. **Use natural language** - No need for technical parameters
3. **Verify before checkout** - Review cart contents and addresses
4. **Save order IDs** - Keep order IDs for tracking
5. **Handle errors gracefully** - AI will guide you through issues

## Voice Assistant Examples

These examples work great with voice-enabled AI assistants:

**"Hey Claude, find me some wireless earbuds under 100 dollars"**

**"Add those AirPods to my cart"**

**"Checkout and ship to my home address"**

**"Where's my order?"**

The MCP server makes all these interactions seamless and natural!
