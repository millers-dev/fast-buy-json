/* eslint-disable */
/** Generated from ../../schemas — run: npm run generate:types */

/**
 * Payload for adding an item to the cart
 */
export interface AddToCartRequest {
  /**
   * Product identifier
   */
  productId: string;
  /**
   * Quantity to add
   */
  quantity?: number;
  /**
   * Product options (e.g., color, size)
   */
  options?: {
    [k: string]: unknown;
  };
  /**
   * Additional custom fields
   */
  extensions?: {
    [k: string]: unknown;
  };
}

/**
 * Postal address for shipping or billing
 */
export interface Address {
  /**
   * Address line 1
   */
  line1: string;
  /**
   * Address line 2
   */
  line2?: string;
  /**
   * City
   */
  city: string;
  /**
   * State/Province/Region
   */
  region?: string;
  /**
   * State or province (alias)
   */
  state?: string;
  /**
   * Country code (ISO 3166-1 alpha-2)
   */
  country: string;
  /**
   * Postal/ZIP code
   */
  postalCode: string;
}

/**
 * Apply or clear a promotional discount on the cart
 */
export interface CartDiscountRequest {
  /**
   * Promo code to apply; null or omitted clears the current discount
   */
  code?: string | null;
}

/**
 * Line item in a shopping cart
 */
export interface CartItem {
  /**
   * Stable line-item identifier assigned when the item is added
   */
  itemId?: string;
  /**
   * Product identifier
   */
  productId: string;
  /**
   * Product name
   */
  name?: string;
  /**
   * Quantity
   */
  quantity: number;
  /**
   * Product options
   */
  options?: {
    [k: string]: unknown;
  };
  price: {
    /**
     * Unit price
     */
    amount: number;
    /**
     * Currency code (ISO 4217)
     */
    currency: string;
  };
  lineTotal?: {
    /**
     * Line total
     */
    amount: number;
    /**
     * Currency code (ISO 4217)
     */
    currency: string;
  };
}

/**
 * Full cart snapshot with totals and line items
 */
export interface CartResponse {
  cart: {
    /**
     * Cart identifier
     */
    id: string;
    /**
     * Cart items
     */
    items: {
      /**
       * Stable line-item identifier
       */
      itemId?: string;
      /**
       * Product identifier
       */
      productId: string;
      /**
       * Product name
       */
      name?: string;
      /**
       * Quantity
       */
      quantity: number;
      /**
       * Product options
       */
      options?: {
        [k: string]: unknown;
      };
      price: {
        /**
         * Unit price
         */
        amount: number;
        /**
         * Currency code
         */
        currency: string;
      };
      lineTotal: {
        /**
         * Line total
         */
        amount: number;
        /**
         * Currency code
         */
        currency: string;
      };
    }[];
    /**
     * Selected shipping option and catalog snapshot
     */
    shipping?: {
      selectedOptionId?: string;
      amount?: {
        amount: number;
        currency: string;
      };
      options?: {}[];
    };
    appliedDiscounts?: {}[];
    totals: {
      currency?: string;
      /**
       * Cart subtotal
       */
      subtotal: number;
      /**
       * Discount amount
       */
      discount?: number;
      taxableBase?: number;
      /**
       * Tax amount
       */
      tax?: number;
      taxBreakdown?: {
        rate?: number;
        taxableAmount?: number;
        amount?: number;
        label?: string;
        jurisdiction?: string;
      };
      /**
       * Shipping cost
       */
      shipping?: number;
      discountBreakdown?: {}[];
      /**
       * Cart total
       */
      total: number;
    };
    /**
     * Cart creation timestamp
     */
    created?: string;
    /**
     * Cart last update timestamp
     */
    updated?: string;
  };
  /**
   * Optional message
   */
  message?: string;
  /**
   * Additional custom fields
   */
  extensions?: {
    [k: string]: unknown;
  };
}

/**
 * Update a cart line item quantity (absolute, minimum 1)
 */
export interface CartUpdateItemRequest {
  /**
   * New absolute quantity for the line item
   */
  quantity: number;
}

/**
 * Shopping cart with line items and totals
 */
