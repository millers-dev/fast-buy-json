from fastapi import FastAPI, Request, Response, HTTPException, Header, Depends, Body
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, Dict, Any, List, Set
from uuid import uuid4
from datetime import datetime, timedelta
import json
import os
import copy
from pydantic import BaseModel, Field, EmailStr

# Import auth utilities
from auth import (
    authenticate_user,
    create_access_token,
    create_refresh_token,
    refresh_access_token,
    verify_certificate,
    get_current_user,
)

app = FastAPI(
    title="FastBuyJSON Demo API",
    description="Demo server for the FastBuyJSON e-commerce API standard",
    version="1.0.0",
)

# Create a sub-application for the standardized API path
api_router = FastAPI()
app.mount("/api/fastbuyjson", api_router)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Models for authentication
class LoginRequest(BaseModel):
    username: str
    password: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class CertificateRequest(BaseModel):
    certificate: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    expires_in: int


class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class CertificateResponse(BaseModel):
    session_id: str
    expires_in: int


# Mock database
DB = {
    "products": [
        {
            "id": "acme-wh-001",
            "name": "ACME Wireless Headphones Pro",
            "brand": "Acme",
            "description": "Premium wireless headphones with noise cancellation",
            "price": {"amount": 199.99, "currency": "USD"},
            "availability": {"status": "in_stock", "quantity": 42},
            "categories": ["Electronics", "Audio", "Headphones"],
            "images": [
                {
                    "url": "https://example.com/images/acme-wh-001-main.jpg",
                    "alt": "ACME Wireless Headphones Pro - Black",
                }
            ],
            "variants": [
                {
                    "id": "acme-wh-001-black",
                    "attributes": {"color": "black"},
                    "price": {"amount": 199.99, "currency": "USD"},
                },
                {
                    "id": "acme-wh-001-white",
                    "attributes": {"color": "white"},
                    "price": {"amount": 199.99, "currency": "USD"},
                },
            ],
        },
        {
            "id": "acme-wh-002",
            "name": "ACME Wireless Headphones Lite",
            "brand": "Acme",
            "description": "Lightweight wireless headphones for everyday use",
            "price": {"amount": 99.99, "currency": "USD"},
            "availability": {"status": "in_stock", "quantity": 78},
            "categories": ["Electronics", "Audio", "Headphones"],
            "images": [
                {
                    "url": "https://example.com/images/acme-wh-002-main.jpg",
                    "alt": "ACME Wireless Headphones Lite - Silver",
                }
            ],
            "variants": [
                {
                    "id": "acme-wh-002-silver",
                    "attributes": {"color": "silver"},
                    "price": {"amount": 99.99, "currency": "USD"},
                },
                {
                    "id": "acme-wh-002-blue",
                    "attributes": {"color": "blue"},
                    "price": {"amount": 109.99, "currency": "USD"},
                },
            ],
        },
    ],
    "carts": {},
    "orders": {},
    "checkout_sessions": {},
}

# Store processed idempotency keys
processed_idempotency_keys: Set[str] = set()


def calculate_risk_score(
    customer_info: Dict, shipping_address: Dict, cart: Dict
) -> int:
    """Calculate a risk score for an order."""
    score = 0

    # Check order value
    total_value = sum(
        item.get("price", {}).get("amount", 0) * item.get("quantity", 0)
        for item in cart.get("items", [])
    )
    if total_value > 1000:
        score += 30
    elif total_value > 500:
        score += 15
    elif total_value > 200:
        score += 5

    # Check email domain reputation
    email = customer_info.get("email", "")
    if "@" in email:
        email_domain = email.split("@")[1]
        high_risk_domains = ["tempmail.com", "mailinator.com", "throwaway.com"]
        if email_domain in high_risk_domains:
            score += 25

    # Check for mismatch between email name and customer name (if provided)
    first_name = customer_info.get("firstName", "")
    last_name = customer_info.get("lastName", "")
    if first_name and last_name and "@" in email:
        email_name = email.split("@")[0].lower()
        if first_name.lower() not in email_name and last_name.lower() not in email_name:
            score += 10

    # Check for unusual shipping address patterns
    address_line1 = shipping_address.get("line1", "").lower()
    if "po box" in address_line1:
        score += 15

    # Check for high-risk countries
    country = shipping_address.get("country", "")
    high_risk_countries = ["XY", "ZZ"]  # Example fictional high-risk country codes
    if country in high_risk_countries:
        score += 20

    # Return normalized score between 0-100
    return min(max(score, 0), 100)


