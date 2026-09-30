#!/usr/bin/env python3
"""Merge hand-authored OpenAPI base with JSON Schema components."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
SCHEMAS_DIR = ROOT / "schemas"
BASE_PATH = ROOT / "openapi" / "base.yaml"
OUTPUT_PATH = ROOT / "openapi" / "fastbuyjson.yaml"
RESPONSE_MANIFEST = ROOT / "examples" / "responses" / "manifest.json"
RESPONSES_DIR = ROOT / "examples" / "responses"

GENERATED_HEADER = (
    "# GENERATED — DO NOT EDIT\n"
    "# Regenerate with: python scripts/build_openapi.py\n"
)

TITLE_OVERRIDES: dict[str, str] = {
    "Order Status Response": "OrderStatusResponse",
}


def title_to_component(title: str) -> str:
    if title in TITLE_OVERRIDES:
        return TITLE_OVERRIDES[title]
    words = re.split(r"[\s\-]+", title.strip())
    return "".join(word[:1].upper() + word[1:] for word in words if word)


def normalize_openapi_schema(node: object) -> object:
    if isinstance(node, dict):
        result: dict[str, object] = {}
        for key, value in node.items():
            if key == "$schema":
                continue
            if key == "examples" and isinstance(value, list) and len(value) == 1:
                result["example"] = normalize_openapi_schema(value[0])
                continue
            result[key] = normalize_openapi_schema(value)
        type_value = result.get("type")
        if isinstance(type_value, list):
            non_null = [item for item in type_value if item != "null"]
            if "null" in type_value and len(non_null) == 1:
                result["type"] = non_null[0]
                result["nullable"] = True
            else:
                result["type"] = type_value
        return result
    if isinstance(node, list):
        return [normalize_openapi_schema(item) for item in node]
    return node


def _is_null_type_schema(schema: object) -> bool:
    return isinstance(schema, dict) and schema.get("type") == "null" and len(schema) == 1


def normalize_json_schema_for_oas(node: object) -> object:
    """Map draft-07 nullable patterns to OpenAPI 3.0 Schema Object fields."""
    if isinstance(node, list):
        return [normalize_json_schema_for_oas(item) for item in node]
    if not isinstance(node, dict):
        return node

    normalized: dict[str, object] = {
        key: normalize_json_schema_for_oas(value) for key, value in node.items()
    }

    any_of = normalized.get("anyOf")
    if isinstance(any_of, list) and len(any_of) == 2:
        first, second = any_of[0], any_of[1]
        if _is_null_type_schema(first) and isinstance(second, dict):
            merged = dict(second)
            merged["nullable"] = True
            return normalize_json_schema_for_oas(merged)
        if _is_null_type_schema(second) and isinstance(first, dict):
            merged = dict(first)
            merged["nullable"] = True
            return normalize_json_schema_for_oas(merged)

    type_value = normalized.get("type")
    if isinstance(type_value, list):
        non_null_types = [item for item in type_value if item != "null"]
        if "null" in type_value and len(non_null_types) == 1:
            normalized["type"] = non_null_types[0]
            normalized["nullable"] = True
        elif "null" in type_value and len(non_null_types) == 0:
            normalized.pop("type", None)
            normalized["nullable"] = True

    return normalized


def load_component(schema_path: Path) -> tuple[str, dict[str, object]]:
    raw = json.loads(schema_path.read_text(encoding="utf-8"))
    title = raw.get("title")
    if not isinstance(title, str) or not title.strip():
        raise ValueError(f"{schema_path.name}: missing title")
    name = title_to_component(title)
    body = normalize_openapi_schema(raw)
    body.pop("title", None)
    converted = normalize_json_schema_for_oas(body)
    if not isinstance(converted, dict):
        raise ValueError(f"{schema_path.name}: expected object schema")
    return name, converted


def build_components() -> dict[str, dict[str, object]]:
    components: dict[str, dict[str, object]] = {}
    for path in sorted(SCHEMAS_DIR.glob("*.json")):
        name, schema = load_component(path)
        if name in components:
            raise ValueError(f"Duplicate component {name} from {path.name}")
        components[name] = schema
    return components


def inject_response_examples(document: dict[str, object]) -> None:
    if not RESPONSE_MANIFEST.exists():
        return
    manifest = json.loads(RESPONSE_MANIFEST.read_text(encoding="utf-8"))
    paths = document.setdefault("paths", {})
    for route_key, statuses in manifest.items():
        method, path = route_key.split(" ", 1)
        path_item = paths.get(path)
        if not isinstance(path_item, dict):
            continue
        operation = path_item.get(method.lower())
        if not isinstance(operation, dict):
            continue
        responses = operation.setdefault("responses", {})
        for status_code, filename in statuses.items():
            example_file = RESPONSES_DIR / filename
            if not example_file.exists():
                raise FileNotFoundError(f"Missing response example: {example_file}")
            example = json.loads(example_file.read_text(encoding="utf-8"))
            response = responses.setdefault(str(status_code), {})
            content = response.setdefault("content", {})
            json_content = content.setdefault("application/json", {})
            json_content["example"] = example


def load_base() -> dict[str, object]:
    with BASE_PATH.open(encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def render_openapi(document: dict[str, object]) -> str:
    body = yaml.dump(
        document,
        default_flow_style=False,
        sort_keys=False,
        allow_unicode=True,
        width=120,
    )
    return GENERATED_HEADER + body


def write_output(content: str) -> None:
    OUTPUT_PATH.write_text(content, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build FastBuyJSON OpenAPI from schemas")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Exit 1 if generated output would differ from committed file",
    )
    args = parser.parse_args()

    base = load_base()
    components = build_components()
    base.setdefault("components", {})
    base["components"]["schemas"] = components
    inject_response_examples(base)

    rendered = render_openapi(base)

    if args.check:
        if not OUTPUT_PATH.exists():
            print("openapi/fastbuyjson.yaml is missing; run build_openapi.py", file=sys.stderr)
            return 1
        existing = OUTPUT_PATH.read_text(encoding="utf-8")
        if existing != rendered:
            print("OpenAPI drift detected; run: python scripts/build_openapi.py", file=sys.stderr)
            return 1
        print("OpenAPI is up to date.")
        return 0

    write_output(rendered)
    print(f"Wrote {OUTPUT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