export interface Cart {
  /**
   * Cart identifier
   */
  id: string;
  /**
   * Cart items
   */
  items: {
    /**
     * Stable line-item identifier
     */
    itemId?: string;
    /**
     * Product identifier
     */
    productId: string;
    /**
     * Product name
     */
    name?: string;
    /**
     * Quantity
     */
    quantity: number;
    /**
     * Product options
     */
    options?: {
      [k: string]: unknown;
    };
    price: {
      amount: number;
      currency: string;
    };
    lineTotal?: {
      amount: number;
      currency: string;
    };
  }[];
  /**
   * Selected shipping option and catalog snapshot
   */
  shipping?: {
    selectedOptionId?: string;
    amount?: {
      amount: number;
      currency: string;
    };
    options?: {}[];
  };
  /**
   * Non-stackable discounts currently applied
   */
  appliedDiscounts?: {}[];
  totals?: {
    currency?: string;
    subtotal?: number;
    discount?: number;
    taxableBase?: number;
    tax?: number;
    taxBreakdown?: {
      rate?: number;
      taxableAmount?: number;
      amount?: number;
      label?: string;
      jurisdiction?: string;
    };
    shipping?: number;
    discountBreakdown?: {}[];
    total?: number;
  };
  /**
   * Cart creation timestamp
   */
  created?: string;
  /**
   * Cart last update timestamp
   */
  updated?: string;
}

/**
 * Client certificate in PEM format for certificate authentication
 */
export interface CertificateRequest {
  /**
   * X.509 client certificate in PEM encoding
   */
  certificate: string;
}

/**
 * Certificate verification session
 */
export interface CertificateResponse {
  /**
   * Certificate session identifier
   */
  session_id: string;
  /**
   * Session lifetime in seconds
   */
  expires_in: number;
}

/**
 * Order created after successful payment confirmation
 */
export interface CheckoutConfirmResponse {
  /**
   * Confirmed order
   */
  order: {
    /**
     * Order identifier
     */
    id: string;
    status: "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded";
    items?: {
      productId: string;
      name?: string;
      quantity: number;
      options?: {
        [k: string]: unknown;
      };
      price: {
        amount: number;
        currency: string;
      };
      lineTotal?: {
        amount: number;
        currency: string;
      };
    }[];
    totals?: {
      [k: string]: unknown;
    };
    created?: string;
  };
  /**
   * Order identifier (duplicate of order.id)
   */
  orderId: string;
  /**
   * URL to poll order status
   */
  orderStatusUrl?: string;
  /**
   * Optional confirmation message
   */
  message?: string;
}

/**
 * Confirms payment and creates the order
 */
export interface CheckoutConfirmRequest {
  /**
   * Checkout session token
   */
  sessionToken: string;
  paymentDetails: {
    /**
     * Payment method
     */
    method: "credit_card" | "debit_card" | "paypal" | "bank_transfer" | "digital_wallet" | "apple_pay" | "google_pay";
    /**
     * Verification information to prevent fraudulent orders
     */
    transactionVerification: {
      /**
       * Method used to verify the transaction
       */
      verificationMethod:
        "captcha" | "email_confirmation" | "sms_confirmation" | "payment_provider_token" | "oauth_token";
      /**
       * Token proving the verification was completed
       */
      verificationToken: string;
      /**
       * When the verification was completed (ISO 8601 format)
       */
      verificationTimestamp?: string;
    };
    /**
     * Credit card details (never stored)
     */
    cardDetails?: {
      /**
       * Last four digits of card number
       */
      lastFourDigits?: string;
      /**
       * Card brand
       */
      brand?: string;
    };
    /**
     * External payment processor ID
     */
    externalPaymentId?: string;
  };
  /**
   * Additional custom fields
   */
  extensions?: {
    [k: string]: unknown;
  };
}

/**
 * Checkout session tokens and optional cart snapshot
 */
export interface CheckoutInitiateResponse {
  /**
   * Checkout session token
   */
  sessionToken: string;
  /**
   * Token that must be echoed in checkout confirm
   */
  verificationToken: string;
  /**
   * Session expiration time
   */
  expiresAt: string;
  /**
   * Cart snapshot for the checkout session
   */
  cart?: {
    id: string;
    items: {
      productId: string;
      name?: string;
      quantity: number;
      options?: {
        [k: string]: unknown;
      };
      price: {
        amount: number;
        currency: string;
      };
      lineTotal?: {
        amount: number;
        currency: string;
      };
    }[];
    totals?: {
      subtotal?: number;
      tax?: number;
      shipping?: number;
      total?: number;
    };
    created?: string;
    updated?: string;
  };
  riskAssessment?: {
    /**
     * Risk score
     */
    score?: number;
    /**
     * Whether additional verification is required
     */
    verificationRequired?: boolean;
  };
}

