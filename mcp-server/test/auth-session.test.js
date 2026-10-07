import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FastBuyJSONAdapter } from '../dist/adapter.js';

const POLL_SENTENCES = [
  'status pending means call this tool again later. Do not call fastbuy_get_order_status while the login is pending.',
  'A 429 means wait and call this tool again. Do not start a second login while this poll token is still stored.',
  'After status complete, do not call this tool again. Call fastbuy_get_order_status for the order.',
  'If this tool reports that no login is in progress, do not call fastbuy_get_order_status and do not call this tool again. Run only the login tool the error names.',
  'A 401 means this attempt is finished. Do not call fastbuy_get_order_status to check it. Run fastbuy_customer_login_start again. Poll 401 is also the stop signal when expiresAt has passed.',
];

const ORDER_STATUS_SENTENCES = [
  'A result of AUTHENTICATION_REQUIRED or INVALID_TOKEN, or an error that says the session expired, means do not call this tool again and do not call fastbuy_customer_login_poll.',
  'Call fastbuy_auth_refresh only when the error names it. Call fastbuy_customer_login_start and then poll only when the error names customer login. Call fastbuy_login only when the error names it.',
  'Calling poll after this error does not recover a session. There is no poll token after a finished login, after local expiry, or after this 401.',
];

const customerDetect = {
  authentication: {
    methods: ['jwt', 'anonymous'],
    endpoints: ['/auth/customer/start'],
  },
};

const demoDetect = {
  authentication: {
    methods: ['jwt', 'certificate', 'anonymous'],
    endpoints: ['/auth/login', '/auth/refresh', '/auth/certificate', 'auth'],
  },
};

function problem(status, code, detail, extra = {}) {
  return {
    type: `https://fastbuyjson.org/problems/${code.toLowerCase().replace(/_/g, '-')}`,
    title: code,
    status,
    code,
    detail,
    ...extra,
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }
    });
    req.on('error', reject);
  });
}

function listen(handler) {
  const server = http.createServer(async (req, res) => {
    try {
      const body = await readBody(req);
      await handler(req, res, body);
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ detail: error instanceof Error ? error.message : 'handler failed' }));
    }
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

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function calls(requests, method, url) {
  return requests.filter((request) => request.method === method && request.url === url);
}

async function withAdapter(handler, fn) {
  const requests = [];
  const { server, baseUrl } = await listen(async (req, res, body) => {
    const recorded = {
      method: req.method,
      url: req.url,
      body,
      authorization: req.headers.authorization ?? null,
    };
    requests.push(recorded);
    await handler(recorded, res, requests);
  });

  try {
    const adapter = new FastBuyJSONAdapter(baseUrl);
    await fn(adapter, requests, baseUrl);
  } finally {
    await close(server);
  }
}

function assertNoSecrets(text, secrets) {
  for (const secret of secrets) {
    assert.equal(text.includes(secret), false);
  }
}

async function rejectMessage(run) {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof Error);
    return error.message;
  }
  assert.fail('expected a rejection');
}

test('detect without /auth/customer/start does not start and names fastbuy_login', async () => {
  await withAdapter(async (request, res) => {
    if (request.method === 'GET' && request.url === '/detect') {
      send(res, 200, {
        authentication: {
          methods: ['jwt', 'certificate', 'anonymous'],
          endpoints: ['auth', '/auth/login', '/auth/refresh'],
        },
      });
      return;
    }
    send(res, 500, problem(500, 'UNEXPECTED', 'start should not be called'));
  }, async (adapter, requests) => {
    const message = await rejectMessage(() => adapter.customerLoginStart());
    assert.match(message, /fastbuy_login/);
    assert.match(message, /authentication\.methods/);
    assert.match(message, /authentication\.endpoints/);
    assert.match(message, /not advertised/);
    assert.equal(calls(requests, 'POST', '/auth/customer/start').length, 0);
  });
});

test('detect that omits jwt does not start', async () => {
  await withAdapter(async (request, res) => {
    if (request.method === 'GET' && request.url === '/detect') {
      send(res, 200, {
        authentication: {
          methods: ['anonymous'],
          endpoints: ['/auth/customer/start'],
        },
      });
      return;
    }
    send(res, 500, problem(500, 'UNEXPECTED', 'start should not be called'));
  }, async (adapter, requests) => {
    await assert.rejects(() => adapter.customerLoginStart());
    assert.equal(calls(requests, 'POST', '/auth/customer/start').length, 0);
  });
});

test('detect HTTP error does not start', async () => {
  await withAdapter(async (request, res) => {
    if (request.method === 'GET' && request.url === '/detect') {
      send(res, 503, problem(503, 'UNAVAILABLE', 'detect down'));
      return;
    }
    send(res, 500, problem(500, 'UNEXPECTED', 'start should not be called'));
  }, async (adapter, requests) => {
    const message = await rejectMessage(() => adapter.customerLoginStart());
    assert.match(message, /^Detect failed:/);
    assert.equal(calls(requests, 'POST', '/auth/customer/start').length, 0);
  });
});

test('customer start returns loginUrl and userCode only and poll posts the stored token', async () => {
  const pollToken = 'poll-token-start-7c1e';
  const expiresAt = '2026-10-07T12:10:00.000Z';
  await withAdapter(async (request, res) => {
    if (request.method === 'GET' && request.url === '/detect') {
      send(res, 200, customerDetect);
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/customer/start') {
      send(res, 200, {
        loginUrl: 'https://shop.example/login',
        userCode: 'ABCD',
        pollToken,
        expiresAt,
      });
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/customer/poll') {
      send(res, 200, { status: 'pending' });
      return;
    }
    send(res, 404, problem(404, 'NOT_FOUND', request.url));
  }, async (adapter, requests) => {
    const started = await adapter.customerLoginStart();
    assert.deepEqual(started, {
      loginUrl: 'https://shop.example/login',
      userCode: 'ABCD',
    });
    assert.equal(Object.hasOwn(started, 'expiresAt'), false);
    assert.equal(Object.hasOwn(started, 'pollToken'), false);
    assertNoSecrets(JSON.stringify(started), [pollToken, expiresAt]);

    await adapter.customerLoginPoll();
    const polls = calls(requests, 'POST', '/auth/customer/poll');
    assert.equal(polls.length, 1);
    assert.deepEqual(polls[0].body, { pollToken });
  });
});

