# Redirect Server and Redis Cache

V2 adds a separately runnable Redirect Server, Redis-backed cache-aside lookups,
and an Nginx gateway while preserving existing Short URLs on public port `5000`.

## Implementation Order

1. [x] [Redirect from PostgreSQL](./redirect-from-postgres.md)
2. [x] [Cache successful redirects](./cache-redirects.md)
3. [x] [Cache missing Short Codes](./handle-missing-links.md)
4. [x] [Survive dependency failures](./survive-cache-failure.md)
5. [x] [Add the API gateway](./add-api-gateway.md)

All issues are AFK vertical slices. Each delivers behavior observable through an
HTTP interface and must be implemented with one RED → GREEN cycle at a time.

## Shared Public Interface

### Redirect

```http
GET /aZ3kP9x
HEAD /aZ3kP9x
```

A known Short Code returns:

```http
HTTP/1.1 302 Found
Location: https://example.com/page
```

An unknown or malformed Short Code returns:

```json
{
  "error": {
    "code": "SHORT_URL_NOT_FOUND",
    "message": "Short URL not found."
  }
}
```

If PostgreSQL is required but unavailable, return:

```json
{
  "error": {
    "code": "REDIRECT_UNAVAILABLE",
    "message": "Unable to resolve the short URL right now."
  }
}
```

### Gateway routing

- `POST /urls` routes to the Creation Server.
- `GET|HEAD /:code` routes to the Redirect Server.
- `/health` reports gateway liveness.
- `/health/creation` routes to Creation Server health.
- `/health/redirect` routes to Redirect Server health.

## Runtime Topology

- Nginx owns public port `5000`.
- Creation Server and Redirect Server run as separate Bun processes on private
  Compose ports.
- Both processes share PostgreSQL and Redis.
- `SHORT_URL_BASE_URL` remains `http://localhost:5000`.
- PostgreSQL is the source of truth; Redis is optional for correctness.

## V2 Boundaries

- No metrics or cache telemetry
- No analytics
- No authentication or rate limiting
- No URL editing, expiration, or deletion
- No additional database schema migration

## Summary

The five slices first prove correct redirects from PostgreSQL, then add positive
and negative caching, dependency-failure resilience, and finally the public
Nginx topology. Existing creation behavior and Short URLs remain compatible.