/**
 * Starts a checkout session with addresses and cart reference
 */
export interface CheckoutInitiateRequest {
  /**
   * Cart identifier
   */
  cartId: string;
  /**
   * Customer contact information for order confirmation and communication
   */
  customerInfo: {
    [k: string]: unknown;
  };
  shippingAddress: {
    /**
     * Address line 1
     */
    line1: string;
    /**
     * Address line 2
     */
    line2?: string;
    /**
     * City
     */
    city: string;
    /**
     * State/Province/Region
     */
    region?: string;
    /**
     * Country code (ISO 3166-1 alpha-2)
     */
    country: string;
    /**
     * Postal/ZIP code
     */
    postalCode: string;
  };
  billingAddress?: {
    /**
     * Address line 1
     */
    line1: string;
    /**
     * Address line 2
     */
    line2?: string;
    /**
     * City
     */
    city: string;
    /**
     * State/Province/Region
     */
    region?: string;
    /**
     * Country code (ISO 3166-1 alpha-2)
     */
    country: string;
    /**
     * Postal/ZIP code
     */
    postalCode: string;
  };
  /**
   * Shipping option to use for this checkout (defaults to cart selection or standard)
   */
  shippingOptionId?: string;
  /**
   * Optional promo code to apply before totals are finalized
   */
  discountCode?: string;
  /**
   * Additional custom fields
   */
  extensions?: {
    [k: string]: unknown;
  };
}

/**
 * Customer contact information for checkout
 */
export type CustomerInfo = {
  [k: string]: unknown;
} & {
  /**
   * Customer email address
   */
  email: string;
  /**
   * Customer phone number
   */
  phone?: string;
  /**
   * Alias accepted by demo servers
   */
  phoneNumber?: string;
  /**
   * Customer first name
   */
  firstName?: string;
  /**
   * Customer last name
   */
  lastName?: string;
};

/**
 * FastBuyJSON capability discovery metadata for agents
 */
export interface DetectResponse {
  /**
   * Standard identifier
   */
  standard: string;
  /**
   * FastBuyJSON specification version
   */
  specVersion: string;
  /**
   * Server implementation version
   */
  implementationVersion: string;
  /**
   * Structured commerce capability descriptor
   */
  capabilities: {
    [k: string]: unknown;
  };
  /**
   * Supported FastBuyJSON features
   */
  supportedFeatures: string[];
  /**
   * Supported API endpoint groups
   */
  endpoints: string[];
  /**
   * Authentication capabilities
   */
  authentication?: {
    [k: string]: unknown;
  };
  /**
   * Checkout capabilities
   */
  checkout?: {
    [k: string]: unknown;
  };
  /**
   * Merchant metadata
   */
  merchantInfo?: {
    name?: string;
    url?: string;
  };
}

/**
 * Discount applied to the cart (non-stackable)
 */
export interface AppliedDiscount {
  code: string;
  type: "percentage" | "fixed";
  label: string;
  amount: {
    amount: number;
    currency: string;
  };
}

/**
 * RFC 9457 problem details with FastBuyJSON error code
 */
export interface Error {
  /**
   * URI reference identifying the problem type
   */
  type: string;
  /**
   * Short, human-readable summary of the problem
   */
  title: string;
  /**
   * HTTP status code
   */
  status: number;
  /**
   * Machine-readable error code
   */
  code: string;
  /**
   * Human-readable explanation specific to this occurrence
   */
  detail?: string;
  /**
   * URI reference identifying this specific occurrence
   */
  instance?: string;
  /**
   * Field-level validation errors
   */
  errors?: {
    /**
     * JSON pointer or field name
     */
    field: string;
    /**
     * Error message for the field
     */
    message: string;
  }[];
}

/**
 * Username and password credentials for JWT authentication
 */
export interface LoginRequest {
  /**
   * Account username
   */
  username: string;
  /**
   * Account password
   */
  password: string;
}

/**
 * Monetary amount with ISO 4217 currency code
 */
export interface Money {
  /**
   * Price amount
   */
  amount: number;
  /**
   * Currency code (ISO 4217)
   */
  currency: string;
}

/**
 * Returns order state and tracking information
 */