test('start 429 stores no new poll token and does not retry', async () => {
  const stored = 'poll-token-kept-4aa1';
  const leaked = 'poll-token-from-429-should-not-stick';
  let starts = 0;
  await withAdapter(async (request, res) => {
    if (request.method === 'GET' && request.url === '/detect') {
      send(res, 200, customerDetect);
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/customer/start') {
      starts += 1;
      if (starts === 1) {
        send(res, 200, {
          loginUrl: 'https://shop.example/login',
          userCode: 'ABCD',
          pollToken: stored,
          expiresAt: '2026-10-07T12:10:00.000Z',
        });
        return;
      }
      send(res, 429, problem(429, 'RATE_LIMITED', 'Wait before starting again.', {
        pollToken: leaked,
      }));
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/customer/poll') {
      send(res, 200, { status: 'pending' });
      return;
    }
    send(res, 404, problem(404, 'NOT_FOUND', request.url));
  }, async (adapter, requests) => {
    await adapter.customerLoginStart();
    const before = calls(requests, 'POST', '/auth/customer/start').length;
    const message = await rejectMessage(() => adapter.customerLoginStart());
    const after = calls(requests, 'POST', '/auth/customer/start').length;
    assert.equal(after - before, 1);
    assert.match(message, /RATE_LIMITED/);
    assertNoSecrets(message, [stored, leaked]);

    await adapter.customerLoginPoll();
    const polls = calls(requests, 'POST', '/auth/customer/poll');
    assert.equal(polls.length, 1);
    assert.deepEqual(polls[0].body, { pollToken: stored });
  });
});

test('incomplete start stores nothing and a later poll does not post', async () => {
  const loginUrl = 'https://shop.example/login/secret-url';
  const userCode = 'CODE-9f3c';
  const pollToken = 'poll-token-incomplete-88b2';
  const bodies = [
    { loginUrl, userCode, expiresAt: '2026-10-07T12:10:00.000Z' },
    { userCode, pollToken, expiresAt: '2026-10-07T12:10:00.000Z' },
    { loginUrl, pollToken, expiresAt: '2026-10-07T12:10:00.000Z' },
  ];

  for (const body of bodies) {
    await withAdapter(async (request, res) => {
      if (request.method === 'GET' && request.url === '/detect') {
        send(res, 200, customerDetect);
        return;
      }
      if (request.method === 'POST' && request.url === '/auth/customer/start') {
        send(res, 200, body);
        return;
      }
      if (request.method === 'POST' && request.url === '/auth/customer/poll') {
        send(res, 500, problem(500, 'UNEXPECTED', 'poll should not be called'));
        return;
      }
      send(res, 404, problem(404, 'NOT_FOUND', request.url));
    }, async (adapter, requests) => {
      const message = await rejectMessage(() => adapter.customerLoginStart());
      assertNoSecrets(message, [loginUrl, userCode, pollToken]);
      const beforePoll = calls(requests, 'POST', '/auth/customer/poll').length;
      await assert.rejects(() => adapter.customerLoginPoll());
      assert.equal(calls(requests, 'POST', '/auth/customer/poll').length, beforePoll);
    });
  }
});

test('poll with nothing stored and no access token uses the login hint', async () => {
  await withAdapter(async (request, res) => {
    if (request.method === 'GET' && request.url === '/detect') {
      send(res, 200, customerDetect);
      return;
    }
    send(res, 500, problem(500, 'UNEXPECTED', 'poll should not be called'));
  }, async (adapter, requests) => {
    const message = await rejectMessage(() => adapter.customerLoginPoll());
    assert.match(message, /nothing to poll/);
    assert.match(message, /Run fastbuy_customer_login_start, then fastbuy_customer_login_poll/);
    assert.match(message, /Do not run fastbuy_login/);
    assert.equal(message.includes('fastbuy_get_order_status'), false);
    assert.equal(/call this tool again/i.test(message), false);
    assert.equal(calls(requests, 'POST', '/auth/customer/poll').length, 0);
    assert.equal(calls(requests, 'POST', '/auth/customer/start').length, 0);
    assert.equal(calls(requests, 'POST', '/auth/refresh').length, 0);
  });
});

test('poll with nothing stored while an access token is set names order status', async () => {
  await withAdapter(async (_request, res) => {
    send(res, 500, problem(500, 'UNEXPECTED', 'poll should not be called'));
  }, async (adapter, requests) => {
    adapter.setAuthToken('jwt-already-stored');
    const message = await rejectMessage(() => adapter.customerLoginPoll());
    assert.match(message, /fastbuy_get_order_status/);
    assert.match(message, /already completed/);
    assert.equal(/start/i.test(message), false);
    assert.equal(/poll/i.test(message), false);
    assert.equal(requests.length, 0);
  });
});

test('pending poll keeps the same poll token', async () => {
  const pollToken = 'poll-token-pending-11aa';
  await withAdapter(async (request, res) => {
    if (request.method === 'GET' && request.url === '/detect') {
      send(res, 200, customerDetect);
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/customer/start') {
      send(res, 200, {
        loginUrl: 'https://shop.example/login',
        userCode: 'ABCD',
        pollToken,
      });
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/customer/poll') {
      send(res, 200, { status: 'pending', pollToken: 'should-not-leak' });
      return;
    }
    send(res, 404, problem(404, 'NOT_FOUND', request.url));
  }, async (adapter, requests) => {
    await adapter.customerLoginStart();
    const first = await adapter.customerLoginPoll();
    const second = await adapter.customerLoginPoll();
    assert.deepEqual(first, { status: 'pending' });
    assert.deepEqual(second, { status: 'pending' });
    const polls = calls(requests, 'POST', '/auth/customer/poll');
    assert.equal(polls.length, 2);
    assert.deepEqual(polls[0].body, { pollToken });
    assert.deepEqual(polls[1].body, { pollToken });
  });
});

