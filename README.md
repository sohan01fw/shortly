# Shortly 🔗

Shortly is a production-minded URL shortener that turns long, messy links into clean short URLs with a React frontend, a Bun/Express backend, PostgreSQL persistence, Redis redirect caching, Nginx gateway routing, and a full Prometheus + Grafana monitoring stack.

It is built like a real service, not just a demo: URL creation and redirect traffic run as separate backend processes, redirects are optimized through Redis, migrations run automatically before startup, and k6 load tests validate the system under traffic.

## What Problem It Solves 🎯

Long URLs are hard to share, easy to break, and not friendly for social posts, resumes, campaigns, QR codes, or messaging. Shortly solves that by creating short, stable, shareable links while keeping the backend ready for operational concerns such as reliability, caching, metrics, and load testing.

## Highlights ✨

- Create short links from valid `http://` and `https://` URLs.
- Reuse the same short code for duplicate normalized URLs.
- Redirect short codes with `GET` and `HEAD` support.
- Cache successful redirects in Redis for fast repeated access.
- Cache missing short codes briefly to reduce unnecessary database hits.
- Expose structured health checks and Prometheus metrics.
- Run the full system locally through Docker Compose.
- Validate behavior with backend, frontend, gateway, and k6 load tests.

## Tech Stack 🧰

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite 8, TypeScript, Tailwind CSS 4 |
| Client Data | TanStack React Query, Axios |
| UI | Custom components, Lucide React icons |
| Backend Runtime | Bun, TypeScript |
| API | Express 5 |
| Database | PostgreSQL 17 |
| Cache | Redis 8 |
| Gateway | Nginx |
| Monitoring | Prometheus, Grafana, exporters |
| Load Testing | Grafana k6 |
| Infra | Docker Compose |
| Testing | Bun test, Vitest, Testing Library |

## Architecture 🏗️

```text
React UI
  |
  | POST /urls
  v
Nginx Gateway :5000
  |---------------------> Creation Server :5001
  |                          |
  |                          v
  |                    PostgreSQL + Redis cache warm
  |
  | GET /:code or HEAD /:code
  v
Redirect Server :5002
  |
  | Redis cache hit -> 302 redirect
  | Redis miss      -> PostgreSQL fallback -> cache -> 302 redirect
```

The backend exposes public traffic through Nginx on `http://localhost:5000`. Internally, the Creation Server handles `POST /urls`, while the Redirect Server handles short-code lookups. This separation mirrors how high-traffic URL shorteners are commonly scaled: creation is write-heavy, redirects are read-heavy and cache-friendly.

## Local Setup 🚀

### Prerequisites

- Bun
- Docker and Docker Compose

### Run Backend With Docker

```sh
cd backend
bun install
bun run docker:start
```

Backend gateway:

```text
http://localhost:5000
```

Monitoring:

```text
Grafana:    http://localhost:8080
Prometheus: http://localhost:9090
Login:      admin / shortly
```

### Run Frontend

```sh
cd frontend
bun install
bun run dev
```

If the frontend is not served behind the same gateway, point it at the backend:

```sh
VITE_API_BASE_URL=http://localhost:5000 bun run dev
```

## API Overview 📡

Create a short URL:

```http
POST /urls
Content-Type: application/json

{
  "url": "https://example.com/a/very/long/link"
}
```

Successful response:

```json
{
  "code": "Ab3xYz9",
  "shortUrl": "http://localhost:5000/Ab3xYz9",
  "originalUrl": "https://example.com/a/very/long/link"
}
```

Redirect:

```http
GET /Ab3xYz9
```

Health:

```text
GET /health
GET /health/creation
GET /health/redirect
```

## Testing And Verification ✅

These checks were run locally on June 18, 2026.

| Check | Result |
| --- | --- |
| Frontend tests | 11 passed |
| Frontend production build | Passed |
| Frontend typecheck | Passed |
| Backend typecheck | Passed |
| Backend test suite | 40 passed, 4 gateway tests skipped by default |
| Gateway integration tests | 4 passed |
| Docker Compose health | All services healthy |

Useful commands:

```sh
# Frontend
cd frontend
bun run test
bun run typecheck
bun run build

# Backend
cd backend
bun run typecheck
bun test
bun run test:gateway
```

For direct backend tests, PostgreSQL must be reachable from the host. The dev Compose override publishes Postgres and Redis:

```sh
cd backend
docker compose -f compose.yaml -f compose.dev.yaml up --detach --wait
```

## Local Load Test Score ⚡

The project includes k6 scripts for creation and redirect load testing. A local smoke load test was run through Docker Compose:

```sh
cd backend
VUS=1 RAMP_UP=1s HOLD=15s RAMP_DOWN=1s bun run load:create
```

Measured result:

| Metric | Score |
| --- | --- |
| Threshold status | Passed |
| Checks | 100.00% |
| Failed requests | 0.00% |
| Total requests | 17 |
| Average latency | 26.18 ms |
| Median latency | 9 ms |
| p90 latency | 22.45 ms |
| p95 latency | 75.18 ms |
| Max latency | 273.68 ms |

k6 thresholds configured in the project:

```text
checks > 99%
http_req_failed < 1%
p95 latency < 1000 ms
```

So the local smoke score is: **PASS with 100% checks, 0% failures, and p95 latency of 75.18 ms**. ⚡

Run the default creation load profile:

```sh
cd backend
bun run load:create
```

Run the redirect hot-cache profile:

```sh
cd backend
bun run load:redirect
```

Clean generated load-test data:

```sh
cd backend
bun run load:clean
```

## Why This Project Stands Out 🌟

Shortly demonstrates more than basic CRUD. It shows service decomposition, data normalization, concurrency-safe short-code creation, cache-aware redirect design, structured error responses, health checks, metrics, dashboards, Dockerized infrastructure, and measurable performance validation.

That makes it a strong portfolio project for backend, full-stack, and DevOps-minded roles because it connects product value with real engineering operations.
