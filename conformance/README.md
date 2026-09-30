# FastBuyJSON conformance suite v0

Declarative scenarios under `cases/` exercise both reference servers (Node and Python) through in-process harnesses.

- **Node:** `node --test conformance/harness/node/conformance.test.js`
- **Python:** `pytest conformance/harness/python`

Paths in scenarios are relative to `/api/fastbuyjson`. Each scenario runs against freshly reset server state.
