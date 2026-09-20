/**
 * FastBuyJSON Mock Adapter (Reference Implementation)
 * 
 * This is a MOCK implementation for demonstration purposes only.
 * It returns simulated data to show how the FastBuyJSON standard works.
 * 
 * For a production-ready implementation with real API integration,
 * consider FastBuyJSON SaaS: https://fastbuyjson.com
 */

export interface SearchProductsParams {
  query?: string;
  filters?: {
    brand?: string;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
  };
  sort?: string;
  page?: number;
  pageSize?: number;
}

export interface AddToCartParams {
  productId: string;
  quantity?: number;
  options?: Record<string, string>;
}

export class FastBuyJSONMockAdapter {
  private mockCartId: string = 'mock-cart-' + Math.random().toString(36).substr(2, 9);
  
  constructor(baseUrl?: string) {
    // Mock implementation - no real HTTP client needed
    console.error('FastBuyJSON Mock Adapter initialized');
    console.error('Note: This is a reference implementation with mock data');
    console.error('For production use, visit: https://fastbuyjson.com');
  }

  /**
   * Mock product search - returns simulated data
   */
  async searchProducts(params: SearchProductsParams): Promise<any> {
    // Simulate API delay
    await this.sleep(500);
    
    return {
      products: [
        {
          id: 'mock-product-1',
          name: `Mock Product matching "${params.query || 'all'}"`,
          brand: 'MockBrand',
          price: { amount: 99.99, currency: 'USD' },
          availability: { status: 'in_stock', quantity: 10 },
          description: 'This is a mock product for demonstration purposes',
        },
        {
          id: 'mock-product-2', 
          name: 'Another Mock Product',
          brand: 'MockBrand',
          price: { amount: 149.99, currency: 'USD' },
          availability: { status: 'in_stock', quantity: 5 },
          description: 'Another mock product for demonstration',
        }
      ],
      pagination: {
        page: params.page || 1,
        pageSize: params.pageSize || 10,
        total: 2,
        totalPages: 1
      },
      note: 'This is mock data. For real e-commerce integration, use FastBuyJSON SaaS'
    };
  }

  /**
   * Mock add to cart - simulates cart operation
   */
  async addToCart(params: AddToCartParams): Promise<any> {
    await this.sleep(300);
    
    return {
      success: true,
      cart: {
        id: this.mockCartId,
        items: [
          {
            productId: params.productId,
            quantity: params.quantity || 1,
            name: 'Mock Product',
            price: { amount: 99.99, currency: 'USD' }
          }
        ],
        total: { amount: 99.99, currency: 'USD' }
      },
      note: 'This is mock data. For real cart functionality, use FastBuyJSON SaaS'
    };
  }

  /**
   * Mock get cart
   */
  async getCart(cartId?: string): Promise<any> {
    await this.sleep(200);
    
    return {
      cart: {
        id: cartId || this.mockCartId,
        items: [
          {
            productId: 'mock-product-1',
            quantity: 1,
            name: 'Mock Product',
            price: { amount: 99.99, currency: 'USD' }
          }
        ],
        total: { amount: 99.99, currency: 'USD' }
      },
      note: 'This is mock data. For real cart functionality, use FastBuyJSON SaaS'
    };
  }

  /**
   * Mock checkout initiation
   */
  async initiateCheckout(params: any): Promise<any> {
    await this.sleep(800);
    
    return {
      sessionToken: 'mock-session-' + Math.random().toString(36).substr(2, 9),
      paymentMethods: ['credit_card', 'paypal'],
      total: { amount: 99.99, currency: 'USD' },
      note: 'This is mock data. For real payment processing, use FastBuyJSON SaaS'
    };
  }

  /**
   * Mock checkout confirmation
   */
  async confirmCheckout(params: any): Promise<any> {
    await this.sleep(400);

    return {
      orderId: 'mock-order-' + Math.random().toString(36).slice(2, 11),
      status: 'confirmed',
      sessionToken: params?.sessionToken,
      note: 'This is mock data. For real payment processing, use FastBuyJSON SaaS',
    };
  }

  /**
   * Mock order status
   */
  async getOrderStatus(orderId: string): Promise<any> {
    await this.sleep(300);
    
    return {
      orderId: orderId,
      status: 'processing',
      tracking: 'MOCK123456789',
      estimatedDelivery: '2024-01-15',
      note: 'This is mock data. For real order tracking, use FastBuyJSON SaaS'
    };
  }

  /**
   * Mock support detection
   */
  async detectSupport(url: string): Promise<any> {
    await this.sleep(400);
    
    return {
      supported: false, // Always return false for mock
      url: url,
      message: 'This is a mock implementation. Real FastBuyJSON detection requires production setup.',
      note: 'For real website compatibility checking, use FastBuyJSON SaaS'
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