test('poll complete stores the JWT for order status and does not refresh', async () => {
  const pollToken = 'poll-token-complete-22bb';
  const accessToken = 'access-token-complete-22bb';
  await withAdapter(async (request, res) => {
    if (request.method === 'GET' && request.url === '/detect') {
      send(res, 200, customerDetect);
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/customer/start') {
      send(res, 200, {
        loginUrl: 'https://shop.example/login',
        userCode: 'ABCD',
        pollToken,
      });
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/customer/poll') {
      send(res, 200, {
        status: 'complete',
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: 3600,
      });
      return;
    }
    if (request.method === 'GET' && request.url === '/orders/order-1') {
      send(res, 200, { id: 'order-1', status: 'shipped' });
      return;
    }
    send(res, 500, problem(500, 'UNEXPECTED', request.url));
  }, async (adapter, requests) => {
    await adapter.customerLoginStart();
    const completed = await adapter.customerLoginPoll();
    assert.deepEqual(completed, { status: 'complete', expires_in: 3600 });
    assertNoSecrets(JSON.stringify(completed), [accessToken, pollToken, 'bearer']);

    const order = await adapter.getOrderStatus('order-1');
    assert.equal(order.status, 'shipped');
    const orders = calls(requests, 'GET', '/orders/order-1');
    assert.equal(orders.length, 1);
    assert.equal(orders[0].authorization, `Bearer ${accessToken}`);

    const beforeRefresh = calls(requests, 'POST', '/auth/refresh').length;
    await assert.rejects(() => adapter.authRefresh());
    assert.equal(calls(requests, 'POST', '/auth/refresh').length, beforeRefresh);
  });
});

test('poll complete ignores a refresh_token in the body', async () => {
  const accessToken = 'access-token-norefresh-33cc';
  const refreshToken = 'refresh-token-from-poll-33cc';
  await withAdapter(async (request, res) => {
    if (request.method === 'GET' && request.url === '/detect') {
      send(res, 200, customerDetect);
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/customer/start') {
      send(res, 200, {
        loginUrl: 'https://shop.example/login',
        userCode: 'ABCD',
        pollToken: 'poll-token-norefresh-33cc',
      });
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/customer/poll') {
      send(res, 200, {
        status: 'complete',
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'bearer',
        expires_in: 120,
      });
      return;
    }
    send(res, 500, problem(500, 'UNEXPECTED', request.url));
  }, async (adapter, requests) => {
    await adapter.customerLoginStart();
    const completed = await adapter.customerLoginPoll();
    assert.deepEqual(completed, { status: 'complete', expires_in: 120 });
    assertNoSecrets(JSON.stringify(completed), [accessToken, refreshToken]);

    const before = calls(requests, 'POST', '/auth/refresh').length;
    const message = await rejectMessage(() => adapter.authRefresh());
    assert.equal(calls(requests, 'POST', '/auth/refresh').length, before);
    assertNoSecrets(message, [accessToken, refreshToken]);
  });
});

test('poll complete without a usable access token stores nothing and drops the poll token', async () => {
  const accessToken = 'access-token-bad-complete-bb88';
  const refreshToken = 'refresh-token-kept-bb88';
  const pollToken = 'poll-token-bad-complete-bb88';
  const leakedRefresh = 'refresh-token-from-bad-complete-bb88';
  const quote = 'QUOTE-BODY-bb88-do-not-echo';
  const bodies = [
    { status: 'complete', refresh_token: leakedRefresh, note: quote },
    { status: 'complete', access_token: '', refresh_token: leakedRefresh, note: quote },
    { status: 'complete', access_token: 0, refresh_token: leakedRefresh, note: quote },
  ];

  for (const body of bodies) {
    await withAdapter(async (request, res) => {
      if (request.method === 'GET' && request.url === '/detect') {
        send(res, 200, customerDetect);
        return;
      }
      if (request.method === 'POST' && request.url === '/auth/login') {
        send(res, 200, {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: 3600,
        });
        return;
      }
      if (request.method === 'POST' && request.url === '/auth/customer/start') {
        send(res, 200, {
          loginUrl: 'https://shop.example/login',
          userCode: 'ABCD',
          pollToken,
        });
        return;
      }
      if (request.method === 'POST' && request.url === '/auth/customer/poll') {
        send(res, 200, body);
        return;
      }
      if (request.method === 'GET' && request.url === '/orders/order-1') {
        send(res, 200, { id: 'order-1' });
        return;
      }
      if (request.method === 'POST' && request.url === '/auth/refresh') {
        send(res, 200, { access_token: 'access-after-bad-complete-bb88', expires_in: 60 });
        return;
      }
      send(res, 500, problem(500, 'UNEXPECTED', request.url));
    }, async (adapter, requests) => {
      await adapter.login('demo-user', 'password-bb88');
      await adapter.customerLoginStart();
      const message = await rejectMessage(() => adapter.customerLoginPoll());
      assert.equal(message, 'Customer login poll completed without an access token.');
      assertNoSecrets(message, [accessToken, refreshToken, pollToken, leakedRefresh, quote, 'password-bb88']);
      assert.equal(calls(requests, 'POST', '/auth/customer/poll').length, 1);

      await adapter.getOrderStatus('order-1');
      assert.equal(
        calls(requests, 'GET', '/orders/order-1')[0].authorization,
        `Bearer ${accessToken}`
      );

      const pollMessage = await rejectMessage(() => adapter.customerLoginPoll());
      assert.match(pollMessage, /fastbuy_get_order_status/);
      assert.equal(calls(requests, 'POST', '/auth/customer/poll').length, 1);

      await adapter.authRefresh();
      const refreshCalls = calls(requests, 'POST', '/auth/refresh');
      assert.equal(refreshCalls.length, 1);
      assert.deepEqual(refreshCalls[0].body, { refresh_token: refreshToken });
    });
  }
});

