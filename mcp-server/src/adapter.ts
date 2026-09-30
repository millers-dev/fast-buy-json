/**
 * FastBuyJSON Adapter
 * 
 * Adapter layer that connects the MCP server with FastBuyJSON-compatible REST APIs.
 * Handles HTTP communication, authentication, and data transformation.
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

export interface SearchProductsParams {
  query?: string;
  filters?: {
    brand?: string;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
  };
  sort?: 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc' | 'relevance' | 'newest';
  page?: number;
  pageSize?: number;
}

export interface AddToCartParams {
  productId: string;
  quantity?: number;
  options?: Record<string, string>;
}

export interface CheckoutInitiateParams {
  cartId: string;
  customerInfo: {
    email: string;
    phone: string;
    firstName?: string;
    lastName?: string;
  };
  shippingAddress: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  };
  billingAddress?: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  };
}

export interface CheckoutConfirmParams {
  sessionToken: string;
  paymentDetails: {
    method: 'credit_card' | 'paypal' | 'apple_pay' | 'google_pay';
    cardDetails?: {
      lastFourDigits?: string;
      brand?: string;
    };
    transactionVerification: {
      verificationMethod: 'captcha' | 'email_confirmation' | 'sms_confirmation' | 'payment_provider_token' | 'oauth_token';
      verificationToken: string;
      verificationTimestamp?: string;
    };
  };
}

export class FastBuyJSONAdapter {
  private client: AxiosInstance;
  private baseUrl: string;
  private userAgent: string;
  private sessionToken?: string;
  private cartId?: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.FASTBUYJSON_API_URL || 'http://localhost:3000/api/fastbuyjson';
    this.userAgent = 'FastBuyJSON-MCP-Server/0.2.0';
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'User-Agent': this.userAgent,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // Add request interceptor for authentication
    this.client.interceptors.request.use((config) => {
      if (this.sessionToken) {
        config.headers['Authorization'] = `Bearer ${this.sessionToken}`;
      }
      
      // Add MCP context headers
      config.headers['X-MCP-Client'] = 'fastbuyjson-mcp-server';
      config.headers['X-User-Agent'] = this.userAgent;
      
      return config;
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Clear invalid session token
          this.sessionToken = undefined;
        }
        throw error;
      }
    );
  }

  /**
   * Set the base URL for the FastBuyJSON API
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url;
    this.client.defaults.baseURL = url;
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string): void {
    this.sessionToken = token;
  }

  /**
   * Get current cart ID
   */
  getCurrentCartId(): string | undefined {
    return this.cartId;
  }

  /**
   * Detect if a website supports FastBuyJSON
   */
  async detectSupport(url: string): Promise<any> {
    try {
      const response = await axios.get(`${url}/api/fastbuyjson/detect`, {
        timeout: 10000,
        headers: {
          'User-Agent': this.userAgent,
        },
      });

      return {
        supported: true,
        info: response.data,
        url: url,
        endpoints: response.data.endpoints || [],
        features: response.data.supportedFeatures || [],
      };
    } catch (error) {
      return {
        supported: false,
        url: url,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Search for products
   */
  async searchProducts(params: SearchProductsParams): Promise<any> {
    try {
      const response = await this.client.post('/products/search', {
        query: params.query,
        filters: params.filters,
        sort: params.sort,
        page: params.page || 1,
        pageSize: params.pageSize || 10,
      });

      return response.data;
    } catch (error) {
      throw new Error(`Product search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add item to cart
   */
  async addToCart(params: AddToCartParams): Promise<any> {
    try {
      const config: AxiosRequestConfig = {
        headers: {},
      };

      // Generate idempotency key for safe operations
      const idempotencyKey = `mcp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      config.headers!['Idempotency-Key'] = idempotencyKey;

      const response = await this.client.post('/cart/add', {
        productId: params.productId,
        quantity: params.quantity || 1,
        options: params.options || {},
      }, config);

      // Store cart ID for future operations
      if (response.data.cart?.id) {
        this.cartId = response.data.cart.id;
      }

      return response.data;
    } catch (error) {
      throw new Error(`Add to cart failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get cart contents
   */
  async getCart(cartId?: string): Promise<any> {
    try {
      let url = '/cart';
      
      if (cartId) {
        url = `/cart/${cartId}`;
      }

      const response = await this.client.get(url);

      // Store cart ID for future operations
      if (response.data.cart?.id) {
        this.cartId = response.data.cart.id;
      }

      return response.data;
    } catch (error) {
      throw new Error(`Get cart failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Initiate checkout process
   */
  async initiateCheckout(params: CheckoutInitiateParams): Promise<any> {
    try {
      const response = await this.client.post('/checkout/initiate', {
        cartId: params.cartId,
        customerInfo: params.customerInfo,
        shippingAddress: params.shippingAddress,
        billingAddress: params.billingAddress,
      });

      // Store session token for checkout confirmation
      if (response.data.sessionToken) {
        this.sessionToken = response.data.sessionToken;
      }

      return response.data;
    } catch (error) {
      throw new Error(`Checkout initiation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Confirm checkout and complete order
   */
  async confirmCheckout(params: CheckoutConfirmParams): Promise<any> {
    try {
      const response = await this.client.post('/checkout/confirm', {
        sessionToken: params.sessionToken,
        paymentDetails: params.paymentDetails,
      });

      // Clear session token and cart ID after successful order
      this.sessionToken = undefined;
      this.cartId = undefined;

      return response.data;
    } catch (error) {
      throw new Error(`Checkout confirmation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get order status
   */
  async getOrderStatus(orderId: string): Promise<any> {
    try {
      const response = await this.client.get(`/orders/${orderId}`);
      return response.data;
    } catch (error) {
      throw new Error(`Get order status failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Authenticate with username/password
   */
  async login(username: string, password: string): Promise<any> {
    try {
      const response = await this.client.post('/auth/login', {
        username,
        password,
      });

      if (response.data.access_token) {
        this.sessionToken = response.data.access_token;
      }

      return response.data;
    } catch (error) {
      throw new Error(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clear session data
   */
  clearSession(): void {
    this.sessionToken = undefined;
    this.cartId = undefined;
  }
}