# Authentication endpoints


@api_router.post("/auth/login", response_model=TokenResponse)
async def login(login_data: LoginRequest):
    """
    Authenticate a user

    Authenticates a user with username and password and returns JWT tokens.
    """
    user = authenticate_user(login_data.username, login_data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    # Generate tokens
    access_token = create_access_token(
        {
            "sub": user["id"],
            "username": user["username"],
            "email": user["email"],
            "roles": user["roles"],
        }
    )
    refresh_token = create_refresh_token(user["id"])

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": 3600,
    }


@api_router.post("/auth/refresh", response_model=RefreshResponse)
async def refresh(refresh_data: RefreshTokenRequest):
    """
    Refresh JWT token

    Refreshes an expired JWT token using a refresh token.
    """
    result = refresh_access_token(refresh_data.refresh_token)
    if not result:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    return result


@api_router.post("/auth/certificate", response_model=CertificateResponse)
async def certificate_verify(cert_data: CertificateRequest):
    """
    Verify client certificate

    Verifies a client certificate for mutual TLS authentication.
    """
    result = verify_certificate(cert_data.certificate)
    if not result:
        raise HTTPException(status_code=401, detail="Certificate verification failed")

    return result


@api_router.get("/detect")
async def detect_fastbuyjson():
    """
    Detect FastBuyJSON Support

    Allows AI agents to detect if a website supports the FastBuyJSON standard.
    Returns basic information about the API implementation.
    """
    return {
        "standard": "FastBuyJSON 1.0.0",
        "implementationVersion": "0.1.0",
        "supportedFeatures": [
            "idempotency",
            "pagination",
            "schema_validation",
            "authentication",
            "anonymous_cart",
            "guest_checkout",
        ],
        "endpoints": ["products", "cart", "checkout", "orders", "auth"],
        "authentication": {
            "methods": ["jwt", "certificate", "anonymous"],
            "endpoints": ["/auth/login", "/auth/refresh", "/auth/certificate"],
        },
        "checkout": {
            "methods": ["registered_user", "guest_checkout"],
            "verification": ["email", "phone", "credit_card"],
        },
        "merchantInfo": {
            "name": "FastBuyJSON Demo Store",
            "url": "https://example.com",
        },
    }


@api_router.post("/products/search")
async def search_products(request: Request):
    data = await request.json()

    query = data.get("query", "")
    filters = data.get("filters", {})
    sort = data.get("sort")
    page = data.get("page", 1)
    page_size = data.get("pageSize", 10)

    # Apply text search
    if query:
        query = query.lower()
        results = [
            product
            for product in DB["products"]
            if query in product["name"].lower()
            or query in product["description"].lower()
            or query in product["brand"].lower()
        ]
    else:
        results = copy.deepcopy(DB["products"])

    # Apply filters
    if filters:
        if "brand" in filters:
            brand = filters["brand"].lower()
            results = [
                product for product in results if product["brand"].lower() == brand
            ]

        # Add more filter handling as needed

    # Apply sorting
    if sort:
        if sort == "price_asc":
            results.sort(key=lambda p: p["price"]["amount"])
        elif sort == "price_desc":
            results.sort(key=lambda p: p["price"]["amount"], reverse=True)
        # Add more sorting options as needed

    # Apply pagination
    total_items = len(results)
    start_index = (page - 1) * page_size
    end_index = start_index + page_size
    paginated_results = results[start_index:end_index]

    return {
        "results": paginated_results,
        "pagination": {
            "currentPage": page,
            "pageSize": page_size,
            "totalItems": total_items,
            "totalPages": (total_items + page_size - 1) // page_size,
        },
    }


