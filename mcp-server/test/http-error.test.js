import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import axios from 'axios';
import { formatHttpError } from '../dist/http-error.js';
import { FastBuyJSONAdapter } from '../dist/adapter.js';

const hostedCheckoutProblem = {
  type: 'https://fastbuyjson.org/problems/payment-method-unsupported',
  title: 'Payment method unsupported',
  status: 400,
  code: 'PAYMENT_METHOD_UNSUPPORTED',
  detail: 'Hosted checkout is required for this store. Open checkoutUrl to pay.',
  checkoutUrl: 'https://shop.example/checkout/c/abc123',
};

function axiosError(message, data, status = 400) {
  return new axios.AxiosError(
    message,
    status >= 400 && status < 500 ? 'ERR_BAD_REQUEST' : 'ERR_BAD_RESPONSE',
    undefined,
    undefined,
    {
      data,
      status,
      statusText: 'Error',
      headers: {},
      config: { headers: {} },
    }
  );
}

test('problem body with checkoutUrl keeps detail and checkoutUrl', () => {
  const error = axiosError('Request failed with status code 400', hostedCheckoutProblem);
  const message = formatHttpError('Checkout confirmation', error);

  assert.equal(
    message,
    `Checkout confirmation failed: Request failed with status code 400: ${JSON.stringify(hostedCheckoutProblem)}`
  );
  assert.ok(message.includes(hostedCheckoutProblem.detail));
  assert.ok(message.includes(hostedCheckoutProblem.checkoutUrl));
  assert.ok(message.includes('PAYMENT_METHOD_UNSUPPORTED'));
});

test('problem body without checkoutUrl still includes detail', () => {
  const problem = {
    type: 'https://fastbuyjson.org/problems/validation-error',
    title: 'Validation failed',
    status: 400,
    code: 'INVALID_REQUEST',
    detail: 'The cartId field is required.',
  };
  const error = axiosError('Request failed with status code 400', problem);

  assert.equal(
    formatHttpError('Login', error),
    `Login failed: Request failed with status code 400: ${JSON.stringify(problem)}`
  );
});

test('network error with no response body falls back to the Axios message', () => {
  const error = new axios.AxiosError('Network Error', 'ERR_NETWORK');

  assert.equal(
    formatHttpError('Get order status', error),
    'Get order status failed: Network Error'
  );
});

test('non-problem response bodies fall back to the Axios message', () => {
  const textError = axiosError('Request failed with status code 502', 'Bad Gateway', 502);
  assert.equal(
    formatHttpError('Get shipping options', textError),
    'Get shipping options failed: Request failed with status code 502'
  );

  const objectError = axiosError(
    'Request failed with status code 500',
    { message: 'internal', retryable: true },
    500
  );
  assert.equal(
    formatHttpError('Get cart', objectError),
    'Get cart failed: Request failed with status code 500'
  );

  const arrayError = axiosError('Request failed with status code 400', [
    { type: 'https://fastbuyjson.org/problems/validation-error', detail: 'nope' },
  ]);
  assert.equal(
    formatHttpError('Product search', arrayError),
    'Product search failed: Request failed with status code 400'
  );
});

test('non-Error throws and unstringifiable problem bodies fall back cleanly', () => {
  assert.equal(formatHttpError('Apply discount', undefined), 'Apply discount failed: Unknown error');
  assert.equal(formatHttpError('Add to cart', 'nope'), 'Add to cart failed: Unknown error');

  const body = { title: 'Loop', detail: 'circular' };
  body.self = body;
  const error = new Error('Request failed with status code 400');
  error.response = { data: body };

  assert.equal(
    formatHttpError('Checkout initiation', error),
    'Checkout initiation failed: Request failed with status code 400'
  );
});

function listen(handler) {
  const server = http.createServer((req, res) => {
    req.on('data', () => {});
    req.on('end', () => handler(req, res));
  });
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Test server did not bind a TCP port'));
        return;
      }
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
    server.on('error', reject);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

