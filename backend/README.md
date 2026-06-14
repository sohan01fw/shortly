# Shortly

URL creation and redirect servers using Express, Postgres, Redis, Bun, and Docker Compose.

## Run with Docker

```sh
bun run docker:start
```

This builds and starts Nginx, the Creation Server, the Redirect Server,
PostgreSQL, Redis, and the monitoring stack in the background.

- `POST /urls` routes to the Creation Server.
- `GET|HEAD /:code` routes to the Redirect Server.
- `GET /health` reports gateway liveness.
- `GET /health/creation` reports Creation Server readiness.
- `GET /health/redirect` reports Redirect Server readiness.

The backend is available at `http://localhost:5000`.

## Monitoring

Prometheus collects numeric time-series metrics from Shortly and its
infrastructure. Grafana queries Prometheus and presents those metrics as
dashboards. This is operational monitoring, not per-link click history.

- Grafana: `http://localhost:8080`
- Prometheus: `http://localhost:9090`
- Grafana login: `admin` / `shortly`

Set `GRAFANA_ADMIN_PASSWORD` before starting Compose to change the local
Grafana password. Open the **Shortly / Shortly Operations Overview** dashboard
after login. It includes traffic, latency, response status, URL creation,
redirect and cache outcomes, dependency failures, PostgreSQL, Redis, Nginx,
and container resource panels.

The Creation and Redirect Servers expose `/metrics` only inside the Compose
network. Metric labels use bounded values such as route and outcome; Original
URLs and Short Codes are never exported.

Prometheus stores 15 days of data. Alert rules are visible under
`http://localhost:9090/alerts` for unavailable targets, elevated 5xx rates,
and high p95 latency. No external alert notification service is configured.

Useful Prometheus queries:

```promql
sum by (service) (rate(shortly_http_requests_total[5m]))
sum by (outcome) (rate(shortly_redirect_cache_total[5m]))
histogram_quantile(0.95, sum by (le, service) (rate(shortly_http_request_duration_seconds_bucket[5m])))
```

If a dashboard has no data, check **Status > Targets** in Prometheus. A target
should report `UP`. Then generate traffic through `http://localhost:5000` and
allow up to 15 seconds for the next scrape. Check container logs with:

```sh
docker compose logs prometheus grafana postgres-exporter redis-exporter nginx-exporter docker-stats-exporter
```

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

## Load test Short URL creation

No host k6 installation is required. Docker Compose downloads and runs the
official `grafana/k6` image. From the `backend` directory, start the application
and monitoring stack:

```sh
bun run docker:start
```

Open Grafana at `http://localhost:8080`, log in with `admin` / `shortly`, and
open the **Shortly / Shortly Operations Overview** dashboard. Then run a short
smoke test in another terminal:

```sh
VUS=1 RAMP_UP=1s HOLD=15s RAMP_DOWN=1s bun run load:create
```

Run the default profile to ramp up to 100 virtual users over 30 seconds, hold
them for 60 seconds, and ramp down over 15 seconds:

```sh
bun run load:create
```

The test sends only `POST /urls` requests. Each iteration uses a unique valid
URL, so it exercises new Short URL creation instead of the duplicate reuse or
redirect paths. It fails when request failures reach 1%, checks fall to 99%,
or p95 request latency reaches one second.

The profile can be changed without editing the script:

```sh
VUS=250 HOLD=3m bun run load:create
BASE_URL=https://staging.example.com EXPECTED_SHORT_URL_BASE=https://sho.rt RUN_ID=staging-001 bun run load:create
```

Supported variables are `BASE_URL`, `VUS`, `RAMP_UP`, `HOLD`, `RAMP_DOWN`,
`SLEEP_SECONDS`, `RUN_ID`, and `EXPECTED_SHORT_URL_BASE`. `BASE_URL` is where k6
sends requests; `EXPECTED_SHORT_URL_BASE` is the public base expected in the
response. Load-test rows remain in PostgreSQL after the run. In Grafana, watch
creation request rate, p95 latency, status codes, PostgreSQL and Redis activity,
and container CPU and memory while the command runs.

After the load test finishes, remove only its generated PostgreSQL rows and
corresponding Redis cache entries:

```sh
bun run load:clean
```

Cleanup targets URLs under the reserved `https://load-test.example.com/`
prefix. It does not truncate tables, flush Redis, or remove normal application
data. Do not run cleanup while a load test is still creating URLs.

## Verify

With PostgreSQL available at the configured `DATABASE_URL`:

```sh
bun test
bun run typecheck
docker compose config --quiet
docker compose -f compose.yaml -f compose.dev.yaml config --quiet
bun run test:gateway
```
