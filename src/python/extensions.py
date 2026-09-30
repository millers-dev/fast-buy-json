"""Reference extension hook registry (empty by default)."""

from __future__ import annotations

from typing import Any, Dict, List

_registry: Dict[str, Any] = {
    "shipping_options": [],
    "promos": {},
    "tax_rules": [],
}


def register_shipping_option(option: Dict[str, Any]) -> None:
    _registry["shipping_options"].append(option)


def register_promo(code: str, promo: Dict[str, Any]) -> None:
    _registry["promos"][str(code).strip().upper()] = promo


def register_tax_rule(rule: Dict[str, Any]) -> None:
    _registry["tax_rules"].append(rule)


def get_registered_shipping_options() -> List[Dict[str, Any]]:
    return list(_registry["shipping_options"])


def get_registered_promos() -> Dict[str, Dict[str, Any]]:
    return dict(_registry["promos"])


def get_registered_tax_rules() -> List[Dict[str, Any]]:
    return list(_registry["tax_rules"])
