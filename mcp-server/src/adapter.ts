/**
 * FastBuyJSON Adapter
 * 
 * Adapter layer that connects the MCP server with FastBuyJSON-compatible REST APIs.
 * Handles HTTP communication, authentication, and data transformation.
 */

import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { formatHttpError, throwHttpError } from './http-error.js';

const SECRET_FIELDS = new Set(['pollToken', 'access_token', 'refresh_token', 'password']);
const REAUTH_CODES = new Set(['AUTHENTICATION_REQUIRED', 'INVALID_TOKEN']);
const AUTH_POST_ROUTES = [
  '/auth/customer/start',
  '/auth/customer/poll',
  '/auth/login',
  '/auth/refresh',
];

const CUSTOMER_LOGIN_HINT =
  'Run fastbuy_customer_login_start, then fastbuy_customer_login_poll. Do not run fastbuy_login.';
const PASSWORD_LOGIN_HINT =
  'Run fastbuy_login. Do not run customer start.';
const NO_LOGIN_ROUTE_HINT =
  'GET /detect did not name a login route. Do not pick customer start or fastbuy_login as the only next step.';
const ORDER_CUSTOMER_HINT =
  'The session expired. Customer login is required. Run fastbuy_customer_login_start. Do not run fastbuy_login.';
const ORDER_PASSWORD_HINT =
  'The session expired. Run fastbuy_login. Do not run customer start.';
const ORDER_NO_ROUTE_HINT =
  'The session expired. GET /detect did not name a login route. Do not pick customer start or fastbuy_login as the only next step.';
const ORDER_REFRESH_HINT =
  'The session expired. Run fastbuy_auth_refresh once. Do not send the password again unless refresh fails.';

const GATE_ERROR =
  'Customer login is not advertised. GET /detect must include authentication.methods containing jwt and authentication.endpoints containing /auth/customer/start. Reference demos use fastbuy_login instead.';

export interface SearchFilters {
  brand?: string;
  categories?: string[];
  priceRange?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  availability?: string[];
  extensions?: Record<string, unknown>;
}

export interface SearchProductsParams {
  query?: string;
  filters?: SearchFilters;
  sort?: 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc' | 'relevance' | 'newest';
  page?: number;
  pageSize?: number;
}

export function normalizeSearchFilters(filters?: SearchFilters): Record<string, unknown> | undefined {
  if (!filters) {
    return undefined;
  }

  const normalized: Record<string, unknown> = {};

  if (filters.brand) {
    normalized.brand = filters.brand;
  }

  if (filters.categories?.length) {
    normalized.categories = filters.categories;
  }

  if (filters.priceRange) {
    normalized.priceRange = filters.priceRange;
  }

  if (filters.availability?.length) {
    normalized.availability = filters.availability;
  }

  if (filters.extensions) {
    normalized.extensions = filters.extensions;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export interface AddToCartParams {
  productId: string;
  quantity?: number;
  options?: Record<string, string>;
  extensions?: Record<string, unknown>;
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
  shippingOptionId?: string;
  discountCode?: string;
  extensions?: Record<string, unknown>;
}

export interface ApplyDiscountParams {
  code?: string | null;
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function endpointPath(config: { url?: string } | undefined): string {
  const raw = config?.url;
  if (!raw) {
    return '';
  }

  let path = raw;
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      path = new URL(raw).pathname;
    } catch {
      path = raw;
    }
  }

  const withoutQuery = path.split('?')[0] ?? '';
  if (withoutQuery.length > 1 && withoutQuery.endsWith('/')) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery;
}

function matchesRoute(path: string, route: string): boolean {
  if (path === route) {
    return true;
  }
  if (!path.endsWith(route)) {
    return false;
  }
  const boundary = path.length - route.length - 1;
  return boundary >= 0 && path[boundary] === '/';
}

function isPollPost(method: string, path: string): boolean {
  return method === 'post' && matchesRoute(path, '/auth/customer/poll');
}

function isRefreshPost(method: string, path: string): boolean {
  return method === 'post' && matchesRoute(path, '/auth/refresh');
}

function isExemptAuth(method: string, path: string): boolean {
  if (method === 'get' && matchesRoute(path, '/detect')) {
    return true;
  }
  if (method !== 'post') {
    return false;
  }
  return AUTH_POST_ROUTES.some((route) => matchesRoute(path, route));
}

function httpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const status = (error as { response?: { status?: unknown } }).response?.status;
  return typeof status === 'number' ? status : undefined;
}