@api_router.post("/cart/add")
async def add_to_cart(request: Request, idempotency_key: Optional[str] = Header(None)):
    # Check idempotency
    if idempotency_key and idempotency_key in processed_idempotency_keys:
        return Response(
            status_code=409,
            content=json.dumps(
                {
                    "error": "Idempotent request already processed",
                    "requestId": idempotency_key,
                }
            ),
            media_type="application/json",
        )

    data = await request.json()
    product_id = data.get("productId")
    quantity = data.get("quantity", 1)
    options = data.get("options", {})

    # Validate product exists
    product = next((p for p in DB["products"] if p["id"] == product_id), None)
    if not product:
        raise HTTPException(
            status_code=404,
            detail={"error": "Product not found", "productId": product_id},
        )

    # Find or create cart
    # In a real app, we would get user ID from authentication
    user_id = "anonymous"

    if user_id not in DB["carts"]:
        cart_id = str(uuid4())
        DB["carts"][user_id] = {
            "id": cart_id,
            "items": [],
            "created": datetime.now().isoformat(),
            "updated": datetime.now().isoformat(),
            "totals": {"subtotal": 0, "tax": 0, "shipping": 0, "total": 0},
        }

    cart = DB["carts"][user_id]

    # Check if item already exists in cart
    existing_item = next(
        (
            item
            for item in cart["items"]
            if item["productId"] == product_id and item["options"] == options
        ),
        None,
    )

    if existing_item:
        # Update quantity if item exists
        existing_item["quantity"] += quantity
        existing_item["lineTotal"]["amount"] = (
            existing_item["price"]["amount"] * existing_item["quantity"]
        )
    else:
        # Add new item if it doesn't exist
        variant = product

        # Check for variant if options are provided
        if "color" in options and product.get("variants"):
            matching_variant = next(
                (
                    v
                    for v in product["variants"]
                    if v["attributes"].get("color") == options["color"]
                ),
                None,
            )

            if matching_variant:
                variant = {
                    **product,
                    "id": matching_variant["id"],
                    "price": matching_variant["price"],
                }

        cart["items"].append(
            {
                "productId": variant["id"],
                "name": product["name"],
                "quantity": quantity,
                "options": options,
                "price": variant["price"],
                "lineTotal": {
                    "amount": variant["price"]["amount"] * quantity,
                    "currency": variant["price"]["currency"],
                },
            }
        )

    # Recalculate cart totals
    cart["updated"] = datetime.now().isoformat()
    cart["totals"]["subtotal"] = sum(
        item["lineTotal"]["amount"] for item in cart["items"]
    )
    cart["totals"]["tax"] = cart["totals"]["subtotal"] * 0.1  # Example 10% tax
    cart["totals"]["shipping"] = (
        0 if cart["totals"]["subtotal"] > 100 else 10
    )  # Free shipping over $100
    cart["totals"]["total"] = (
        cart["totals"]["subtotal"] + cart["totals"]["tax"] + cart["totals"]["shipping"]
    )

    # Store idempotency key
    if idempotency_key:
        processed_idempotency_keys.add(idempotency_key)

    return {"cart": cart, "message": "Item added to cart successfully"}


@api_router.get("/cart")
async def get_cart():
    # In a real app, we would get user ID from authentication
    user_id = "anonymous"

    if user_id not in DB["carts"]:
        raise HTTPException(
            status_code=404, detail={"error": "Cart not found", "userId": user_id}
        )

    return {"cart": DB["carts"][user_id]}