test('second poll after complete does not call the network', async () => {
  await withAdapter(async (request, res) => {
    if (request.method === 'GET' && request.url === '/detect') {
      send(res, 200, customerDetect);
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/customer/start') {
      send(res, 200, {
        loginUrl: 'https://shop.example/login',
        userCode: 'ABCD',
        pollToken: 'poll-token-second-44dd',
      });
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/customer/poll') {
      send(res, 200, {
        status: 'complete',
        access_token: 'access-token-second-44dd',
        expires_in: 3600,
      });
      return;
    }
    send(res, 500, problem(500, 'UNEXPECTED', request.url));
  }, async (adapter, requests) => {
    await adapter.customerLoginStart();
    await adapter.customerLoginPoll();
    const before = requests.length;
    const message = await rejectMessage(() => adapter.customerLoginPoll());
    assert.equal(requests.length, before);
    assert.match(message, /fastbuy_get_order_status/);
    assert.equal(/start/i.test(message), false);
  });
});

test('poll 401 drops the poll token and keeps an earlier JWT', async () => {
  const accessToken = 'access-token-poll401-55ee';
  const pollToken = 'poll-token-poll401-55ee';
  await withAdapter(async (request, res) => {
    if (request.method === 'GET' && request.url === '/detect') {
      send(res, 200, customerDetect);
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/login') {
      send(res, 200, {
        access_token: accessToken,
        expires_in: 3600,
      });
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/customer/start') {
      send(res, 200, {
        loginUrl: 'https://shop.example/login',
        userCode: 'ABCD',
        pollToken,
      });
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/customer/poll') {
      send(res, 401, problem(401, 'INVALID_TOKEN', 'This login attempt is dead.', {
        pollToken,
        access_token: accessToken,
      }));
      return;
    }
    if (request.method === 'GET' && request.url === '/orders/order-1') {
      send(res, 200, { id: 'order-1' });
      return;
    }
    send(res, 404, problem(404, 'NOT_FOUND', request.url));
  }, async (adapter, requests) => {
    await adapter.login('demo-user', 'demo-password-55ee');
    await adapter.customerLoginStart();
    const message = await rejectMessage(() => adapter.customerLoginPoll());
    assert.match(message, /fastbuy_customer_login_start again/);
    assert.equal(message.includes('fastbuy_get_order_status'), false);
    assertNoSecrets(message, [pollToken, accessToken, 'demo-password-55ee']);

    await adapter.getOrderStatus('order-1');
    const orders = calls(requests, 'GET', '/orders/order-1');
    assert.equal(orders.length, 1);
    assert.equal(orders[0].authorization, `Bearer ${accessToken}`);
  });
});

test('poll 429 keeps the poll token and does not retry', async () => {
  const pollToken = 'poll-token-429-66ff';
  await withAdapter(async (request, res, requests) => {
    if (request.method === 'GET' && request.url === '/detect') {
      send(res, 200, customerDetect);
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/customer/start') {
      send(res, 200, {
        loginUrl: 'https://shop.example/login',
        userCode: 'ABCD',
        pollToken,
      });
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/customer/poll') {
      const priorPolls = requests.filter((entry) => entry.method === 'POST' && entry.url === '/auth/customer/poll').length;
      if (priorPolls === 1) {
        send(res, 429, problem(429, 'RATE_LIMITED', 'Wait before polling again.'));
        return;
      }
      send(res, 200, { status: 'pending' });
      return;
    }
    send(res, 404, problem(404, 'NOT_FOUND', request.url));
  }, async (adapter, requests) => {
    await adapter.customerLoginStart();
    const before = calls(requests, 'POST', '/auth/customer/poll').length;
    const message = await rejectMessage(() => adapter.customerLoginPoll());
    assert.equal(calls(requests, 'POST', '/auth/customer/poll').length, before + 1);
    assert.match(message, /RATE_LIMITED/);

    await adapter.customerLoginPoll();
    const polls = calls(requests, 'POST', '/auth/customer/poll');
    assert.equal(polls.length, 2);
    assert.deepEqual(polls[0].body, { pollToken });
    assert.deepEqual(polls[1].body, { pollToken });
  });
});

test('login stores a refresh token and refresh posts that token', async () => {
  const accessToken = 'access-token-login-77aa';
  const refreshToken = 'refresh-token-login-77aa';
  const password = 'password-login-77aa';
  let refreshes = 0;
  await withAdapter(async (request, res) => {
    if (request.method === 'POST' && request.url === '/auth/login') {
      send(res, 200, {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'bearer',
        expires_in: 3600,
      });
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/refresh') {
      refreshes += 1;
      send(res, 200, {
        access_token: `access-after-refresh-${refreshes}`,
        token_type: 'bearer',
        expires_in: 1800,
      });
      return;
    }
    send(res, 404, problem(404, 'NOT_FOUND', request.url));
  }, async (adapter, requests) => {
    const loggedIn = await adapter.login('demo-user', password);
    assert.deepEqual(loggedIn, { status: 'complete', expires_in: 3600, refresh: true });
    assertNoSecrets(JSON.stringify(loggedIn), [accessToken, refreshToken, password]);

    const refreshed = await adapter.authRefresh();
    assert.deepEqual(refreshed, { status: 'complete', expires_in: 1800 });
    const refreshCalls = calls(requests, 'POST', '/auth/refresh');
    assert.equal(refreshCalls.length, 1);
    assert.deepEqual(refreshCalls[0].body, { refresh_token: refreshToken });
    assert.equal(JSON.stringify(refreshCalls[0].body).includes(accessToken), false);
  });
});