export interface OrderStatusResponse {
  order: {
    /**
     * Order identifier
     */
    id: string;
    /**
     * Order status
     */
    status: "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded";
    /**
     * Order items
     */
    items: {
      /**
       * Product identifier
       */
      productId: string;
      /**
       * Product name
       */
      name?: string;
      /**
       * Quantity
       */
      quantity: number;
      /**
       * Product options
       */
      options?: {
        [k: string]: unknown;
      };
      price: {
        /**
         * Unit price
         */
        amount: number;
        /**
         * Currency code
         */
        currency: string;
      };
      lineTotal: {
        /**
         * Line total
         */
        amount: number;
        /**
         * Currency code
         */
        currency: string;
      };
    }[];
    totals: {
      /**
       * Order subtotal
       */
      subtotal: number;
      /**
       * Tax amount
       */
      tax?: number;
      /**
       * Shipping cost
       */
      shipping?: number;
      /**
       * Discount amount
       */
      discount?: number;
      /**
       * Order total
       */
      total: number;
    };
    shippingAddress?: {
      /**
       * Address line 1
       */
      line1: string;
      /**
       * Address line 2
       */
      line2?: string;
      /**
       * City
       */
      city: string;
      /**
       * State/Province/Region
       */
      region?: string;
      /**
       * Country code (ISO 3166-1 alpha-2)
       */
      country: string;
      /**
       * Postal/ZIP code
       */
      postalCode: string;
    };
    billingAddress?: {
      /**
       * Address line 1
       */
      line1: string;
      /**
       * Address line 2
       */
      line2?: string;
      /**
       * City
       */
      city: string;
      /**
       * State/Province/Region
       */
      region?: string;
      /**
       * Country code (ISO 3166-1 alpha-2)
       */
      country: string;
      /**
       * Postal/ZIP code
       */
      postalCode: string;
    };
    payment?: {
      /**
       * Payment method
       */
      method: string;
      /**
       * Payment status
       */
      status: "pending" | "approved" | "declined" | "refunded";
      /**
       * Last four digits of card number
       */
      lastFourDigits?: string;
      /**
       * Card brand
       */
      brand?: string;
      /**
       * External payment processor ID
       */
      externalPaymentId?: string;
    };
    shipment?: {
      /**
       * Shipping carrier
       */
      carrier?: string;
      /**
       * Tracking number
       */
      trackingNumber?: string;
      /**
       * Estimated delivery date
       */
      estimatedDelivery?: string;
      /**
       * Tracking URL
       */
      trackingUrl?: string;
    };
    /**
     * Order creation timestamp
     */
    created: string;
    /**
     * Order last update timestamp
     */
    updated?: string;
  };
  /**
   * Optional message
   */
  message?: string;
  /**
   * Additional custom fields
   */
  extensions?: {
    [k: string]: unknown;
  };
}

/**
 * Confirmed order snapshot
 */
export interface Order {
  /**
   * Order identifier
   */
  id: string;
  /**
   * Order status
   */
  status: "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded";
  /**
   * Order line items
   */
  items?: {
    productId: string;
    name?: string;
    quantity: number;
    options?: {
      [k: string]: unknown;
    };
    price: {
      amount: number;
      currency: string;
    };
    lineTotal?: {
      amount: number;
      currency: string;
    };
  }[];
  /**
   * Order totals
   */
  totals?: {
    [k: string]: unknown;
  };
  /**
   * Order creation timestamp
   */
  created?: string;
}

/**
 * Paginated product search results
 */
export interface ProductSearchResponse {
  /**
   * Matching products
   */
  results: {
    /**
     * Unique product identifier
     */
    id: string;
    /**
     * Product name
     */
    name: string;
    /**
     * Product brand
     */
    brand?: string;
    /**
     * Product description
     */
    description?: string;
    price: {
      /**
       * Price amount
       */
      amount: number;
      /**
       * Currency code (ISO 4217)
       */
      currency: string;
    };
    availability?: {
      status?: "in_stock" | "low_stock" | "out_of_stock" | "backorder" | "preorder";
      quantity?: number;
    };
    categories?: string[];
    images?: {
      url?: string;
      alt?: string;
    }[];
    variants?: {
      [k: string]: unknown;
    }[];
  }[];
  pagination: {
    /**
     * Current page number
     */
    currentPage: number;
    /**
     * Items per page
     */
    pageSize: number;
    /**
     * Total matching items
     */
    totalItems: number;
    /**
     * Total pages
     */
    totalPages: number;
  };
}

/**
 * Parameters for searching the product catalog
 */
