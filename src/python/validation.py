"""JSON Schema request validation (Draft 07) for FastBuyJSON demo server."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable, Mapping

from jsonschema import Draft7Validator, FormatChecker
from jsonschema.exceptions import FormatError

from errors import ProblemException

SCHEMAS_DIR = Path(__file__).resolve().parents[2] / "schemas"
ASSERTED_FORMATS = frozenset({"uuid", "email", "date-time"})

format_checker = FormatChecker()


@format_checker.checks("uuid")
def _check_uuid(instance: object) -> bool:
    if not isinstance(instance, str):
        return False
    import re

    pattern = re.compile(
        r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
        re.I,
    )
    return bool(pattern.match(instance))


@format_checker.checks("email")
def _check_email(instance: object) -> bool:
    if not isinstance(instance, str):
        return False
    import re

    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", instance))


@format_checker.checks("date-time")
def _check_date_time(instance: object) -> bool:
    if not isinstance(instance, str):
        return False
    from datetime import datetime

    try:
        datetime.fromisoformat(instance.replace("Z", "+00:00"))
    except ValueError:
        return False
    return True


@lru_cache(maxsize=None)
def _validator_for(schema_name: str) -> Draft7Validator:
    path = SCHEMAS_DIR / f"{schema_name}.json"
    schema = json.loads(path.read_text(encoding="utf-8"))
    return Draft7Validator(schema, format_checker=format_checker)


def _format_errors(errors: Iterable[Any]) -> list[dict[str, str]]:
    field_errors: list[dict[str, str]] = []
    for err in errors:
        path_parts = [str(part) for part in err.path]
        field = ".".join(path_parts) if path_parts else "(root)"
        if err.validator == "required":
            field = err.message.split("'")[1] if "'" in err.message else field
            message = "is required"
        elif isinstance(err, FormatError):
            message = f"must be a valid {err.format}"
        else:
            message = err.message.removeprefix("must ") if err.message else "is invalid"
        field_errors.append({"field": field, "message": message})
    return field_errors


def validate_payload(
    schema_name: str, body: Any, instance: str | None = None
) -> None:
    validator = _validator_for(schema_name)
    errors = sorted(validator.iter_errors(body), key=lambda e: e.path)
    if errors:
        raise ProblemException(
            status_code=400,
            code="VALIDATION_ERROR",
            title="Validation failed",
            detail="Request validation failed",
            instance=instance,
            errors=_format_errors(errors),
        )


async def read_validated_json(
    request, schema_name: str, instance: str | None = None
) -> dict[str, Any]:
    body = await request.json()
    validate_payload(schema_name, body, instance=instance)
    return body
