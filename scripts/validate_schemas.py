#!/usr/bin/env python3
"""Validate JSON Schema files and example payloads."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from jsonschema import Draft7Validator
from jsonschema.exceptions import SchemaError

ROOT = Path(__file__).resolve().parents[1]
SCHEMAS = ROOT / "schemas"
EXAMPLES = ROOT / "examples"

EXAMPLE_SCHEMA_PAIRS = (
    (EXAMPLES / "search-request.json", SCHEMAS / "product-search.json"),
    (EXAMPLES / "search-request-typed.json", SCHEMAS / "product-search.json"),
    (EXAMPLES / "add-to-cart-request.json", SCHEMAS / "add-to-cart.json"),
    (EXAMPLES / "checkout-initiate-request.json", SCHEMAS / "checkout-initiate.json"),
    (EXAMPLES / "cart-discount-request.json", SCHEMAS / "cart-discount.json"),
)

JSON_GLOBS = (
    "schemas/*.json",
    "examples/*.json",
    "postman/*.json",
    "conformance/cases/*.json",
    "conformance/schema/*.json",
    "mcp-server/claude_desktop_config.json",
    "mcp-server/package.json",
    "mcp-server/tsconfig.json",
)

CASE_SCHEMA = ROOT / "conformance" / "schema" / "case.schema.json"


def load_json(path: Path) -> object:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def main() -> int:
    failed = False

    for pattern in JSON_GLOBS:
        for path in ROOT.glob(pattern):
            try:
                load_json(path)
            except json.JSONDecodeError as exc:
                print(f"INVALID JSON {path.relative_to(ROOT)}: {exc}")
                failed = True
            else:
                print(f"OK json {path.relative_to(ROOT)}")

    for schema_path in sorted(SCHEMAS.glob("*.json")):
        schema = load_json(schema_path)
        try:
            Draft7Validator.check_schema(schema)
        except SchemaError as exc:
            print(f"INVALID SCHEMA {schema_path.name}: {exc.message}")
            failed = True
        else:
            print(f"OK schema {schema_path.name}")

    if CASE_SCHEMA.exists():
        case_schema = load_json(CASE_SCHEMA)
        case_validator = Draft7Validator(case_schema)
        for case_path in sorted((ROOT / "conformance" / "cases").glob("*.json")):
            instance = load_json(case_path)
            errors = sorted(
                case_validator.iter_errors(instance), key=lambda err: list(err.path)
            )
            if errors:
                failed = True
                print(f"INVALID CONFORMANCE CASE {case_path.name}:")
                for error in errors:
                    location = ".".join(str(part) for part in error.path) or "(root)"
                    print(f"  - {location}: {error.message}")
            else:
                print(f"OK conformance case {case_path.name}")

    for instance_path, schema_path in EXAMPLE_SCHEMA_PAIRS:
        schema = load_json(schema_path)
        instance = load_json(instance_path)
        validator = Draft7Validator(schema)
        errors = sorted(validator.iter_errors(instance), key=lambda err: list(err.path))
        if errors:
            failed = True
            print(f"INVALID EXAMPLE {instance_path.name} against {schema_path.name}:")
            for error in errors:
                location = ".".join(str(part) for part in error.path) or "(root)"
                print(f"  - {location}: {error.message}")
        else:
            print(f"OK example {instance_path.name}")

    if failed:
        return 1
    print("All schema and example checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
