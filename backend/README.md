# Shortly

URL creation and redirect servers using Express, Postgres, Redis, Bun, and Docker Compose.

## Run with Docker

```sh
bun run docker:start
```

This builds and starts Nginx, the Creation Server, the Redirect Server,
PostgreSQL, and Redis in the background, then waits for all health checks.

- `POST /urls` routes to the Creation Server.
- `GET|HEAD /:code` routes to the Redirect Server.
- `GET /health` reports gateway liveness.
- `GET /health/creation` reports Creation Server readiness.
- `GET /health/redirect` reports Redirect Server readiness.

The backend is available at `http://localhost:5000`.

`SHORT_URL_BASE_URL` controls the public base used in generated Short URLs. For
local and Docker development it is:

```sh
SHORT_URL_BASE_URL=http://localhost:5000
```

Migrations run after PostgreSQL connects and before the HTTP server starts, so
the service does not become ready against an outdated schema.

## Server entrypoints

The two HTTP servers share the package and migration state but run as separate
processes:

```sh
bun run start:creation
bun run start:redirect
```

In Compose, Nginx owns public port `5000`; the Creation Server uses private port
`5001` and the Redirect Server uses private port `5002`.

## Run locally

Run the complete development topology in Docker:

```sh
bun install
bun run dev
```

The dev command mounts the backend source and runs both Bun processes in watch
mode behind Nginx. PostgreSQL and Redis ports are published only by the dev
override so host-run integration tests can reach them.

Stop and remove the complete development stack with:

```sh
bun run dev:down
```

## Verify

With PostgreSQL available at the configured `DATABASE_URL`:

```sh
bun test
bun run typecheck
docker compose config --quiet
docker compose -f compose.yaml -f compose.dev.yaml config --quiet
bun run test:gateway
```
