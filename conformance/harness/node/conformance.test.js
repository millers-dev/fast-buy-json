import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import app, { resetDemoState } from "../../../src/server.js";

const API = "/api/fastbuyjson";
const CASES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../cases");

let server;
let baseUrl;

before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

function getByPath(obj, path) {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) {
      return undefined;
    }
    if (/^\d+$/.test(part)) {
      current = current[Number(part)];
    } else {
      current = current[part];
    }
  }
  return current;
}

function substitute(value, vars) {
  if (typeof value === "string") {
    return value.replace(/\{\{(\w+)\}\}/g, (_, name) => {
      if (!(name in vars)) {
        throw new Error(`Unknown template variable: ${name}`);
      }
      return String(vars[name]);
    });
  }
  if (Array.isArray(value)) {
    return value.map((item) => substitute(item, vars));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = substitute(val, vars);
    }
    return out;
  }
  return value;
}

async function login(username = "demo", password = "password123") {
  const response = await fetch(`${baseUrl}${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(response.status, 200);
  const json = await response.json();
  return json.access_token;
}

async function runStep(step, vars) {
  const { request: req, expect: expected, capture } = step;
  const path = substitute(req.path, vars);
  const headers = { "content-type": "application/json", ...substitute(req.headers || {}, vars) };

  if (req.auth?.username) {
    const token = await login(
      req.auth.username,
      req.auth.password || "password123"
    );
    headers.authorization = `Bearer ${token}`;
  }

  const body = req.body === undefined ? undefined : substitute(req.body, vars);
  const response = await fetch(`${baseUrl}${API}${path}`, {
    method: req.method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const json = await response.json().catch(() => null);
  const responseHeaders = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key.toLowerCase()] = value;
  });

  assert.equal(response.status, expected.status, `Expected status ${expected.status}`);

  if (expected.code) {
    assert.equal(json?.code, expected.code, `Expected code ${expected.code}`);
  }

  if (expected.headers) {
    for (const [name, value] of Object.entries(expected.headers)) {
      const key = name.toLowerCase();
      if (value === null) {
        assert.equal(responseHeaders[key], undefined, `Expected header ${name} absent`);
      } else {
        assert.equal(responseHeaders[key], value, `Header ${name}`);
      }
    }
  }

  if (expected.body) {
    for (const [dotPath, want] of Object.entries(expected.body)) {
      const actual = getByPath(json, dotPath);
      const expectedValue = substitute(want, vars);
      assert.deepEqual(actual, expectedValue, `body.${dotPath}`);
    }
  }

  if (capture) {
    for (const [varName, dotPath] of Object.entries(capture)) {
      vars[varName] = getByPath(json, dotPath);
      assert.ok(vars[varName] !== undefined, `capture ${varName} from ${dotPath}`);
    }
  }
}

function loadCaseFiles() {
  return readdirSync(CASES_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const raw = readFileSync(join(CASES_DIR, name), "utf8");
      return JSON.parse(raw);
    });
}

for (const caseFile of loadCaseFiles()) {
  for (const scenario of caseFile.scenarios) {
    test(`[${caseFile.suite}] ${scenario.name}`, async () => {
      resetDemoState();
      const vars = {};
      for (const step of scenario.steps) {
        await runStep(step, vars);
      }
    });
  }
}
