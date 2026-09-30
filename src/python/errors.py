"""RFC 9457 problem details helpers for the FastBuyJSON Python demo."""

from __future__ import annotations

from typing import Any, Iterable, Mapping, Optional

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

PROBLEM_BASE = "https://fastbuyjson.org/problems"
PROBLEM_MEDIA = "application/problem+json"


def code_to_slug(code: str) -> str:
    return code.lower().replace("_", "-")


def problem_type_for_code(code: str) -> str:
    return f"{PROBLEM_BASE}/{code_to_slug(code)}"


def problem_body(
    *,
    status: int,
    code: str,
    title: str,
    detail: Optional[str] = None,
    instance: Optional[str] = None,
    errors: Optional[Iterable[Mapping[str, str]]] = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "type": problem_type_for_code(code),
        "title": title,
        "status": status,
        "code": code,
    }
    if detail:
        body["detail"] = detail
    if instance:
        body["instance"] = instance
    if errors:
        body["errors"] = list(errors)
    return body


def problem_response(
    *,
    status: int,
    code: str,
    title: str,
    detail: Optional[str] = None,
    instance: Optional[str] = None,
    errors: Optional[Iterable[Mapping[str, str]]] = None,
    cache_control: Optional[str] = None,
    extra_headers: Optional[Mapping[str, str]] = None,
) -> JSONResponse:
    headers: dict[str, str] = {"Content-Type": PROBLEM_MEDIA}
    if status == 401:
        headers["WWW-Authenticate"] = "Bearer"
    if cache_control:
        headers["Cache-Control"] = cache_control
    if extra_headers:
        headers.update(extra_headers)
    return JSONResponse(
        status_code=status,
        content=problem_body(
            status=status,
            code=code,
            title=title,
            detail=detail,
            instance=instance,
            errors=errors,
        ),
        headers=headers,
    )


class ProblemException(HTTPException):
    """HTTPException that carries a FastBuyJSON problem code."""

    def __init__(
        self,
        status_code: int,
        code: str,
        title: str,
        detail: Optional[str] = None,
        instance: Optional[str] = None,
        errors: Optional[Iterable[Mapping[str, str]]] = None,
    ) -> None:
        super().__init__(status_code=status_code, detail=detail or title)
        self.code = code
        self.title = title
        self.problem_detail = detail
        self.instance = instance
        self.field_errors = list(errors) if errors else None


def cache_control_for_path(path: str) -> Optional[str]:
    if path.endswith("/detect") or path == "/detect":
        return "public, max-age=300"
    if path.startswith("/auth") or path.startswith("/"):
        return "no-store"
    return "no-store"


async def problem_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    path = request.url.path
    suffix = path.split("/api/fastbuyjson", 1)[-1] if "/api/fastbuyjson" in path else path
    instance = suffix or path
    cache = cache_control_for_path(suffix)

    if isinstance(exc, ProblemException):
        return problem_response(
            status=exc.status_code,
            code=exc.code,
            title=exc.title,
            detail=exc.problem_detail,
            instance=instance,
            errors=exc.field_errors,
            cache_control=cache,
        )

    if isinstance(exc, RequestValidationError):
        field_errors = []
        for err in exc.errors():
            loc = err.get("loc", ())
            field = ".".join(str(part) for part in loc if part != "body")
            field_errors.append(
                {"field": field or "(root)", "message": err.get("msg", "invalid")}
            )
        return problem_response(
            status=400,
            code="VALIDATION_ERROR",
            title="Validation failed",
            detail="Request validation failed",
            instance=instance,
            errors=field_errors,
            cache_control=cache,
        )

    if isinstance(exc, (HTTPException, StarletteHTTPException)):
        status = exc.status_code
        detail = exc.detail
        code, title, problem_detail, errors = _map_http_exception(status, detail)
        return problem_response(
            status=status,
            code=code,
            title=title,
            detail=problem_detail,
            instance=instance,
            errors=errors,
            cache_control=cache,
        )

    return problem_response(
        status=500,
        code="INTERNAL_ERROR",
        title="Internal server error",
        detail="An unexpected error occurred",
        instance=instance,
        cache_control=cache,
    )


def _map_http_exception(
    status: int, detail: Any
) -> tuple[str, str, Optional[str], Optional[list[dict[str, str]]]]:
    if isinstance(detail, dict):
        if "code" in detail:
            return (
                str(detail["code"]),
                str(detail.get("title") or detail.get("error") or "Error"),
                detail.get("detail") or detail.get("message"),
                detail.get("errors"),
            )
        message = detail.get("error") or detail.get("message")
        code = _infer_code_from_message(status, message)
        return code, _title_for_code(code), message, None

    message = str(detail) if detail is not None else None
    code = _infer_code_from_message(status, message)
    return code, _title_for_code(code), message, None


def _title_for_code(code: str) -> str:
    return code.replace("_", " ").title()


def _infer_code_from_message(status: int, message: Optional[str]) -> str:
    text = (message or "").lower()
    if status == 401:
        if "refresh" in text:
            return "INVALID_REFRESH_TOKEN"
        if "certificate" in text:
            return "CERTIFICATE_VERIFICATION_FAILED"
        if "username" in text or "password" in text or "credential" in text:
            return "INVALID_CREDENTIALS"
        if "token" in text:
            return "INVALID_TOKEN"
        return "AUTHENTICATION_REQUIRED"
    if status == 404:
        if "product" in text:
            return "PRODUCT_NOT_FOUND"
        if "cart" in text:
            return "CART_NOT_FOUND"
        if "order" in text:
            return "ORDER_NOT_FOUND"
        return "PRODUCT_NOT_FOUND"
    if status == 400:
        if "session expired" in text:
            return "CHECKOUT_SESSION_EXPIRED"
        if "checkout session" in text or "invalid checkout" in text:
            return "INVALID_CHECKOUT_SESSION"
        if "cash on delivery" in text:
            return "PAYMENT_METHOD_UNSUPPORTED"
        if "payment" in text and "invalid" in text:
            return "INVALID_PAYMENT_DETAILS"
        if "verification token" in text:
            return "INVALID_VERIFICATION_TOKEN"
        if "verification method" in text:
            return "INVALID_VERIFICATION_METHOD"
        if "stronger verification" in text:
            return "STRONGER_VERIFICATION_REQUIRED"
        if "verification" in text:
            return "VERIFICATION_REQUIRED"
        return "VALIDATION_ERROR"
    if status == 500:
        return "INTERNAL_ERROR"
    return "VALIDATION_ERROR"