const confirmParams = {
  sessionToken: 'session-1',
  paymentDetails: {
    method: 'credit_card',
    transactionVerification: {
      verificationMethod: 'payment_provider_token',
      verificationToken: 'tok',
    },
  },
};

test('confirmCheckout surfaces a mocked Axios 400 PAYMENT_METHOD_UNSUPPORTED body', async () => {
  const { server, baseUrl } = await listen((_req, res) => {
    res.writeHead(400, { 'Content-Type': 'application/problem+json' });
    res.end(JSON.stringify(hostedCheckoutProblem));
  });

  try {
    const adapter = new FastBuyJSONAdapter(baseUrl);
    await assert.rejects(
      () => adapter.confirmCheckout(confirmParams),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /^Checkout confirmation failed: Request failed with status code 400: /);
        assert.ok(error.message.includes(hostedCheckoutProblem.detail));
        assert.ok(error.message.includes(hostedCheckoutProblem.checkoutUrl));
        assert.ok(error.message.includes('PAYMENT_METHOD_UNSUPPORTED'));
        const parsed = JSON.parse(error.message.slice(error.message.indexOf('{')));
        assert.equal(parsed.detail, hostedCheckoutProblem.detail);
        assert.equal(parsed.checkoutUrl, hostedCheckoutProblem.checkoutUrl);
        assert.equal(parsed.code, 'PAYMENT_METHOD_UNSUPPORTED');
        return true;
      }
    );
  } finally {
    await close(server);
  }
});

test('adapter methods include the problem body, and a non-problem confirm falls back', async () => {
  const problem = {
    type: 'https://fastbuyjson.org/problems/validation-error',
    title: 'Validation failed',
    status: 400,
    code: 'INVALID_REQUEST',
    detail: 'The cartId field is required.',
    checkoutUrl: 'https://shop.example/checkout/c/from-search',
  };
  const { server, baseUrl } = await listen((req, res) => {
    if (req.url?.startsWith('/plain')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'card declined' }));
      return;
    }
    res.writeHead(400, { 'Content-Type': 'application/problem+json' });
    res.end(JSON.stringify(problem));
  });

  const calls = [
    ['Product search', (adapter) => adapter.searchProducts({ query: 'headphones' })],
    ['Add to cart', (adapter) => adapter.addToCart({ productId: 'sku-1' })],
    ['Get cart', (adapter) => adapter.getCart()],
    ['Get shipping options', (adapter) => adapter.getShippingOptions()],
    ['Apply discount', (adapter) => adapter.applyDiscount({ code: 'SAVE10' })],
    ['Checkout initiation', (adapter) => adapter.initiateCheckout({
      cartId: 'cart-1',
      customerInfo: { email: 'a@example.com', phone: '+15550100' },
      shippingAddress: { line1: '1 Main', city: 'Austin', postalCode: '78701', country: 'US' },
    })],
    ['Checkout confirmation', (adapter) => adapter.confirmCheckout(confirmParams)],
    ['Get order status', (adapter) => adapter.getOrderStatus('order-1')],
    ['Login', (adapter) => adapter.login('user', 'secret')],
  ];

  try {
    const adapter = new FastBuyJSONAdapter(baseUrl);
    for (const [action, run] of calls) {
      await assert.rejects(run(adapter), (error) => {
        assert.ok(error instanceof Error);
        assert.ok(error.message.startsWith(`${action} failed:`));
        assert.ok(error.message.includes(problem.detail));
        assert.ok(error.message.includes(problem.checkoutUrl));
        return true;
      });
    }

    const plain = new FastBuyJSONAdapter(`${baseUrl}/plain`);
    await assert.rejects(
      () => plain.confirmCheckout(confirmParams),
      (error) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, 'Checkout confirmation failed: Request failed with status code 400');
        return true;
      }
    );
  } finally {
    await close(server);
  }
});
