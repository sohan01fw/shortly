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

## Run locally

Run the local backend with Postgres and Redis in Docker:

```sh
bun install
bun run dev
```

The dev command starts both dependency containers, runs Bun in watch mode, and
stops the containers when the dev process exits. It loads `.env` when present
and otherwise uses `.env.example`.