test('login without a refresh token and a demo detect document names fastbuy_login', async () => {
  const accessToken = 'access-token-noredresh-88bb';
  await withAdapter(async (request, res) => {
    if (request.method === 'GET' && request.url === '/detect') {
      send(res, 200, demoDetect);
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/login') {
      send(res, 200, {
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: 3600,
      });
      return;
    }
    send(res, 500, problem(500, 'UNEXPECTED', request.url));
  }, async (adapter, requests) => {
    const loggedIn = await adapter.login('demo-user', 'password-88bb');
    assert.equal(loggedIn.refresh, false);
    assert.deepEqual(loggedIn, { status: 'complete', expires_in: 3600, refresh: false });

    const before = calls(requests, 'POST', '/auth/refresh').length;
    const message = await rejectMessage(() => adapter.authRefresh());
    assert.equal(calls(requests, 'POST', '/auth/refresh').length, before);
    assert.match(message, /No refresh token is stored/);
    assert.match(message, /Run fastbuy_login/);
    assert.match(message, /Do not run customer start/);
    assert.equal(message.includes('fastbuy_customer_login_start'), false);
    assert.equal(message.includes('fastbuy_customer_login_poll'), false);
    assertNoSecrets(message, [accessToken, 'password-88bb']);
  });
});

test('refresh with no token and customer detect names customer start and poll', async () => {
  await withAdapter(async (request, res) => {
    if (request.method === 'GET' && request.url === '/detect') {
      send(res, 200, customerDetect);
      return;
    }
    send(res, 500, problem(500, 'UNEXPECTED', request.url));
  }, async (adapter, requests) => {
    const message = await rejectMessage(() => adapter.authRefresh());
    assert.match(message, /No refresh token is stored/);
    assert.match(message, /fastbuy_customer_login_start/);
    assert.match(message, /fastbuy_customer_login_poll/);
    assert.match(message, /Do not run fastbuy_login/);
    assert.doesNotMatch(message, /Run fastbuy_login/);
    assert.equal(calls(requests, 'POST', '/auth/refresh').length, 0);
    assert.equal(calls(requests, 'POST', '/auth/customer/start').length, 0);
    assert.equal(calls(requests, 'POST', '/auth/customer/poll').length, 0);
  });
});

test('refresh with no token does not pick a login tool when detect fails or names neither route', async () => {
  const neitherHint = /GET \/detect did not name a login route\. Do not pick customer start or fastbuy_login as the only next step\./;

  await withAdapter(async (request, res) => {
    if (request.method === 'GET' && request.url === '/detect') {
      send(res, 503, problem(503, 'UNAVAILABLE', 'detect down QUOTE-DETECT-cc99'));
      return;
    }
    send(res, 500, problem(500, 'UNEXPECTED', request.url));
  }, async (adapter, requests) => {
    const message = await rejectMessage(() => adapter.authRefresh());
    assert.match(message, /No refresh token is stored/);
    assert.match(message, neitherHint);
    assert.doesNotMatch(message, /Run fastbuy_customer_login_start/);
    assert.doesNotMatch(message, /Run fastbuy_login/);
    assert.equal(message.includes('QUOTE-DETECT-cc99'), false);
    assert.equal(calls(requests, 'POST', '/auth/refresh').length, 0);
    assert.equal(calls(requests, 'GET', '/detect').length, 1);
  });

  await withAdapter(async (request, res) => {
    if (request.method === 'GET' && request.url === '/detect') {
      send(res, 200, {
        authentication: {
          methods: ['anonymous'],
          endpoints: ['auth', '/auth/certificate'],
        },
      });
      return;
    }
    send(res, 500, problem(500, 'UNEXPECTED', request.url));
  }, async (adapter, requests) => {
    const message = await rejectMessage(() => adapter.authRefresh());
    assert.match(message, /No refresh token is stored/);
    assert.match(message, neitherHint);
    assert.doesNotMatch(message, /Run fastbuy_customer_login_start/);
    assert.doesNotMatch(message, /Run fastbuy_login/);
    assert.equal(calls(requests, 'POST', '/auth/refresh').length, 0);
    assert.equal(calls(requests, 'POST', '/auth/customer/start').length, 0);
    assert.equal(calls(requests, 'POST', '/auth/login').length, 0);
    assert.equal(calls(requests, 'GET', '/detect').length, 1);
  });
});

test('login 401 keeps a previously stored JWT', async () => {
  const accessToken = 'access-token-login401-99cc';
  let logins = 0;
  await withAdapter(async (request, res) => {
    if (request.method === 'POST' && request.url === '/auth/login') {
      logins += 1;
      if (logins === 1) {
        send(res, 200, { access_token: accessToken, expires_in: 3600 });
        return;
      }
      send(res, 401, problem(401, 'INVALID_CREDENTIALS', 'Wrong password.', {
        password: 'password-echo-99cc',
        access_token: 'access-echo-99cc',
      }));
      return;
    }
    if (request.method === 'GET' && request.url === '/orders/order-1') {
      send(res, 200, { id: 'order-1' });
      return;
    }
    send(res, 404, problem(404, 'NOT_FOUND', request.url));
  }, async (adapter, requests) => {
    await adapter.login('demo-user', 'password-first-99cc');
    const message = await rejectMessage(() => adapter.login('demo-user', 'password-second-99cc'));
    assert.match(message, /^Login failed:/);
    assertNoSecrets(message, [
      accessToken,
      'password-first-99cc',
      'password-second-99cc',
      'password-echo-99cc',
      'access-echo-99cc',
    ]);

    await adapter.getOrderStatus('order-1');
    const orders = calls(requests, 'GET', '/orders/order-1');
    assert.equal(orders[0].authorization, `Bearer ${accessToken}`);
  });
});

