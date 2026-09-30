"""Shared commerce rules for the FastBuyJSON reference servers (1.0.0)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from extensions import (
    get_registered_promos,
    get_registered_shipping_options,
    get_registered_tax_rules,
)

DEFAULT_CURRENCY = "USD"

TAX_RULES = [
    {"country": "default", "rate": 0.1, "label": "default", "jurisdiction": "default"},
    {"country": "DE", "rate": 0.19, "label": "VAT", "jurisdiction": "DE"},
    {"country": "GB", "rate": 0.2, "label": "VAT", "jurisdiction": "GB"},
]

PROMO_CATALOG = {
    "SAVE10": {
        "code": "SAVE10",
        "type": "percentage",
        "value": 10,
        "label": "10% off",
    },
    "WELCOME5": {
        "code": "WELCOME5",
        "type": "fixed",
        "value": 5.0,
        "label": "$5 off",
    },
}

SHIPPING_CATALOG = [
    {
        "id": "standard",
        "label": "Standard Shipping",
        "baseAmount": 10,
        "currency": DEFAULT_CURRENCY,
        "minDays": 3,
        "maxDays": 5,
        "freeOver": 100,
        "description": "Delivered in 3–5 business days",
    },
    {
        "id": "express",
        "label": "Express Shipping",
        "baseAmount": 25,
        "currency": DEFAULT_CURRENCY,
        "minDays": 1,
        "maxDays": 2,
        "description": "Delivered in 1–2 business days",
    },
]


def round2(value: float) -> float:
    return round(value + 1e-9, 2)


def _merged_tax_rules() -> List[Dict[str, Any]]:
    return [*TAX_RULES, *get_registered_tax_rules()]


def _merged_shipping_catalog() -> List[Dict[str, Any]]:
    return [*SHIPPING_CATALOG, *get_registered_shipping_options()]


def _merged_promo_catalog() -> Dict[str, Dict[str, Any]]:
    return {**PROMO_CATALOG, **get_registered_promos()}


def get_tax_rule(country_code: Optional[str]) -> Dict[str, Any]:
    normalized = str(country_code).upper() if country_code else "default"
    rules = _merged_tax_rules()
    for rule in rules:
        if rule["country"] == normalized:
            return rule
    return next(rule for rule in rules if rule["country"] == "default")


def find_shipping_option(option_id: Optional[str]) -> Optional[Dict[str, Any]]:
    if not option_id:
        return None
    for option in _merged_shipping_catalog():
        if option["id"] == option_id:
            return option
    return None


def resolve_shipping_option(option_id: Optional[str]) -> Dict[str, Any]:
    option_id = option_id or "standard"
    for option in _merged_shipping_catalog():
        if option["id"] == option_id:
            return option
    return SHIPPING_CATALOG[0]


def shipping_amount_for_option(option: Dict[str, Any], taxable_base: float) -> float:
    free_over = option.get("freeOver")
    if free_over is not None and taxable_base > free_over:
        return 0.0
    return float(option["baseAmount"])


def build_shipping_option_views(taxable_base: float) -> List[Dict[str, Any]]:
    views: List[Dict[str, Any]] = []
    for option in _merged_shipping_catalog():
        entry: Dict[str, Any] = {
            "id": option["id"],
            "label": option["label"],
            "amount": {
                "amount": round2(shipping_amount_for_option(option, taxable_base)),
                "currency": option["currency"],
            },
            "estimatedDelivery": {
                "minDays": option["minDays"],
                "maxDays": option["maxDays"],
            },
        }
        if option.get("freeOver") is not None:
            entry["freeOver"] = {
                "amount": option["freeOver"],
                "currency": option["currency"],
            }
        if option.get("description"):
            entry["description"] = option["description"]
        views.append(entry)
    return views


def normalize_promo_code(code: Any) -> Optional[str]:
    if code is None or code == "":
        return None
    return str(code).strip().upper()


def lookup_promo(code: Any) -> Optional[Dict[str, Any]]:
    normalized = normalize_promo_code(code)
    if not normalized:
        return None
    return _merged_promo_catalog().get(normalized)


def compute_discount_amount(promo: Optional[Dict[str, Any]], subtotal: float) -> float:
    if not promo or subtotal <= 0:
        return 0.0
    if promo["type"] == "percentage":
        raw = subtotal * (promo["value"] / 100)
    else:
        raw = float(promo["value"])
    return min(round2(raw), round2(subtotal))


def ensure_cart_commerce_state(cart: Dict[str, Any]) -> None:
    if "shipping" not in cart:
        cart["shipping"] = {"selectedOptionId": "standard"}
    if not cart["shipping"].get("selectedOptionId"):
        cart["shipping"]["selectedOptionId"] = "standard"
    if "appliedDiscounts" not in cart:
        cart["appliedDiscounts"] = []
    if "appliedPromoCode" not in cart:
        cart["appliedPromoCode"] = None


def apply_product_filters(products: List[Dict[str, Any]], filters: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not filters:
        return list(products)

    results = list(products)

    if filters.get("brand"):
        brand = str(filters["brand"]).lower()
        results = [
            product
            for product in results
            if product.get("brand", "").lower() == brand
        ]

    categories = filters.get("categories")
    if isinstance(categories, list) and categories:
        wanted = [str(category).lower() for category in categories]
        results = [
            product
            for product in results
            if any(
                category in [str(c).lower() for c in product.get("categories", [])]
                for category in wanted
            )
        ]

    price_range = filters.get("priceRange")
    if isinstance(price_range, dict):
        minimum = price_range.get("min")
        maximum = price_range.get("max")
        filtered: List[Dict[str, Any]] = []
        for product in results:
            amount = product.get("price", {}).get("amount")
            if not isinstance(amount, (int, float)):
                continue
            if minimum is not None and amount < minimum:
                continue
            if maximum is not None and amount > maximum:
                continue
            filtered.append(product)
        results = filtered

    availability = filters.get("availability")
    if isinstance(availability, list) and availability:
        allowed = {str(status) for status in availability}
        results = [
            product
            for product in results
            if product.get("availability", {}).get("status") in allowed
        ]

    return results


def recompute_cart_totals(cart: Dict[str, Any], *, tax_country: Optional[str] = None) -> None:
    ensure_cart_commerce_state(cart)

    for item in cart.get("items", []):
        item["lineTotal"] = {
            "amount": round2(item["price"]["amount"] * item["quantity"]),
            "currency": item["price"]["currency"],
        }

    from datetime import datetime

    cart["updated"] = datetime.now().isoformat()

    subtotal = round2(
        sum(item["lineTotal"]["amount"] for item in cart.get("items", []))
    )

    tax_rule = get_tax_rule(tax_country)

    if not cart.get("items"):
        cart["appliedDiscounts"] = []
        cart["shipping"] = {
            "selectedOptionId": cart["shipping"].get("selectedOptionId") or "standard",
            "amount": {"amount": 0, "currency": DEFAULT_CURRENCY},
            "options": build_shipping_option_views(0),
        }
        cart["totals"] = {
            "currency": DEFAULT_CURRENCY,
            "subtotal": 0,
            "discount": 0,
            "taxableBase": 0,
            "tax": 0,
            "taxBreakdown": {
                "rate": tax_rule["rate"],
                "taxableAmount": 0,
                "amount": 0,
                "label": tax_rule["label"],
                "jurisdiction": tax_rule["jurisdiction"],
            },
            "shipping": 0,
            "discountBreakdown": [],
            "total": 0,
        }
        return

    promo = lookup_promo(cart.get("appliedPromoCode"))
    discount = compute_discount_amount(promo, subtotal)
    taxable_base = round2(subtotal - discount)

    tax = round2(taxable_base * tax_rule["rate"])

    selected_option = resolve_shipping_option(cart["shipping"].get("selectedOptionId"))
    shipping_numeric = round2(shipping_amount_for_option(selected_option, taxable_base))

    cart["shipping"] = {
        "selectedOptionId": selected_option["id"],
        "amount": {"amount": shipping_numeric, "currency": DEFAULT_CURRENCY},
        "options": build_shipping_option_views(taxable_base),
    }

    cart["appliedDiscounts"] = (
        [
            {
                "code": promo["code"],
                "type": promo["type"],
                "label": promo["label"],
                "amount": {"amount": discount, "currency": DEFAULT_CURRENCY},
            }
        ]
        if promo
        else []
    )

    cart["totals"] = {
        "currency": DEFAULT_CURRENCY,
        "subtotal": subtotal,
        "discount": discount,
        "taxableBase": taxable_base,
        "tax": tax,
        "taxBreakdown": {
            "rate": tax_rule["rate"],
            "taxableAmount": taxable_base,
            "amount": tax,
            "label": tax_rule["label"],
            "jurisdiction": tax_rule["jurisdiction"],
        },
        "shipping": shipping_numeric,
        "discountBreakdown": (
            [
                {
                    "code": promo["code"],
                    "type": promo["type"],
                    "label": promo["label"],
                    "amount": discount,
                }
            ]
            if promo
            else []
        ),
        "total": round2(subtotal - discount + tax + shipping_numeric),
    }


def build_detect_capabilities() -> Dict[str, Any]:
    shipping_catalog = _merged_shipping_catalog()
    promo_catalog = _merged_promo_catalog()
    return {
        "filters": {
            "fields": [
                "brand",
                "categories",
                "priceRange",
                "availability",
                "extensions",
            ],
            "additionalProperties": True,
        },
        "extensions": {
            "supported": True,
            "echo": True,
            "reservedNamespaces": ["fastbuyjson", "x-fastbuyjson"],
            "vendorKeyConvention": "reverse-dns or x- prefix",
        },
        "shipping": {
            "options": [option["id"] for option in shipping_catalog],
            "freeShippingThreshold": {
                "amount": 100,
                "currency": DEFAULT_CURRENCY,
                "appliesWhen": "taxableBase > 100",
                "optionId": "standard",
            },
        },
        "tax": {
            "mode": "jurisdiction",
            "defaultRate": 0.1,
            "seededCountries": ["DE", "GB"],
            "taxableBase": "subtotal minus discount (shipping excluded)",
        },
        "discounts": {
            "types": ["percentage", "fixed"],
            "stackable": False,
            "promoCodes": list(promo_catalog.keys()),
        },
    }
