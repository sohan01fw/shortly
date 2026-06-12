# Shortly

Minimal TypeScript service skeleton using Express, Postgres, Redis, Bun, and Docker Compose.

## Run with Docker

```sh
bun run docker:start
```

This builds the API image, starts every container in the background, and waits
until the API, Postgres, and Redis are healthy.

- `GET /` returns `Hello World`.
- `GET /health` checks Postgres and Redis readiness.

The backend is available at `http://localhost:5000`.

`SHORT_URL_BASE_URL` controls the public base used in generated Short URLs. For
local and Docker development it is:

```sh
SHORT_URL_BASE_URL=http://localhost:5000
```

Migrations run after PostgreSQL connects and before the HTTP server starts, so
the service does not become ready against an outdated schema.

## Run locally

Run the local backend with Postgres and Redis in Docker:

```sh
bun install
bun run dev
```

The dev command starts both dependency containers, runs Bun in watch mode, and
stops the containers when the dev process exits. It loads `.env` when present
and otherwise uses `.env.example`.

## Verify

With PostgreSQL available at the configured `DATABASE_URL`:

```sh
bun test
bun run typecheck
docker compose config --quiet
```