test('refresh 200 keeps the original refresh token when the body omits one', async () => {
  const refreshToken = 'refresh-token-rotate-aa11';
  const firstAccess = 'access-token-before-refresh-aa11';
  const secondAccess = 'access-token-after-refresh-aa11';
  let refreshes = 0;
  await withAdapter(async (request, res) => {
    if (request.method === 'POST' && request.url === '/auth/login') {
      send(res, 200, {
        access_token: firstAccess,
        refresh_token: refreshToken,
        expires_in: 3600,
      });
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/refresh') {
      refreshes += 1;
      send(res, 200, {
        access_token: refreshes === 1 ? secondAccess : 'access-token-third-aa11',
        token_type: 'bearer',
        expires_in: 900,
      });
      return;
    }
    if (request.method === 'GET' && request.url === '/orders/order-1') {
      send(res, 200, { id: 'order-1' });
      return;
    }
    send(res, 404, problem(404, 'NOT_FOUND', request.url));
  }, async (adapter, requests) => {
    await adapter.login('demo-user', 'password-aa11');
    const refreshed = await adapter.authRefresh();
    assert.deepEqual(refreshed, { status: 'complete', expires_in: 900 });
    assertNoSecrets(JSON.stringify(refreshed), [firstAccess, secondAccess, refreshToken]);

    await adapter.getOrderStatus('order-1');
    assert.equal(
      calls(requests, 'GET', '/orders/order-1')[0].authorization,
      `Bearer ${secondAccess}`
    );

    await adapter.authRefresh();
    const refreshCalls = calls(requests, 'POST', '/auth/refresh');
    assert.equal(refreshCalls.length, 2);
    assert.deepEqual(refreshCalls[1].body, { refresh_token: refreshToken });
    assert.equal(JSON.stringify(refreshCalls[1].body).includes(secondAccess), false);
  });
});

test('refresh 401 drops the refresh token and keeps the access token', async () => {
  const accessToken = 'access-token-refresh401-bb22';
  const refreshToken = 'refresh-token-refresh401-bb22';
  let refreshes = 0;
  await withAdapter(async (request, res) => {
    if (request.method === 'POST' && request.url === '/auth/login') {
      send(res, 200, {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 3600,
      });
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/refresh') {
      refreshes += 1;
      send(res, 401, problem(401, 'INVALID_TOKEN', 'Refresh token is dead.', {
        refresh_token: refreshToken,
        access_token: accessToken,
      }));
      return;
    }
    if (request.method === 'GET' && request.url === '/orders/order-1') {
      send(res, 200, { id: 'order-1' });
      return;
    }
    if (request.method === 'GET' && request.url === '/detect') {
      send(res, 200, demoDetect);
      return;
    }
    send(res, 404, problem(404, 'NOT_FOUND', request.url));
  }, async (adapter, requests) => {
    await adapter.login('demo-user', 'password-bb22');
    const message = await rejectMessage(() => adapter.authRefresh());
    assert.match(message, /Run fastbuy_login again/);
    assertNoSecrets(message, [accessToken, refreshToken, 'password-bb22']);
    assert.equal(refreshes, 1);

    await adapter.getOrderStatus('order-1');
    assert.equal(
      calls(requests, 'GET', '/orders/order-1')[0].authorization,
      `Bearer ${accessToken}`
    );

    const before = calls(requests, 'POST', '/auth/refresh').length;
    await assert.rejects(() => adapter.authRefresh());
    assert.equal(calls(requests, 'POST', '/auth/refresh').length, before);
  });
});

test('cart add still sends the stored Bearer token', async () => {
  const accessToken = 'access-token-cart-cc33';
  await withAdapter(async (request, res) => {
    if (request.method === 'POST' && request.url === '/auth/login') {
      send(res, 200, { access_token: accessToken, refresh_token: 'refresh-cart-cc33', expires_in: 3600 });
      return;
    }
    if (request.method === 'POST' && request.url === '/cart/add') {
      send(res, 200, { cart: { id: 'cart-1' } });
      return;
    }
    send(res, 404, problem(404, 'NOT_FOUND', request.url));
  }, async (adapter, requests) => {
    await adapter.login('demo-user', 'password-cc33');
    await adapter.addToCart({ productId: 'sku-1' });
    const carts = calls(requests, 'POST', '/cart/add');
    assert.equal(carts.length, 1);
    assert.equal(carts[0].authorization, `Bearer ${accessToken}`);
  });
});

test('expired access token blocks order status and clears the poll token', async () => {
  const accessToken = 'access-token-expired-dd44';
  const pollToken = 'poll-token-expired-dd44';
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;

  try {
    await withAdapter(async (request, res) => {
      if (request.method === 'GET' && request.url === '/detect') {
        send(res, 200, customerDetect);
        return;
      }
      if (request.method === 'POST' && request.url === '/auth/login') {
        send(res, 200, { access_token: accessToken, expires_in: 3600 });
        return;
      }
      if (request.method === 'POST' && request.url === '/auth/customer/start') {
        send(res, 200, {
          loginUrl: 'https://shop.example/login',
          userCode: 'ABCD',
          pollToken,
        });
        return;
      }
      if (request.method === 'GET' && request.url.startsWith('/orders/')) {
        send(res, 200, { id: 'order-1' });
        return;
      }
      if (request.method === 'POST' && request.url === '/auth/customer/poll') {
        send(res, 500, problem(500, 'UNEXPECTED', 'poll should not be called'));
        return;
      }
      send(res, 404, problem(404, 'NOT_FOUND', request.url));
    }, async (adapter, requests) => {
      await adapter.login('demo-user', 'password-dd44');
      await adapter.customerLoginStart();
      now += 3600 * 1000 + 1;

      const message = await rejectMessage(() => adapter.getOrderStatus('order-1'));
      assert.match(message, /fastbuy_customer_login_start/);
      assert.match(message, /session expired/i);
      assert.equal(/poll/i.test(message), false);
      assert.equal(message.includes('fastbuy_get_order_status'), false);
      assertNoSecrets(message, [accessToken, pollToken, 'password-dd44']);
      assert.equal(requests.some((request) => request.url.startsWith('/orders/')), false);

      const afterFirst = requests.length;
      const second = await rejectMessage(() => adapter.getOrderStatus('order-1'));
      assert.equal(requests.length, afterFirst);
      assert.equal(/poll/i.test(second), false);
      assert.equal(second.includes('fastbuy_get_order_status'), false);

      await assert.rejects(() => adapter.customerLoginPoll());
      assert.equal(calls(requests, 'POST', '/auth/customer/poll').length, 0);
    });
  } finally {
    Date.now = originalNow;
  }
});

