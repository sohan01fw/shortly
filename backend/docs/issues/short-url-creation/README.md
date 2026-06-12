# Short URL Creation

This backlog delivers the first URL-shortening flow: accept an Original URL,
create or reuse a permanent Short URL, store it in PostgreSQL, and return it.

## Implementation Order

1. [x] [Create and persist a Short URL](./create-short-url.md)
2. [x] [Reject invalid Original URLs](./validate-url.md)
3. [x] [Normalize and reuse an existing Short URL](./reuse-short-url.md)
4. [x] [Handle collisions and complete operational wiring](./handle-collisions.md)

All issues are AFK vertical slices. Implement them in order because each issue
extends the public behavior delivered by the previous issue.

## Shared Public Interface

```http
POST /urls
Content-Type: application/json
```

```json
{
  "url": "https://example.com/page"
}
```

New records return `201 Created`; reused records return `200 OK`:

```json
{
  "code": "aZ3kP9x",
  "shortUrl": "http://localhost:5000/aZ3kP9x",
  "originalUrl": "https://example.com/page"
}
```

Errors use this envelope:

```json
{
  "error": {
    "code": "INVALID_URL",
    "message": "A valid HTTP or HTTPS URL is required."
  }
}
```

## V1 Boundaries

- No redirect route
- No expiration
- No authentication or rate limiting
- No ORM
- No Redis URL caching
- Redis remains health-check-only

## Summary

The four issues progress from the first complete creation path to validation,
deduplication, concurrency safety, collision recovery, and operational
verification. Each behavior is introduced one public-interface test at a time.
