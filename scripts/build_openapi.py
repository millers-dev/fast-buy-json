#!/usr/bin/env python3
"""Merge hand-authored OpenAPI base with JSON Schema components."""

from __future__ import annotations

import argparse
import json
import re
import sys
from copy import deepcopy
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
SCHEMAS_DIR = ROOT / "schemas"
BASE_PATH = ROOT / "openapi" / "base.yaml"
OUTPUT_PATH = ROOT / "openapi" / "fastbuyjson.yaml"

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


def collapse_examples(node: object) -> object:
    if isinstance(node, dict):
        result: dict[str, object] = {}
        for key, value in node.items():
            if key == "$schema":
                continue
            if key == "examples" and isinstance(value, list) and len(value) == 1:
                result["example"] = collapse_examples(value[0])
                continue
            result[key] = collapse_examples(value)
        return result
    if isinstance(node, list):
        return [collapse_examples(item) for item in node]
    return node


def load_component(schema_path: Path) -> tuple[str, dict[str, object]]:
    raw = json.loads(schema_path.read_text(encoding="utf-8"))
    title = raw.get("title")
    if not isinstance(title, str) or not title.strip():
        raise ValueError(f"{schema_path.name}: missing title")
    name = title_to_component(title)
    body = collapse_examples(raw)
    body.pop("title", None)
    return name, body


def build_components() -> dict[str, dict[str, object]]:
    components: dict[str, dict[str, object]] = {}
    for path in sorted(SCHEMAS_DIR.glob("*.json")):
        name, schema = load_component(path)
        if name in components:
            raise ValueError(f"Duplicate component {name} from {path.name}")
        components[name] = schema
    return components


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
