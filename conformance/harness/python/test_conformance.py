import json
import re
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "src" / "python"))

from server import app, reset_demo_state  # noqa: E402

API = "/api/fastbuyjson"
CASES_DIR = ROOT / "conformance" / "cases"


def get_by_path(obj, path: str):
    current = obj
    for part in path.split("."):
        if current is None:
            return None
        if part.isdigit():
            current = current[int(part)]
        else:
            current = current[part]
    return current


def substitute(value, vars_map):
    if isinstance(value, str):
        return re.sub(
            r"\{\{(\w+)\}\}",
            lambda m: str(vars_map[m.group(1)]),
            value,
        )
    if isinstance(value, list):
        return [substitute(item, vars_map) for item in value]
    if isinstance(value, dict):
        return {k: substitute(v, vars_map) for k, v in value.items()}
    return value


def login(client: TestClient, username="demo", password="password123"):
    response = client.post(
        f"{API}/auth/login", json={"username": username, "password": password}
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def run_step(client: TestClient, step, vars_map):
    req = step["request"]
    expected = step["expect"]
    path = substitute(req["path"], vars_map)
    headers = substitute(req.get("headers") or {}, vars_map)

    if req.get("auth", {}).get("username"):
        auth = req["auth"]
        token = login(
            client, auth["username"], auth.get("password", "password123")
        )
        headers["Authorization"] = f"Bearer {token}"

    body = substitute(req.get("body"), vars_map) if "body" in req else None
    method = req["method"].lower()

    if method == "get":
        response = client.get(f"{API}{path}", headers=headers)
    elif method == "post":
        response = client.post(f"{API}{path}", json=body, headers=headers)
    elif method == "patch":
        response = client.patch(f"{API}{path}", json=body, headers=headers)
    elif method == "delete":
        response = client.delete(f"{API}{path}", headers=headers)
    else:
        raise ValueError(f"Unsupported method {req['method']}")

    assert response.status_code == expected["status"]

    json_body = None
    if response.content:
        try:
            json_body = response.json()
        except json.JSONDecodeError:
            json_body = None

    if "code" in expected:
        assert json_body is not None
        assert json_body.get("code") == expected["code"]

    for name, value in (expected.get("headers") or {}).items():
        key = name.lower()
        if value is None:
            assert response.headers.get(key) is None
        else:
            assert response.headers.get(key) == value

    for dot_path, want in (expected.get("body") or {}).items():
        actual = get_by_path(json_body, dot_path)
        assert actual == substitute(want, vars_map), dot_path

    for var_name, dot_path in (step.get("capture") or {}).items():
        value = get_by_path(json_body, dot_path)
        assert value is not None
        vars_map[var_name] = value


def load_scenarios():
    scenarios = []
    for path in sorted(CASES_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for scenario in data["scenarios"]:
            scenarios.append((data["suite"], scenario))
    return scenarios


@pytest.fixture
def client():
    reset_demo_state()
    with TestClient(app) as test_client:
        yield test_client
    reset_demo_state()


SCENARIOS = load_scenarios()


@pytest.mark.parametrize(
    "suite_name,scenario",
    SCENARIOS,
    ids=[f"{suite}:{scenario['name']}" for suite, scenario in SCENARIOS],
)
def test_conformance_scenario(client, suite_name, scenario):
    vars_map = {}
    for step in scenario["steps"]:
        run_step(client, step, vars_map)