@api_router.get("/cart/{cart_id}")
async def get_cart_by_id(cart_id: str):
    """
    Retrieve a cart by its identifier. Useful for guest or agent workflows that
    only have a cartId. Servers should enforce authorization checks in production.
    """
    # If anonymous demo cart matches, return it
    # Check if any stored cart has matching id
    for stored in DB["carts"].values():
        if stored.get("id") == cart_id:
            return {"cart": stored}

    raise HTTPException(
        status_code=404, detail={"error": "Cart not found", "cartId": cart_id}
    )


@api_router.post("/checkout/initiate")
async def initiate_checkout(request: Request):
    data = await request.json()
    cart_id = data.get("cartId")
    shipping_address = data.get("shippingAddress")
    billing_address = data.get("billingAddress")
    customer_info = data.get("customerInfo")

    # In a real app, we would get user ID from authentication
    user_id = "anonymous"

    # Validate cart exists
    if user_id not in DB["carts"] or DB["carts"][user_id]["id"] != cart_id:
        raise HTTPException(
            status_code=404, detail={"error": "Cart not found", "cartId": cart_id}
        )

    # Validate customer info (accept either 'phone' or legacy 'phoneNumber')
    if not customer_info or not customer_info.get("email"):
        raise HTTPException(
            status_code=400,
            detail={"error": "Customer email and phone number are required"},
        )

    # Normalize phone field: prefer 'phone', fallback to 'phoneNumber'
    phone_value = customer_info.get("phone") or customer_info.get("phoneNumber")
    if not phone_value:
        raise HTTPException(
            status_code=400,
            detail={"error": "Customer email and phone number are required"},
        )

    # Validate email format
    import re

    email_regex = r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
    if not re.match(email_regex, customer_info.get("email", "")):
        raise HTTPException(status_code=400, detail={"error": "Invalid email format"})

    # Validate phone number format
    phone_regex = r"^\+?[0-9\s\-\(\)]{8,20}$"
    if not re.match(phone_regex, phone_value):
        raise HTTPException(
            status_code=400, detail={"error": "Invalid phone number format"}
        )

    # Store normalized phone back into customer_info for downstream use
    customer_info["phone"] = phone_value

    # Validate addresses
    if not shipping_address or not all(
        k in shipping_address for k in ["line1", "city", "country", "postalCode"]
    ):
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Invalid shipping address",
                "required": ["line1", "city", "country", "postalCode"],
            },
        )

    # Create checkout session
    session_token = str(uuid4())
    expires_at = datetime.now() + timedelta(hours=1)  # Session expires in 1 hour

    # Calculate risk score
    risk_score = calculate_risk_score(
        customer_info, shipping_address, DB["carts"][user_id]
    )

    DB["checkout_sessions"][session_token] = {
        "userId": user_id,
        "cartId": cart_id,
        "expiresAt": expires_at.isoformat(),
        "shippingAddress": shipping_address,
        "billingAddress": billing_address
        or shipping_address,  # Use shipping as billing if not provided
        "customerInfo": customer_info,
        "riskAssessment": {"score": risk_score, "verificationRequired": True},
    }

    return {
        "sessionToken": session_token,
        "expiresAt": expires_at.isoformat(),
        "cart": DB["carts"][user_id],
        "riskAssessment": DB["checkout_sessions"][session_token]["riskAssessment"],
    }


