# Cache Successful Redirects

**Type:** AFK  
**Status:** Completed  
**Blocked by:** [Redirect from PostgreSQL](./redirect-from-postgres.md)

## User Story

As someone opening a frequently used Short URL, I want a fast redirect so that
the Redirect Server does not query PostgreSQL on every request.

## What to Build

Add cache-aside redirect lookup using Redis key `short-url:{code}`. A Cache Hit
returns `302` directly from Redis. A Cache Miss queries PostgreSQL, writes the
Original URL to Redis with a 24-hour TTL, and returns the same redirect.

After PostgreSQL successfully creates or reuses a Short URL, the Creation Server
best-effort writes the positive cache entry. Redis failure must be logged but
must not change a successful creation response.

## Public Interface Behavior

- Redirect status and `Location` are identical for Cache Hits and Cache Misses.
- The first uncached redirect populates Redis for 24 hours.
- Later redirects resolve without requiring PostgreSQL lookup.
- Successful creation immediately makes the positive cache entry available.
- Redis write failure never turns a successful URL creation into an error.

## Acceptance Criteria

- [x] A real-Redis integration test proves a Cache Miss redirects and creates the expected cache entry.
- [x] The cache entry has a positive TTL no greater than 24 hours.
- [x] A Cache Hit redirects while the PostgreSQL lookup adapter is unavailable.
- [x] Creating a Short URL writes its destination to Redis after PostgreSQL succeeds.
- [x] Reusing an existing Short URL refreshes the same positive cache entry.
- [x] Creation remains successful when its best-effort Redis write fails.
- [x] Existing redirect and creation contracts remain unchanged.

## TDD Cycles

1. **RED:** Test a Cache Miss through the Redirect Server and inspect real Redis afterward.
2. **GREEN:** Add the minimum cache-aside lookup and 24-hour positive entry.
3. **REFACTOR:** Hide Redis serialization and key construction behind a redirect-cache interface.
4. **RED:** Test that a Cache Hit redirects when PostgreSQL lookup is unavailable.
5. **GREEN:** Return cached destinations before accessing PostgreSQL.
6. **RED:** Test that creation warms Redis after PostgreSQL succeeds.
7. **GREEN:** Add best-effort positive cache warming to create-or-reuse behavior.
8. **REFACTOR:** Share positive-cache writing between both servers without coupling their applications.

## Out of Scope

- Negative caching
- Redis-required correctness
- Cache metrics
- Distributed cache locking
- Proactive cache refresh

## Summary

This slice accelerates known Short Codes with 24-hour Redis entries while
keeping PostgreSQL authoritative and URL creation independent of Redis health.
