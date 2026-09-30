/**
 * Idempotency store and request fingerprinting for FastBuyJSON POST mutations.
 */

import { createHash } from "node:crypto";

const TTL_MS = 24 * 60 * 60 * 1000;

/** @type {Map<string, { scope: string, key: string, fingerprint: string, status: number, body: object, createdAt: string, expiresAt: string }>} */
export const idempotencyStore = new Map();

export function clearIdempotencyStore() {
  idempotencyStore.clear();
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

export function canonicalJson(body) {
  if (body === undefined || body === null) {
    return stableStringify({});
  }
  return stableStringify(body);
}

export function computeIdempotencyFingerprint(method, routePath, body) {
  const payload = `${method}\n${routePath}\n${canonicalJson(body)}`;
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

function storageKey(scope, key) {
  return `${scope}:${key}`;
}

function purgeIfExpired(record) {
  if (!record?.expiresAt) {
    return true;
  }
  return Date.parse(record.expiresAt) <= Date.now();
}

/**
 * @returns {{ kind: 'continue' } | { kind: 'replay', status: number, body: object } | { kind: 'conflict' }}
 */
export function lookupIdempotency(scope, key, fingerprint) {
  const composite = storageKey(scope, key);
  const existing = idempotencyStore.get(composite);
  if (!existing) {
    return { kind: "continue" };
  }
  if (purgeIfExpired(existing)) {
    idempotencyStore.delete(composite);
    return { kind: "continue" };
  }
  if (existing.fingerprint !== fingerprint) {
    return { kind: "conflict" };
  }
  return { kind: "replay", status: existing.status, body: existing.body };
}

export function storeIdempotency(scope, key, fingerprint, status, body) {
  if (status < 200 || status >= 300) {
    return;
  }
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  idempotencyStore.set(storageKey(scope, key), {
    scope,
    key,
    fingerprint,
    status,
    body,
    createdAt,
    expiresAt,
  });
}