@api_router.post("/checkout/confirm")
async def confirm_checkout(request: Request):
    data = await request.json()
    session_token = data.get("sessionToken")
    payment_details = data.get("paymentDetails")

    # Validate session
    if session_token not in DB["checkout_sessions"]:
        raise HTTPException(
            status_code=400,
            detail={"error": "Invalid checkout session", "sessionToken": session_token},
        )

    session = DB["checkout_sessions"][session_token]

    # Check if session is expired
    expires_at = datetime.fromisoformat(session["expiresAt"])
    if expires_at < datetime.now():
        raise HTTPException(
            status_code=400,
            detail={"error": "Checkout session expired", "sessionToken": session_token},
        )

    # Validate payment details
    if not payment_details or "method" not in payment_details:
        raise HTTPException(
            status_code=400,
            detail={"error": "Invalid payment details", "required": ["method"]},
        )

    # Reject cash on delivery payments
    if payment_details.get("method") == "cash_on_delivery":
        raise HTTPException(
            status_code=400,
            detail={"error": "Cash on delivery payments are not supported"},
        )

    # Validate transaction verification
    verification = payment_details.get("transactionVerification", {})
    if (
        not verification
        or not verification.get("verificationMethod")
        or not verification.get("verificationToken")
    ):
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Transaction verification is required",
                "required": ["verificationMethod", "verificationToken"],
            },
        )

    # Check verification method
    valid_verification_methods = [
        "captcha",
        "email_confirmation",
        "sms_confirmation",
        "payment_provider_token",
        "oauth_token",
    ]

    if verification.get("verificationMethod") not in valid_verification_methods:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Invalid verification method",
                "validMethods": valid_verification_methods,
            },
        )

    # For high-risk orders, require stronger verification
    risk_score = session.get("riskAssessment", {}).get("score", 0)
    if risk_score > 50 and verification.get("verificationMethod") not in [
        "sms_confirmation",
        "payment_provider_token",
    ]:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "This order requires stronger verification due to risk assessment",
                "requiredMethods": ["sms_confirmation", "payment_provider_token"],
                "riskScore": risk_score,
            },
        )

    user_id = session["userId"]

    # Validate cart still exists
    if user_id not in DB["carts"]:
        raise HTTPException(
            status_code=404, detail={"error": "Cart not found", "userId": user_id}
        )

    # Create order
    order_id = f"ord-{datetime.now().strftime('%Y-%m-%d')}-{str(uuid4())[:6]}"

    verification = payment_details.get("transactionVerification", {})
    verification_timestamp = (
        verification.get("verificationTimestamp") or datetime.now().isoformat()
    )

    order = {
        "id": order_id,
        "userId": user_id,
        "status": "confirmed",
        "items": DB["carts"][user_id]["items"],
        "totals": DB["carts"][user_id]["totals"],
        "customerInfo": session.get("customerInfo", {}),
        "shippingAddress": session["shippingAddress"],
        "billingAddress": session["billingAddress"],
        "payment": {
            "method": payment_details["method"],
            "status": "approved",
            "verificationMethod": verification.get("verificationMethod"),
            "verificationTimestamp": verification_timestamp,
            "lastFourDigits": payment_details.get("cardDetails", {}).get(
                "lastFourDigits"
            ),
            "brand": payment_details.get("cardDetails", {}).get("brand"),
        },
        "riskAssessment": session.get("riskAssessment", {}),
        "created": datetime.now().isoformat(),
        "fraudCheck": {
            "status": "passed",
            "score": session.get("riskAssessment", {}).get("score", 0),
            "timestamp": datetime.now().isoformat(),
        },
    }

    # Store order
    DB["orders"][order_id] = order

    # Clean up
    del DB["checkout_sessions"][session_token]
    del DB["carts"][user_id]

    return {
        "order": order,
        "orderId": order_id,  # Explicitly include orderId for easy reference
        "orderStatusUrl": f"/api/fastbuyjson/orders/{order_id}",  # Include URL for status checks
        "message": "Order confirmed successfully",
    }


@api_router.get("/orders/{order_id}")
async def get_order_status(order_id: str):
    if order_id not in DB["orders"]:
        raise HTTPException(
            status_code=404, detail={"error": "Order not found", "orderId": order_id}
        )

    return {"order": DB["orders"][order_id]}


# Add Swagger UI customization
@app.get("/")
async def redirect_to_docs():
    return {
        "message": "FastBuyJSON Demo API. Visit /api/fastbuyjson/docs for Swagger UI documentation."
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
