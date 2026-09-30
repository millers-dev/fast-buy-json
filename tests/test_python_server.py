import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src" / "python"))

from server import app, reset_demo_state  # noqa: E402


API = "/api/fastbuyjson"


@pytest.fixture
def client():
    reset_demo_state()
    with TestClient(app) as test_client:
        yield test_client
    reset_demo_state()


def login(client, username="demo", password="password123"):
    response = client.post(
        f"{API}/auth/login", json={"username": username, "password": password}
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_jwt_identity_is_not_spoofable_with_x_user_id(client):
    token = login(client)
    added = client.post(
        f"{API}/cart/add",
        json={"productId": "acme-wh-001", "quantity": 1},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert added.status_code == 200
    cart_id = added.json()["cart"]["id"]

    spoofed = client.get(f"{API}/cart/{cart_id}", headers={"X-User-Id": "user1"})
    assert spoofed.status_code == 404

    owned = client.get(
        f"{API}/cart/{cart_id}", headers={"Authorization": f"Bearer {token}"}
    )
    assert owned.status_code == 200
    assert owned.json()["cart"]["id"] == cart_id


def test_idempotency_replays_success_and_ignores_failed_keys(client):
    key = "py-idem-1"
    missing = client.post(
        f"{API}/cart/add",
        json={"productId": "missing", "quantity": 1},
        headers={"Idempotency-Key": key},
    )
    assert missing.status_code == 404

    first = client.post(
        f"{API}/cart/add",
        json={"productId": "acme-wh-001", "quantity": 1},
        headers={"Idempotency-Key": key},
    )
    assert first.status_code == 200
    quantity = first.json()["cart"]["items"][0]["quantity"]

    replay = client.post(
        f"{API}/cart/add",
        json={"productId": "acme-wh-001", "quantity": 1},
        headers={"Idempotency-Key": key},
    )
    assert replay.status_code == 200
    assert replay.json()["cart"]["items"][0]["quantity"] == quantity


def test_checkout_requires_issued_verification_token(client):
    added = client.post(
        f"{API}/cart/add", json={"productId": "acme-wh-001", "quantity": 1}
    )
    assert added.status_code == 200
    initiated = client.post(
        f"{API}/checkout/initiate",
        json={
            "cartId": added.json()["cart"]["id"],
            "shippingAddress": {
                "line1": "123 Main St",
                "city": "Berlin",
                "country": "DE",
                "postalCode": "10115",
            },
            "customerInfo": {
                "email": "customer@example.com",
                "phone": "+49 30 12345678",
            },
        },
    )
    assert initiated.status_code == 200
    verification = initiated.json()["verificationToken"]

    bad = client.post(
        f"{API}/checkout/confirm",
        json={
            "sessionToken": initiated.json()["sessionToken"],
            "paymentDetails": {
                "method": "credit_card",
                "transactionVerification": {
                    "verificationMethod": "email_confirmation",
                    "verificationToken": "wrong",
                },
            },
        },
    )
    assert bad.status_code == 400

    confirmed = client.post(
        f"{API}/checkout/confirm",
        json={
            "sessionToken": initiated.json()["sessionToken"],
            "paymentDetails": {
                "method": "credit_card",
                "transactionVerification": {
                    "verificationMethod": "email_confirmation",
                    "verificationToken": verification,
                },
            },
        },
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["order"]["status"] == "confirmed"


def test_name_sort(client):
    response = client.post(f"{API}/products/search", json={"sort": "name_asc"})
    assert response.status_code == 200
    names = [item["name"] for item in response.json()["results"]]
    assert names == sorted(names)


def test_detect_spec_version(client):
    response = client.get(f"{API}/detect")
    assert response.status_code == 200
    body = response.json()
    assert body["standard"] == "FastBuyJSON"
    assert body["specVersion"] == "0.4.0"
    assert body["implementationVersion"] == "0.4.0"
    assert response.headers.get("cache-control") == "public, max-age=300"


def test_product_not_found_problem_json(client):
    response = client.post(
        f"{API}/cart/add",
        json={"productId": "missing", "quantity": 1},
    )
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/problem+json")
    body = response.json()
    assert body["code"] == "PRODUCT_NOT_FOUND"
    assert body["status"] == 404


def test_invalid_bearer_problem_json(client):
    response = client.get(
        f"{API}/cart",
        headers={"Authorization": "Bearer not-a-jwt"},
    )
    assert response.status_code == 401
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["code"] == "INVALID_TOKEN"
    assert "Bearer" in response.headers.get("www-authenticate", "")


def test_patch_cart_item_quantity(client):
    added = client.post(
        f"{API}/cart/add", json={"productId": "acme-wh-001", "quantity": 1}
    )
    item_id = added.json()["cart"]["items"][0]["itemId"]
    patched = client.patch(
        f"{API}/cart/items/{item_id}", json={"quantity": 5}
    )
    assert patched.status_code == 200
    assert patched.json()["cart"]["items"][0]["quantity"] == 5


def test_patch_rejects_low_quantity(client):
    added = client.post(
        f"{API}/cart/add", json={"productId": "acme-wh-001", "quantity": 1}
    )
    item_id = added.json()["cart"]["items"][0]["itemId"]
    bad = client.patch(f"{API}/cart/items/{item_id}", json={"quantity": 0})
    assert bad.status_code == 400
    assert bad.json()["code"] == "VALIDATION_ERROR"


def test_delete_cart_item_and_clear_cart(client):
    added = client.post(
        f"{API}/cart/add", json={"productId": "acme-wh-001", "quantity": 2}
    )
    cart_id = added.json()["cart"]["id"]
    item_id = added.json()["cart"]["items"][0]["itemId"]
    removed = client.delete(f"{API}/cart/items/{item_id}")
    assert removed.status_code == 200
    assert removed.json()["cart"]["items"] == []

    client.post(f"{API}/cart/add", json={"productId": "acme-wh-001", "quantity": 1})
    cleared = client.delete(f"{API}/cart")
    assert cleared.status_code == 200
    body = cleared.json()["cart"]
    assert body["id"] == cart_id
    assert body["items"] == []
    assert body["totals"]["total"] == 0
    assert body["totals"]["discount"] == 0


def test_cart_item_not_found(client):
    client.post(f"{API}/cart/add", json={"productId": "acme-wh-001", "quantity": 1})
    missing = client.delete(
        f"{API}/cart/items/00000000-0000-4000-8000-000000000099"
    )
    assert missing.status_code == 404
    assert missing.json()["code"] == "CART_ITEM_NOT_FOUND"


def test_idempotency_conflict(client):
    key = "py-idem-conflict"
    first = client.post(
        f"{API}/cart/add",
        json={"productId": "acme-wh-001", "quantity": 1},
        headers={"Idempotency-Key": key},
    )
    assert first.status_code == 200
    conflict = client.post(
        f"{API}/cart/add",
        json={"productId": "acme-wh-001", "quantity": 2},
        headers={"Idempotency-Key": key},
    )
    assert conflict.status_code == 409
    assert conflict.json()["code"] == "IDEMPOTENCY_KEY_CONFLICT"


def test_idempotency_expired_record(client):
    from idempotency import idempotency_store

    key = "py-idem-expired"
    first = client.post(
        f"{API}/cart/add",
        json={"productId": "acme-wh-001", "quantity": 1},
        headers={"Idempotency-Key": key},
    )
    assert first.status_code == 200
    record = idempotency_store.get(f"anonymous:{key}")
    assert record is not None
    from datetime import datetime, timedelta

    record["expiresAt"] = (datetime.now() - timedelta(hours=1)).isoformat()

    second = client.post(
        f"{API}/cart/add",
        json={"productId": "acme-wh-001", "quantity": 2},
        headers={"Idempotency-Key": key},
    )
    assert second.status_code == 200
    assert second.json()["cart"]["items"][0]["quantity"] == 3


def test_idempotency_replayed_header(client):
    key = "py-idem-header"
    first = client.post(
        f"{API}/cart/add",
        json={"productId": "acme-wh-001", "quantity": 1},
        headers={"Idempotency-Key": key},
    )
    assert first.status_code == 200
    replay = client.post(
        f"{API}/cart/add",
        json={"productId": "acme-wh-001", "quantity": 1},
        headers={"Idempotency-Key": key},
    )
    assert replay.status_code == 200
    assert replay.headers.get("idempotency-replayed") == "true"


def test_typed_filters_and_totals(client):
    search = client.post(
        "/api/fastbuyjson/products/search",
        json={
            "filters": {
                "brand": "Acme",
                "categories": ["Headphones"],
                "priceRange": {"min": 90, "max": 210},
            }
        },
    )
    assert search.status_code == 200
    assert search.json()["pagination"]["totalItems"] == 2

    added = client.post(
        "/api/fastbuyjson/cart/add",
        json={"productId": "acme-wh-002", "quantity": 1},
    )
    totals = added.json()["cart"]["totals"]
    assert totals["subtotal"] == 99.99
    assert totals["shipping"] == 10
    assert totals["tax"] == 10
    assert totals["total"] == 119.99


def test_discount_and_detect_capabilities(client):
    client.post(
        "/api/fastbuyjson/cart/add",
        json={"productId": "acme-wh-002", "quantity": 1},
    )
    applied = client.post(
        "/api/fastbuyjson/cart/discount", json={"code": "SAVE10"}
    )
    assert applied.status_code == 200
    assert applied.json()["cart"]["totals"]["discount"] == 10

    detect = client.get("/api/fastbuyjson/detect")
    body = detect.json()
    assert body["specVersion"] == "0.4.0"
    assert "capabilities" in body
    assert "discounts" in body["supportedFeatures"]