export interface ProductSearchRequest {
  /**
   * Search query text
   */
  query?: string;
  /**
   * Typed catalog filters (additionalProperties remains open in 0.4.0)
   */
  filters?: {
    /**
     * Exact brand match (case-insensitive)
     */
    brand?: string;
    /**
     * Match products in any listed category
     */
    categories?: string[];
    /**
     * Inclusive bounds on product price.amount
     */
    priceRange?: {
      min?: number;
      max?: number;
      currency?: string;
    };
    /**
     * Subset of product availability.status values
     */
    availability?: ("in_stock" | "low_stock" | "out_of_stock" | "backorder" | "preorder")[];
    extensions?: {
      [k: string]: unknown;
    };
    [k: string]: unknown;
  };
  /**
   * Sorting method
   */
  sort?: "price_asc" | "price_desc" | "name_asc" | "name_desc" | "relevance" | "newest";
  /**
   * Page number (1-based)
   */
  page?: number;
  /**
   * Number of items per page
   */
  pageSize?: number;
  /**
   * Additional custom fields
   */
  extensions?: {
    [k: string]: unknown;
  };
}

/**
 * Canonical representation of a product
 */
export interface Product {
  /**
   * Unique product identifier
   */
  id: string;
  /**
   * Product name
   */
  name: string;
  /**
   * Product brand
   */
  brand?: string;
  /**
   * Product description
   */
  description?: string;
  price: {
    /**
     * Price amount
     */
    amount: number;
    /**
     * Currency code (ISO 4217)
     */
    currency: string;
  };
  availability?: {
    /**
     * Availability status
     */
    status?: "in_stock" | "low_stock" | "out_of_stock" | "backorder" | "preorder";
    /**
     * Available quantity
     */
    quantity?: number;
  };
  /**
   * Product categories
   */
  categories?: string[];
  /**
   * Product images
   */
  images?: {
    /**
     * Image URL
     */
    url: string;
    /**
     * Alternative text
     */
    alt?: string;
  }[];
  /**
   * Product variants
   */
  variants?: {
    /**
     * Variant identifier
     */
    id: string;
    /**
     * Variant attributes
     */
    attributes: {
      [k: string]: unknown;
    };
    price?: {
      /**
       * Price amount
       */
      amount: number;
      /**
       * Currency code (ISO 4217)
       */
      currency: string;
    };
  }[];
  /**
   * Additional custom fields
   */
  extensions?: {
    [k: string]: unknown;
  };
}

/**
 * Refresh token used to obtain a new access token
 */
export interface RefreshRequest {
  /**
   * Previously issued refresh token
   */
  refresh_token: string;
}

/**
 * New access token after refresh
 */
export interface RefreshResponse {
  /**
   * JWT access token
   */
  access_token: string;
  /**
   * Token type
   */
  token_type: string;
  /**
   * Access token lifetime in seconds
   */
  expires_in: number;
}

/**
 * Selectable shipping method with price and delivery estimate
 */
export interface ShippingOption {
  id: string;
  label: string;
  amount: {
    amount: number;
    currency: string;
  };
  estimatedDelivery: {
    minDays: number;
    maxDays: number;
  };
  freeOver?: {
    amount: number;
    currency: string;
  };
  description?: string;
}

/**
 * Discoverable shipping methods for the current cart context
 */
export interface ShippingOptionsResponse {
  currency: string;
  options: {
    id: string;
    label: string;
    amount: {
      amount: number;
      currency: string;
    };
    estimatedDelivery: {
      minDays: number;
      maxDays: number;
    };
    freeOver?: {
      amount?: number;
      currency?: string;
    };
    description?: string;
  }[];
}

/**
 * Structured tax line applied to taxable merchandise base
 */
export interface TaxBreakdown {
  /**
   * Tax rate as a decimal fraction
   */
  rate: number;
  /**
   * Amount tax was calculated on (subtotal minus discount)
   */
  taxableAmount: number;
  /**
   * Tax amount
   */
  amount: number;
  /**
   * Human-readable tax label
   */
  label: string;
  /**
   * Tax jurisdiction identifier (e.g. country code)
   */
  jurisdiction: string;
}

/**
 * OAuth2-style access and refresh tokens
 */
export interface TokenResponse {
  /**
   * JWT access token
   */
  access_token: string;
  /**
   * Refresh token for obtaining new access tokens
   */
  refresh_token?: string;
  /**
   * Token type
   */
  token_type: string;
  /**
   * Access token lifetime in seconds
   */
  expires_in: number;
}

