"""Idempotency store and request fingerprinting for FastBuyJSON POST mutations."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta
from typing import Any, Dict, Literal, Optional, TypedDict, Union

from fastapi.responses import JSONResponse

TTL_HOURS = 24

idempotency_store: Dict[str, Dict[str, Any]] = {}


def clear_idempotency_store() -> None:
    idempotency_store.clear()


def canonical_json(body: Any) -> str:
    if body is None:
        body = {}
    return json.dumps(body, sort_keys=True, separators=(",", ":"))


def compute_idempotency_fingerprint(method: str, route_path: str, body: Any) -> str:
    payload = f"{method}\n{route_path}\n{canonical_json(body)}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _storage_key(scope: str, key: str) -> str:
    return f"{scope}:{key}"


def _is_expired(record: Dict[str, Any]) -> bool:
    expires_at = record.get("expiresAt")
    if not expires_at:
        return True
    return datetime.fromisoformat(expires_at) <= datetime.now()


class IdempotencyContinue(TypedDict):
    kind: Literal["continue"]


class IdempotencyReplay(TypedDict):
    kind: Literal["replay"]
    status: int
    body: Dict[str, Any]


class IdempotencyConflict(TypedDict):
    kind: Literal["conflict"]


IdempotencyLookup = Union[IdempotencyContinue, IdempotencyReplay, IdempotencyConflict]


def lookup_idempotency(
    scope: str, key: str, fingerprint: str
) -> IdempotencyLookup:
    composite = _storage_key(scope, key)
    existing = idempotency_store.get(composite)
    if not existing:
        return {"kind": "continue"}
    if _is_expired(existing):
        del idempotency_store[composite]
        return {"kind": "continue"}
    if existing.get("fingerprint") != fingerprint:
        return {"kind": "conflict"}
    return {
        "kind": "replay",
        "status": existing["status"],
        "body": existing["body"],
    }


def store_idempotency(
    scope: str,
    key: str,
    fingerprint: str,
    status: int,
    body: Dict[str, Any],
) -> None:
    if status < 200 or status >= 300:
        return
    created_at = datetime.now()
    expires_at = created_at + timedelta(hours=TTL_HOURS)
    idempotency_store[_storage_key(scope, key)] = {
        "scope": scope,
        "key": key,
        "fingerprint": fingerprint,
        "status": status,
        "body": body,
        "createdAt": created_at.isoformat(),
        "expiresAt": expires_at.isoformat(),
    }


def idempotency_replay_response(status: int, body: Dict[str, Any]) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content=body,
        headers={"Idempotency-Replayed": "true", "Cache-Control": "no-store"},
    )
