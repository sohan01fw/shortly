# Survive Dependency Failures

**Type:** AFK  
**Status:** Completed  
**Blocked by:** [Cache Missing Short Codes](./handle-missing-links.md)

## User Story

As someone opening a Short URL, I want redirects to remain available whenever
one data dependency still has enough information to resolve the destination.

## What to Build

Treat Redis as an optional accelerator. If Redis is unavailable, query
PostgreSQL and return the normal redirect or `404`. If PostgreSQL is unavailable,
serve positive and negative Cache Hits from Redis. If an uncached lookup requires
PostgreSQL while it is unavailable, return structured `503` using the shared
`REDIRECT_UNAVAILABLE` response.

Update process health semantics: PostgreSQL-down means not ready; Redis-down
means ready but degraded. Startup must not prevent either server from running
solely because Redis is unavailable.

## Public Interface Behavior

- Redis failure falls back to PostgreSQL without changing successful redirects.
- A cached destination redirects while PostgreSQL is unavailable.
- A cached negative entry returns `404` while PostgreSQL is unavailable.
- An uncached request returns structured `503` when PostgreSQL is unavailable.
- Health reports Redis as down without returning an unhealthy status.
- Health returns failure when PostgreSQL is down.

## Acceptance Criteria

- [x] A deterministic Redis-outage test proves PostgreSQL fallback redirects normally.
- [x] Redis outage plus unknown code returns the normal `404` when PostgreSQL is healthy.
- [x] A positive Cache Hit redirects during PostgreSQL outage.
- [x] A negative Cache Hit returns `404` during PostgreSQL outage.
- [x] An uncached request during PostgreSQL outage returns the agreed `503` response.
- [x] Creation succeeds without Redis when PostgreSQL is healthy.
- [x] Both process health routes distinguish degraded Redis from failed PostgreSQL.
- [x] Dependency cleanup works when Redis never connected.

## TDD Cycles

1. **RED:** Test redirect behavior while Redis access fails.
2. **GREEN:** Catch cache failures and continue through PostgreSQL.
3. **RED → GREEN:** Add unknown-code fallback during Redis failure.
4. **RED:** Test positive Cache Hit behavior during PostgreSQL failure.
5. **GREEN:** Ensure PostgreSQL is never consulted after a positive Cache Hit.
6. **RED → GREEN:** Add negative Cache Hit behavior during PostgreSQL failure.
7. **RED → GREEN:** Add uncached PostgreSQL-failure `503` behavior.
8. **RED → GREEN:** Add degraded and failed readiness states.
9. **REFACTOR:** Deepen dependency lifecycle and failure mapping behind small interfaces.

## Out of Scope

- Circuit breakers
- Retry storms or exponential backoff
- Multi-region failover
- Redis clustering
- Metrics and alerting

## Summary

This slice makes Redis optional for correctness, preserves cached redirects
during PostgreSQL outages, and exposes honest degraded and failed health states.