test('expired access token with a stored refresh token names fastbuy_auth_refresh and does not call the network', async () => {
  const accessToken = 'access-token-expired-refresh-aa77';
  const refreshToken = 'refresh-token-expired-aa77';
  const pollToken = 'poll-token-expired-refresh-aa77';
  const nextAccess = 'access-token-after-expiry-refresh-aa77';
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;

  try {
    await withAdapter(async (request, res) => {
      if (request.method === 'GET' && request.url === '/detect') {
        send(res, 200, customerDetect);
        return;
      }
      if (request.method === 'POST' && request.url === '/auth/login') {
        send(res, 200, {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: 3600,
        });
        return;
      }
      if (request.method === 'POST' && request.url === '/auth/customer/start') {
        send(res, 200, {
          loginUrl: 'https://shop.example/login',
          userCode: 'ABCD',
          pollToken,
        });
        return;
      }
      if (request.method === 'GET' && request.url.startsWith('/orders/')) {
        send(res, 500, problem(500, 'UNEXPECTED', 'order should not be called'));
        return;
      }
      if (request.method === 'POST' && request.url === '/auth/refresh') {
        send(res, 200, { access_token: nextAccess, expires_in: 600 });
        return;
      }
      if (request.method === 'POST' && request.url === '/auth/customer/poll') {
        send(res, 500, problem(500, 'UNEXPECTED', 'poll should not be called'));
        return;
      }
      send(res, 404, problem(404, 'NOT_FOUND', request.url));
    }, async (adapter, requests) => {
      await adapter.login('demo-user', 'password-aa77');
      await adapter.customerLoginStart();
      now += 3600 * 1000 + 1;

      const before = requests.length;
      const message = await rejectMessage(() => adapter.getOrderStatus('order-1'));
      assert.equal(requests.length, before);
      assert.match(message, /fastbuy_auth_refresh/);
      assert.match(message, /Run fastbuy_auth_refresh once/);
      assert.match(message, /session expired/i);
      assert.equal(/poll/i.test(message), false);
      assert.equal(message.includes('fastbuy_customer_login_start'), false);
      assert.equal(message.includes('fastbuy_get_order_status'), false);
      assertNoSecrets(message, [accessToken, refreshToken, pollToken, 'password-aa77']);

      const afterFirst = requests.length;
      await assert.rejects(() => adapter.getOrderStatus('order-2'));
      assert.equal(requests.length, afterFirst);
      assert.equal(requests.some((request) => request.url.startsWith('/orders/')), false);

      const pollMessage = await rejectMessage(() => adapter.customerLoginPoll());
      assert.match(pollMessage, /nothing to poll/);
      assert.equal(calls(requests, 'POST', '/auth/customer/poll').length, 0);

      const refreshed = await adapter.authRefresh();
      assert.deepEqual(refreshed, { status: 'complete', expires_in: 600 });
      const refreshCalls = calls(requests, 'POST', '/auth/refresh');
      assert.equal(refreshCalls.length, 1);
      assert.deepEqual(refreshCalls[0].body, { refresh_token: refreshToken });
      assertNoSecrets(JSON.stringify(refreshed), [accessToken, refreshToken, nextAccess]);
    });
  } finally {
    Date.now = originalNow;
  }
});

test('order status 401 AUTHENTICATION_REQUIRED clears the session and names customer start', async () => {
  const accessToken = 'access-token-authreq-ee55';
  const pollToken = 'poll-token-authreq-ee55';
  await withAdapter(async (request, res) => {
    if (request.method === 'GET' && request.url === '/detect') {
      send(res, 200, customerDetect);
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/login') {
      send(res, 200, { access_token: accessToken, expires_in: 3600 });
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/customer/start') {
      send(res, 200, {
        loginUrl: 'https://shop.example/login',
        userCode: 'ABCD',
        pollToken,
      });
      return;
    }
    if (request.method === 'GET' && request.url === '/orders/order-1') {
      send(res, 401, problem(401, 'AUTHENTICATION_REQUIRED', 'Sign in required.', {
        access_token: accessToken,
        pollToken,
      }));
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/customer/poll') {
      send(res, 500, problem(500, 'UNEXPECTED', 'poll should not be called'));
      return;
    }
    send(res, 404, problem(404, 'NOT_FOUND', request.url));
  }, async (adapter, requests) => {
    await adapter.login('demo-user', 'password-ee55');
    await adapter.customerLoginStart();
    const message = await rejectMessage(() => adapter.getOrderStatus('order-1'));
    assert.match(message, /AUTHENTICATION_REQUIRED/);
    assert.match(message, /fastbuy_customer_login_start/);
    assert.equal(message.includes('fastbuy_customer_login_poll'), false);
    assert.equal(message.includes('fastbuy_get_order_status'), false);
    assert.equal(/poll/i.test(message), false);
    assertNoSecrets(message, [accessToken, pollToken, 'password-ee55']);

    const pollMessage = await rejectMessage(() => adapter.customerLoginPoll());
    assert.equal(calls(requests, 'POST', '/auth/customer/poll').length, 0);
    assert.equal(pollMessage.includes('fastbuy_get_order_status'), false);
    assert.match(pollMessage, /nothing to poll/);

    const orders = calls(requests, 'GET', '/orders/order-1');
    assert.equal(orders.length, 1);
    const after = requests.length;
    await assert.rejects(() => adapter.getOrderStatus('order-1'));
    assert.equal(calls(requests, 'GET', '/orders/order-1').length, orders.length);
    assert.equal(requests.length, after);
  });
});

