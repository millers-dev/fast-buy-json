#!/usr/bin/env python3
"""Ensure FastBuyJSON version strings stay aligned across the repo."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = "0.3.0"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def check_package_json(path: Path) -> list[str]:
    data = json.loads(read_text(path))
    version = data.get("version")
    if version != EXPECTED:
        return [f"{path.relative_to(ROOT)}: version is {version}, expected {EXPECTED}"]
    return []


def check_regex(path: Path, pattern: str, label: str) -> list[str]:
    text = read_text(path)
    if not re.search(pattern, text):
        return [f"{path.relative_to(ROOT)}: missing {label}"]
    mismatches = []
    for match in re.finditer(pattern, text):
        if match.group(1) != EXPECTED:
            mismatches.append(
                f"{path.relative_to(ROOT)}: found {match.group(1)} for {label}"
            )
    return mismatches


def main() -> int:
    failures: list[str] = []
    failures.extend(check_package_json(ROOT / "package.json"))
    failures.extend(check_package_json(ROOT / "mcp-server" / "package.json"))

    openapi = read_text(ROOT / "openapi" / "base.yaml")
    if f"version: {EXPECTED}" not in openapi:
        failures.append("openapi/base.yaml: info.version mismatch")

    failures.extend(
        check_regex(
            ROOT / "mcp-server" / "src" / "index.ts",
            r"version:\s*['\"]([^'\"]+)['\"]",
            "MCP server version",
        )
    )
    failures.extend(
        check_regex(
            ROOT / "mcp-server" / "src" / "index-mock.ts",
            r"version:\s*['\"]([^'\"]+)['\"]",
            "MCP mock version",
        )
    )
    failures.extend(
        check_regex(
            ROOT / "mcp-server" / "src" / "adapter.ts",
            r"FastBuyJSON-MCP-Server/([^'\";\s]+)",
            "MCP user agent",
        )
    )

    py_server = read_text(ROOT / "src" / "python" / "server.py")
    if f'SPEC_VERSION = "{EXPECTED}"' not in py_server:
        failures.append("src/python/server.py: SPEC_VERSION constant mismatch")
    if "version=SPEC_VERSION" not in py_server:
        failures.append("src/python/server.py: FastAPI version mismatch")
    if '"specVersion": SPEC_VERSION' not in py_server:
        failures.append("src/python/server.py: detect specVersion mismatch")
    if '"implementationVersion": SPEC_VERSION' not in py_server:
        failures.append("src/python/server.py: detect implementationVersion mismatch")

    js_server = read_text(ROOT / "src" / "server.js")
    if f'const SPEC_VERSION = "{EXPECTED}"' not in js_server:
        failures.append("src/server.js: SPEC_VERSION constant mismatch")
    if "specVersion: SPEC_VERSION" not in js_server:
        failures.append("src/server.js: detect specVersion mismatch")
    if "implementationVersion: SPEC_VERSION" not in js_server:
        failures.append("src/server.js: detect implementationVersion mismatch")

    detect_schema = json.loads(read_text(ROOT / "schemas" / "detect-response.json"))
    for field in ("specVersion", "implementationVersion"):
        examples = detect_schema["properties"][field].get("examples", [])
        if examples and examples[0] != EXPECTED:
            failures.append(
                f"schemas/detect-response.json: {field} example is {examples[0]}"
            )

    if failures:
        for item in failures:
            print(item, file=sys.stderr)
        return 1

    print(f"All version checks passed ({EXPECTED}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