function responseBody(error: unknown): unknown {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  return (error as { response?: { data?: unknown } }).response?.data;
}

function problemCode(error: unknown): string | undefined {
  const code = asRecord(responseBody(error))?.code;
  return typeof code === 'string' ? code : undefined;
}

function isReauthFailure(error: unknown): boolean {
  const code = problemCode(error);
  return httpStatus(error) === 401 && code !== undefined && REAUTH_CODES.has(code);
}

function stripSecrets(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return undefined;
    }
    seen.add(value);
    return value.map((item) => stripSecrets(item, seen));
  }

  if (value !== null && typeof value === 'object') {
    if (seen.has(value)) {
      return undefined;
    }
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_FIELDS.has(key)) {
        continue;
      }
      out[key] = stripSecrets(child, seen);
    }
    return out;
  }

  return value;
}

function stripErrorSecrets(error: unknown): void {
  if (!error || typeof error !== 'object') {
    return;
  }

  const record = error as {
    response?: { data?: unknown };
    config?: { data?: unknown };
  };

  if (record.response && typeof record.response.data === 'object' && record.response.data !== null) {
    record.response.data = stripSecrets(record.response.data);
  }

  const config = record.config;
  if (!config) {
    return;
  }

  const requestData = config.data;
  if (typeof requestData === 'string') {
    try {
      config.data = JSON.stringify(stripSecrets(JSON.parse(requestData)));
    } catch {
      return;
    }
    return;
  }

  if (requestData && typeof requestData === 'object') {
    config.data = stripSecrets(requestData);
  }
}

function advertisesCustomerLogin(data: unknown): boolean {
  const authentication = asRecord(asRecord(data)?.authentication);
  if (!authentication) {
    return false;
  }
  return Array.isArray(authentication.methods)
    && authentication.methods.includes('jwt')
    && Array.isArray(authentication.endpoints)
    && authentication.endpoints.includes('/auth/customer/start');
}

function advertisesPasswordLogin(data: unknown): boolean {
  const authentication = asRecord(asRecord(data)?.authentication);
  if (!authentication || !Array.isArray(authentication.endpoints)) {
    return false;
  }
  return authentication.endpoints.includes('/auth/login');
}

export interface SessionComplete {
  status: 'complete';
  expires_in?: number;
}

export interface LoginResult extends SessionComplete {
  refresh: boolean;
}

export interface CustomerStartResult {
  loginUrl: string;
  userCode: string;
}

export interface PollPendingResult {
  status: 'pending';
}

export class FastBuyJSONAdapter {
  private client: AxiosInstance;
  private baseUrl: string;
  private userAgent: string;
  private authToken?: string;
  private refreshToken?: string;
  private pollToken?: string;
  private accessExpiresAt?: number;
  private reauthRequired = false;
  private reauthMessage?: string;
  private checkoutSessionToken?: string;
  private cartId?: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.FASTBUYJSON_API_URL || 'http://localhost:3000/api/fastbuyjson';
    this.userAgent = 'FastBuyJSON-MCP-Server/1.0.0';
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'User-Agent': this.userAgent,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // Attach a Bearer token only while it is still inside accessExpiresAt.
    this.client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      this.expireAccessIfNeeded();
      if (this.authToken) {
        config.headers['Authorization'] = `Bearer ${this.authToken}`;
      }

      config.headers['X-MCP-Client'] = 'fastbuyjson-mcp-server';
      config.headers['X-User-Agent'] = this.userAgent;

