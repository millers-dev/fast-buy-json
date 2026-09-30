import { FastBuyProblemError, type FastBuyProblemBody } from "./errors.js";
import type {
  AddToCartRequest,
  CartDiscountRequest,
  CartUpdateItemRequest,
  CertificateRequest,
  CheckoutConfirmRequest,
  CheckoutInitiateRequest,
  LoginRequest,
  ProductSearchRequest,
  RefreshRequest,
} from "./generated/schema-types.js";

export interface FastBuyClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  getAccessToken?: () => string | undefined;
  defaultHeaders?: Record<string, string>;
}

export class FastBuyClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly getAccessToken?: () => string | undefined;
  private readonly defaultHeaders: Record<string, string>;

  constructor(options: FastBuyClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? fetch;
    this.getAccessToken = options.getAccessToken;
    this.defaultHeaders = options.defaultHeaders ?? {};
  }

  async detect(): Promise<Record<string, unknown>> {
    return this.request("GET", "/detect");
  }

  async login(body: LoginRequest): Promise<Record<string, unknown>> {
    return this.request("POST", "/auth/login", { body });
  }

  async refresh(body: RefreshRequest): Promise<Record<string, unknown>> {
    return this.request("POST", "/auth/refresh", { body });
  }

  async verifyCertificate(body: CertificateRequest): Promise<Record<string, unknown>> {
    return this.request("POST", "/auth/certificate", { body });
  }

  async searchProducts(body: ProductSearchRequest): Promise<Record<string, unknown>> {
    return this.request("POST", "/products/search", { body, auth: true });
  }

  async addToCart(
    body: AddToCartRequest,
    options?: { idempotencyKey?: string }
  ): Promise<Record<string, unknown>> {
    return this.request("POST", "/cart/add", {
      body,
      auth: true,
      idempotencyKey: options?.idempotencyKey,
    });
  }

  async getCart(): Promise<Record<string, unknown>> {
    return this.request("GET", "/cart", { auth: true });
  }

  async getCartById(cartId: string): Promise<Record<string, unknown>> {
    return this.request("GET", `/cart/${cartId}`, { auth: true });
  }

  async updateCartItem(
    itemId: string,
    body: CartUpdateItemRequest
  ): Promise<Record<string, unknown>> {
    return this.request("PATCH", `/cart/items/${itemId}`, { body, auth: true });
  }

  async removeCartItem(itemId: string): Promise<Record<string, unknown>> {
    return this.request("DELETE", `/cart/items/${itemId}`, { auth: true });
  }

  async clearCart(): Promise<Record<string, unknown>> {
    return this.request("DELETE", "/cart", { auth: true });
  }

  async applyCartDiscount(body: CartDiscountRequest): Promise<Record<string, unknown>> {
    return this.request("POST", "/cart/discount", { body, auth: true });
  }

  async getShippingOptions(): Promise<Record<string, unknown>> {
    return this.request("GET", "/shipping/options", { auth: true });
  }

  async initiateCheckout(
    body: CheckoutInitiateRequest,
    options?: { idempotencyKey?: string }
  ): Promise<Record<string, unknown>> {
    return this.request("POST", "/checkout/initiate", {
      body,
      auth: true,
      idempotencyKey: options?.idempotencyKey,
    });
  }

  async confirmCheckout(
    body: CheckoutConfirmRequest,
    options?: { idempotencyKey?: string }
  ): Promise<Record<string, unknown>> {
    return this.request("POST", "/checkout/confirm", {
      body,
      auth: true,
      idempotencyKey: options?.idempotencyKey,
    });
  }

  async getOrderStatus(orderId: string): Promise<Record<string, unknown>> {
    return this.request("GET", `/orders/${orderId}`, { auth: true });
  }

  private async request(
    method: string,
    path: string,
    options: {
      body?: unknown;
      auth?: boolean;
      idempotencyKey?: string;
    } = {}
  ): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {
      accept: "application/json",
      ...this.defaultHeaders,
    };
    if (options.body !== undefined) {
      headers["content-type"] = "application/json";
    }
    if (options.auth) {
      const token = this.getAccessToken?.();
      if (token) {
        headers.authorization = `Bearer ${token}`;
      }
    }
    if (options.idempotencyKey) {
      headers["idempotency-key"] = options.idempotencyKey;
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    const contentType = response.headers.get("content-type") ?? "";
    const json =
      contentType.includes("json") ? ((await response.json()) as Record<string, unknown>) : {};

    if (!response.ok) {
      if (contentType.includes("problem+json") || json.code) {
        throw new FastBuyProblemError(json as unknown as FastBuyProblemBody);
      }
      throw new Error(`HTTP ${response.status}`);
    }
    return json;
  }
}
