# Redirect from PostgreSQL

**Type:** AFK  
**Status:** Completed  
**Blocked by:** None - can start immediately

## User Story

As someone opening a Short URL, I want to be redirected to its Original URL so
that the generated link becomes usable.

## What to Build

Add a separately runnable Redirect Server within the existing Bun package. It
shares PostgreSQL access and migration state with the Creation Server but has
its own application and entrypoint so the two processes can be deployed and
scaled independently.

Support `GET` and `HEAD` for exactly seven-character Base62 Short Codes. Query
PostgreSQL by Short Code and return `302 Found` with the Original URL in the
`Location` header. Return the shared structured `404` response when no record
exists. Other methods return `405 Method Not Allowed`.

Add a domain glossary for Original URL, Short Code, Short URL, Creation Server,
Redirect Server, Cache Hit, and Cache Miss. Add a concise ADR explaining why
Nginx will front two processes in one Bun package.

## Public Interface Behavior

- `GET /:code` returns `302` and `Location` for a stored Short Code.
- `HEAD /:code` returns the same status and header without a response body.
- Unknown valid Short Codes return structured `404`.
- Non-GET/HEAD methods return `405` with an `Allow: GET, HEAD` header.
- Redirect Server health reports PostgreSQL and Redis dependency status.

## Acceptance Criteria

- [x] A public HTTP test creates a Short URL through v1 behavior and resolves it through the Redirect Server.
- [x] The redirect response is `302` with the exact canonical Original URL in `Location`.
- [x] `HEAD` returns the same redirect metadata without a body.
- [x] An unknown Base62 code returns the agreed `404` response.
- [x] Unsupported methods return `405` and the correct `Allow` header.
- [x] Creation and Redirect Servers have independent entrypoints.
- [x] Existing `POST /urls` tests remain green.
- [x] The glossary and architecture ADR capture the agreed terminology and topology.

## TDD Cycles

1. **RED:** Test that a stored Short Code redirects through the Redirect Server.
2. **GREEN:** Add the minimum PostgreSQL lookup, redirect application, and entrypoint.
3. **REFACTOR:** Concentrate Short Code lookup behind a small shared storage interface.
4. **RED → GREEN:** Add unknown-code `404` behavior.
5. **RED → GREEN:** Add `HEAD` redirect behavior.
6. **RED → GREEN:** Add unsupported-method `405` behavior.
7. **REFACTOR:** Remove application bootstrap duplication while preserving separate processes.

## Out of Scope

- Redis lookup caching
- API gateway routing
- Dependency-outage fallback
- Metrics and analytics
- Redirect destination editing

## Summary

This tracer bullet makes Short URLs functional through a separately runnable
Redirect Server backed directly by PostgreSQL.