test('order status 401 INVALID_TOKEN keeps the refresh token and names fastbuy_auth_refresh', async () => {
  const accessToken = 'access-token-invalid-ff66';
  const refreshToken = 'refresh-token-invalid-ff66';
  const pollToken = 'poll-token-invalid-ff66';
  const nextAccess = 'access-token-after-invalid-ff66';
  await withAdapter(async (request, res) => {
    if (request.method === 'GET' && request.url === '/detect') {
      send(res, 200, customerDetect);
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/login') {
      send(res, 200, {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 3600,
      });
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/customer/start') {
      send(res, 200, {
        loginUrl: 'https://shop.example/login',
        userCode: 'ABCD',
        pollToken,
      });
      return;
    }
    if (request.method === 'GET' && request.url === '/orders/order-1') {
      send(res, 401, problem(401, 'INVALID_TOKEN', 'The bearer is not valid.', {
        access_token: accessToken,
        refresh_token: refreshToken,
        pollToken,
      }));
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/refresh') {
      send(res, 200, { access_token: nextAccess, expires_in: 600 });
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/customer/poll') {
      send(res, 500, problem(500, 'UNEXPECTED', 'poll should not be called'));
      return;
    }
    send(res, 404, problem(404, 'NOT_FOUND', request.url));
  }, async (adapter, requests) => {
    await adapter.login('demo-user', 'password-ff66');
    await adapter.customerLoginStart();
    const message = await rejectMessage(() => adapter.getOrderStatus('order-1'));
    assert.match(message, /INVALID_TOKEN/);
    assert.match(message, /fastbuy_auth_refresh/);
    assert.match(message, /Do not send the password again unless refresh fails/);
    assert.equal(message.includes('fastbuy_customer_login_start'), false);
    assert.equal(message.includes('customer start'), false);
    assert.equal(/poll/i.test(message), false);
    assert.equal(message.includes('fastbuy_get_order_status'), false);
    assertNoSecrets(message, [accessToken, refreshToken, pollToken, 'password-ff66']);

    const refreshed = await adapter.authRefresh();
    assert.deepEqual(refreshed, { status: 'complete', expires_in: 600 });
    const refreshCalls = calls(requests, 'POST', '/auth/refresh');
    assert.equal(refreshCalls.length, 1);
    assert.deepEqual(refreshCalls[0].body, { refresh_token: refreshToken });
    assert.equal(calls(requests, 'POST', '/auth/customer/poll').length, 0);
  });
});

test('problem bodies do not echo token fields', async () => {
  const accessToken = 'access-token-echo-ab12';
  const refreshToken = 'refresh-token-echo-ab12';
  const pollToken = 'poll-token-echo-ab12';
  const password = 'password-echo-ab12';
  await withAdapter(async (request, res) => {
    send(res, 400, problem(400, 'INVALID_REQUEST', 'The credentials were rejected.', {
      access_token: accessToken,
      refresh_token: refreshToken,
      pollToken,
      password,
    }));
  }, async (adapter) => {
    const message = await rejectMessage(() => adapter.login('demo-user', password));
    assert.match(message, /^Login failed:/);
    assert.match(message, /INVALID_REQUEST/);
    assert.match(message, /The credentials were rejected/);
    assertNoSecrets(message, [accessToken, refreshToken, pollToken, password]);
  });
});

test('setBaseUrl clears stored tokens and reauth', async () => {
  const accessToken = 'access-token-base-cd34';
  const refreshToken = 'refresh-token-base-cd34';
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;

  try {
    await withAdapter(async (request, res) => {
      if (request.method === 'GET' && request.url === '/detect') {
        send(res, 200, demoDetect);
        return;
      }
      if (request.method === 'POST' && request.url === '/auth/login') {
        send(res, 200, {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: 60,
        });
        return;
      }
      if (request.method === 'GET' && request.url === '/orders/order-1') {
        send(res, 200, { id: 'order-1', status: 'open' });
        return;
      }
      send(res, 500, problem(500, 'UNEXPECTED', request.url));
    }, async (adapter, requests, baseUrl) => {
      await adapter.login('demo-user', 'password-cd34');
      now += 60 * 1000 + 1;
      await assert.rejects(() => adapter.getOrderStatus('order-1'));
      assert.equal(requests.some((request) => request.url.startsWith('/orders/')), false);

      adapter.setBaseUrl(baseUrl);
      await adapter.getOrderStatus('order-1');
      const orders = calls(requests, 'GET', '/orders/order-1');
      assert.equal(orders.length, 1);
      assert.equal(orders[0].authorization, null);

      const before = calls(requests, 'POST', '/auth/refresh').length;
      await assert.rejects(() => adapter.authRefresh());
      assert.equal(calls(requests, 'POST', '/auth/refresh').length, before);
    });
  } finally {
    Date.now = originalNow;
  }
});

test('tool descriptions include the poll and order-status sentences', () => {
  const sourceRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const indexSource = readFileSync(path.join(sourceRoot, 'index.ts'), 'utf8');
  const mockSource = readFileSync(path.join(sourceRoot, 'index-mock.ts'), 'utf8');

  for (const sentence of POLL_SENTENCES) {
    assert.equal(indexSource.includes(sentence), true, sentence);
  }
  for (const sentence of ORDER_STATUS_SENTENCES) {
    assert.equal(indexSource.includes(sentence), true, sentence);
  }

  assert.equal(mockSource.includes('fastbuy_customer_login_start'), false);
  assert.equal(mockSource.includes('fastbuy_customer_login_poll'), false);
  assert.equal(mockSource.includes('fastbuy_login'), false);
  assert.equal(mockSource.includes('fastbuy_auth_refresh'), false);
});
