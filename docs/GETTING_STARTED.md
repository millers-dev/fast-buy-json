# Getting started

Start a reference API and call `/api/fastbuyjson`. The Node demo is the default used by the MCP samples in this repository. The Python demo implements the same contract on a different port.

## Node demo

Requires Node.js 18+.

```bash
npm install
cp .env.example .env
npm start
```

The process listens on `PORT` (default **3000**). Base URL: `http://localhost:3000/api/fastbuyjson`.

`npm start` does not load `.env` by itself. Unset variables use the same defaults as [`.env.example`](../.env.example) (`PORT=3000` and the demo passwords below). Export a variable when you change it.

Discovery:

```bash
curl -s http://localhost:3000/api/fastbuyjson/detect
```

Login:

```bash
curl -s -X POST http://localhost:3000/api/fastbuyjson/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"demo","password":"password123"}'
```

## Python demo

Requires Python 3.11+.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
npm run start:python
```

On Windows, activate with `.venv\Scripts\activate` before `npm run start:python`.

`npm run start:python` runs uvicorn on **8000**. Base URL: `http://localhost:8000/api/fastbuyjson`. Interactive docs: `http://localhost:8000/docs`.

The Postman environment ([`postman/env.json`](../postman/env.json)) points at that Python base URL. Leave it on port 8000 when you exercise the collection against the Python demo. MCP samples and `.env.example` use the Node URL on port 3000.

## Demo users

Both demos keep the same two accounts in memory. They are demo-only credentials, not a production authentication design.

| Username | Password |
|----------|----------|
| `demo` | `password123` |
| `admin` | `admin123` |

`DEMO_PASSWORD` and `ADMIN_PASSWORD` override those passwords when set in the process environment. The defaults match `.env.example`.

## Authentication

Sign in with `POST /auth/login` (JWT). Send the access token as `Authorization: Bearer` on later calls when you want an authenticated identity. Mutating POSTs may send `Idempotency-Key`.

Status codes, problem+json bodies, and header rules are in [`CONTRACT.md`](CONTRACT.md). This guide does not restate that registry.

## How the MCP server finds the API

The reference MCP server is a stdio process. It does not listen on a port. It calls whatever HTTP base you set in `FASTBUYJSON_API_URL`.

`.env.example` sets:

```
FASTBUYJSON_API_URL=http://localhost:3000/api/fastbuyjson
```

If that variable is unset, `mcp-server/src/adapter.ts` uses the same Node URL. Point it at `http://localhost:8000/api/fastbuyjson` when the Python demo is the API you want tools to call.

Build and client setup: [`../mcp-server/README.md`](../mcp-server/README.md) and [`INTEGRATIONS.md`](INTEGRATIONS.md).