      return config;
    });

    // Auth-route 401s must not drop a JWT that is still good.
    // Poll 401 drops pollToken. Refresh 401 drops refreshToken.
    // A commerce 401 AUTHENTICATION_REQUIRED or INVALID_TOKEN drops the JWT and pollToken.
    this.client.interceptors.response.use(
      (response: AxiosResponse) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          const method = (error.config?.method ?? 'get').toLowerCase();
          const path = endpointPath(error.config);
          if (isPollPost(method, path)) {
            this.pollToken = undefined;
          } else if (isRefreshPost(method, path)) {
            this.refreshToken = undefined;
            this.reauthMessage = undefined;
          } else if (!isExemptAuth(method, path)) {
            if (isReauthFailure(error)) {
              this.applyCommerceReauth();
            } else {
              this.authToken = undefined;
              this.accessExpiresAt = undefined;
            }
          }
        }
        throw error;
      }
    );
  }

  private failureText(action: string, error: unknown): string {
    stripErrorSecrets(error);
    return formatHttpError(action, error);
  }

  private throwStripped(action: string, error: unknown): never {
    stripErrorSecrets(error);
    throwHttpError(action, error);
  }

  private expireAccessIfNeeded(): void {
    if (this.accessExpiresAt === undefined || Date.now() < this.accessExpiresAt) {
      return;
    }

    this.authToken = undefined;
    this.pollToken = undefined;
    this.accessExpiresAt = undefined;
    this.reauthRequired = true;
  }

  private applyCommerceReauth(): void {
    this.authToken = undefined;
    this.pollToken = undefined;
    this.accessExpiresAt = undefined;
    this.reauthRequired = true;
  }

  private clearAuthState(): void {
    this.authToken = undefined;
    this.refreshToken = undefined;
    this.pollToken = undefined;
    this.accessExpiresAt = undefined;
    this.reauthRequired = false;
    this.reauthMessage = undefined;
  }

  private storeAccessToken(accessToken: string, expiresIn: unknown): number | undefined {
    this.authToken = accessToken;
    const expires = finiteNumber(expiresIn);
    if (expires === undefined) {
      this.accessExpiresAt = undefined;
    } else {
      this.accessExpiresAt = Date.now() + expires * 1000;
    }
    this.reauthRequired = false;
    this.reauthMessage = undefined;
    return expires;
  }

  private completeResult(expiresIn: number | undefined): SessionComplete {
    if (expiresIn === undefined) {
      return { status: 'complete' };
    }
    return { status: 'complete', expires_in: expiresIn };
  }

  private async readDetect(): Promise<{ ok: true; data: unknown } | { ok: false }> {
    try {
      const response = await this.client.get('/detect');
      return { ok: true, data: response.data };
    } catch {
      return { ok: false };
    }
  }

  private async loginHint(): Promise<string> {
    const detected = await this.readDetect();
    if (!detected.ok) {
      return NO_LOGIN_ROUTE_HINT;
    }
    if (advertisesCustomerLogin(detected.data)) {
      return CUSTOMER_LOGIN_HINT;
    }
    if (advertisesPasswordLogin(detected.data)) {
      return PASSWORD_LOGIN_HINT;
    }
    return NO_LOGIN_ROUTE_HINT;
  }

  private async orderReauthMessage(): Promise<string> {
    if (this.reauthMessage) {
      return this.reauthMessage;
    }

    let message: string;
    if (this.refreshToken) {
      message = ORDER_REFRESH_HINT;
    } else {
      const detected = await this.readDetect();
      if (!detected.ok) {
        message = ORDER_NO_ROUTE_HINT;
      } else if (advertisesCustomerLogin(detected.data)) {
        message = ORDER_CUSTOMER_HINT;
      } else if (advertisesPasswordLogin(detected.data)) {
        message = ORDER_PASSWORD_HINT;
      } else {
        message = ORDER_NO_ROUTE_HINT;
      }
    }

    this.reauthMessage = message;
    return message;
  }

  /**
   * Set the base URL for the FastBuyJSON API
   */
  setBaseUrl(url: string): void {
    this.clearAuthState();
    this.baseUrl = url;
    this.client.defaults.baseURL = url;
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string): void {
    this.authToken = token;
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
        filters: normalizeSearchFilters(params.filters),
        sort: params.sort,
        page: params.page || 1,
        pageSize: params.pageSize || 10,
      });

      return response.data;
    } catch (error) {
      this.throwStripped('Product search', error);
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
        ...(params.extensions ? { extensions: params.extensions } : {}),
      }, config);

      // Store cart ID for future operations
      if (response.data.cart?.id) {
        this.cartId = response.data.cart.id;
      }

      return response.data;
    } catch (error) {
      this.throwStripped('Add to cart', error);
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
      this.throwStripped('Get cart', error);
    }
  }

  /**
   * Initiate checkout process
   */
  async getShippingOptions(): Promise<any> {
    try {
      const response = await this.client.get('/shipping/options');
      return response.data;
    } catch (error) {
      this.throwStripped('Get shipping options', error);
    }
  }

  async applyDiscount(params: ApplyDiscountParams): Promise<any> {
    try {
      const response = await this.client.post('/cart/discount', {
        code: params.code ?? null,
      });
      if (response.data.cart?.id) {
        this.cartId = response.data.cart.id;
      }
      return response.data;
    } catch (error) {
      this.throwStripped('Apply discount', error);
    }
  }

  async initiateCheckout(params: CheckoutInitiateParams): Promise<any> {
    try {
      const response = await this.client.post('/checkout/initiate', {
        cartId: params.cartId,
        customerInfo: params.customerInfo,
        shippingAddress: params.shippingAddress,
        billingAddress: params.billingAddress,
        shippingOptionId: params.shippingOptionId,
        discountCode: params.discountCode,
        ...(params.extensions ? { extensions: params.extensions } : {}),
      });

      // Store session token for checkout confirmation
      if (response.data.sessionToken) {
        this.checkoutSessionToken = response.data.sessionToken;
      }

      return response.data;
    } catch (error) {
      this.throwStripped('Checkout initiation', error);
    }
  }

  /**
   * Confirm checkout and complete order
   */
  async confirmCheckout(params: CheckoutConfirmParams): Promise<any> {
    try {
      const sessionToken = params.sessionToken || this.checkoutSessionToken;
      const response = await this.client.post('/checkout/confirm', {
        sessionToken,
        paymentDetails: params.paymentDetails,
      });

      // Clear checkout session and cart ID after successful order
      this.checkoutSessionToken = undefined;
      this.cartId = undefined;

      return response.data;
    } catch (error) {
      this.throwStripped('Checkout confirmation', error);
    }
  }

  /**
   * Get order status. A session that must be renewed does not call the network.
   */
  async getOrderStatus(orderId: string): Promise<any> {
    this.expireAccessIfNeeded();
    if (this.reauthRequired) {
      throw new Error(await this.orderReauthMessage());
    }

    try {
      const response = await this.client.get(`/orders/${orderId}`);
      return response.data;
    } catch (error) {
      if (isReauthFailure(error)) {
        this.applyCommerceReauth();
        const hint = await this.orderReauthMessage();
        throw new Error(`${this.failureText('Get order status', error)} ${hint}`);
      }
      this.throwStripped('Get order status', error);
    }
  }

  /**
   * Username and password login for the reference demos.
   */
  async login(username: string, password: string): Promise<LoginResult> {
    let data: unknown;
    try {
      const response = await this.client.post('/auth/login', {
        username,
        password,
      });
      data = response.data;
    } catch (error) {
      this.throwStripped('Login', error);
    }

    const body = asRecord(data);
    const accessToken = body?.access_token;
    if (!nonEmptyString(accessToken)) {
      throw new Error('Login did not return an access token.');
    }

    const expiresIn = this.storeAccessToken(accessToken, body?.expires_in);
    const refreshToken = body?.refresh_token;
    if (nonEmptyString(refreshToken)) {
      this.refreshToken = refreshToken;
    } else {
      this.refreshToken = undefined;
    }
    this.pollToken = undefined;
    const result: LoginResult = {
      ...this.completeResult(expiresIn),
      refresh: nonEmptyString(refreshToken),
    };
    return result;
  }

  /**
   * Start customer login. Returns loginUrl and userCode only.
   */
  async customerLoginStart(): Promise<CustomerStartResult> {
    let detect: unknown;
    try {
      const response = await this.client.get('/detect');
      detect = response.data;
    } catch (error) {
      this.throwStripped('Detect', error);
    }

    if (!advertisesCustomerLogin(detect)) {
      throw new Error(GATE_ERROR);
    }

    let data: unknown;
    try {
      const response = await this.client.post('/auth/customer/start');
      data = response.data;
    } catch (error) {
      this.throwStripped('Customer login start', error);
    }

    const body = asRecord(data);
    const loginUrl = body?.loginUrl;
    const userCode = body?.userCode;
    const pollToken = body?.pollToken;
    if (!nonEmptyString(loginUrl) || !nonEmptyString(userCode) || !nonEmptyString(pollToken)) {
      throw new Error('Customer login start returned an incomplete login response.');
    }

    this.pollToken = pollToken;
    return { loginUrl, userCode };
  }

  /**
   * Poll the stored customer login. Does not sleep or retry.
   */
  async customerLoginPoll(): Promise<PollPendingResult | SessionComplete> {
    if (!this.pollToken) {
      if (this.authToken) {
        throw new Error('Login already completed. The next call is fastbuy_get_order_status.');
      }
      const hint = await this.loginHint();
      throw new Error(`There is nothing to poll. ${hint}`);
    }

    let data: unknown;
    try {
      const response = await this.client.post('/auth/customer/poll', {
        pollToken: this.pollToken,
      });
      data = response.data;
    } catch (error) {
      if (httpStatus(error) === 401) {
        this.pollToken = undefined;
        throw new Error(`${this.failureText('Customer login poll', error)} Run fastbuy_customer_login_start again.`);
      }
      this.throwStripped('Customer login poll', error);
    }

    const body = asRecord(data);
    const status = body?.status;
    if (status === 'pending') {
      return { status: 'pending' };
    }

    if (status === 'complete') {
      const accessToken = body?.access_token;
      if (!nonEmptyString(accessToken)) {
        this.pollToken = undefined;
        throw new Error('Customer login poll completed without an access token.');
      }

      const expiresIn = this.storeAccessToken(accessToken, body?.expires_in);
      this.refreshToken = undefined;
      this.pollToken = undefined;
      return this.completeResult(expiresIn);
    }

    throw new Error('Customer login poll returned an unexpected response.');
  }

  /**
   * Exchange a stored refresh token.
   */
  async authRefresh(): Promise<SessionComplete> {
    if (!this.refreshToken) {
      const hint = await this.loginHint();
      throw new Error(`No refresh token is stored. ${hint}`);
    }

    let data: unknown;
    try {
      const response = await this.client.post('/auth/refresh', {
        refresh_token: this.refreshToken,
      });
      data = response.data;
    } catch (error) {
      if (httpStatus(error) === 401) {
        this.refreshToken = undefined;
        this.reauthMessage = undefined;
        throw new Error(`${this.failureText('Auth refresh', error)} Run fastbuy_login again.`);
      }
      this.throwStripped('Auth refresh', error);
    }

    const body = asRecord(data);
    const accessToken = body?.access_token;
    if (!nonEmptyString(accessToken)) {
      throw new Error('Auth refresh did not return an access token.');
    }

    const expiresIn = this.storeAccessToken(accessToken, body?.expires_in);
    const nextRefresh = body?.refresh_token;
    if (nonEmptyString(nextRefresh)) {
      this.refreshToken = nextRefresh;
    }
    return this.completeResult(expiresIn);
  }

  /**
   * Clear session data
   */
  clearSession(): void {
    this.clearAuthState();
    this.checkoutSessionToken = undefined;
    this.cartId = undefined;
  }
}
