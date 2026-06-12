# Create and Persist a Short URL

**Type:** AFK  
**Status:** Completed  
**Blocked by:** Completed

## User Story

As a local user, I want to submit an Original URL and receive a permanent Short
URL so that I can use the generated value in later flows.

## What to Build

Deliver the first end-to-end path through `POST /urls`. Store a valid HTTP or
HTTPS Original URL in PostgreSQL with a cryptographically random,
seven-character Base62 Short Code. Build the Short URL from
`SHORT_URL_BASE_URL` and return `201 Created`.

Add versioned plain-SQL migrations without an ORM. The initial migration creates
URL storage with an identity ID, unique Short Code, canonical Original URL,
Normalized URL, and creation timestamp. Run migrations after PostgreSQL connects
and before the HTTP server starts.

## Public Interface Behavior

- `POST /urls` accepts JSON containing a valid `url` string.
- A new record returns `201 Created` using the shared success response.
- `code` contains seven characters from `0-9`, `A-Z`, and `a-z`.
- `shortUrl` uses `SHORT_URL_BASE_URL`, locally `http://localhost:5000`.

## Acceptance Criteria

- [x] A public HTTP integration test submits a valid HTTPS URL and initially fails.
- [x] Minimal implementation passes through the real Express route and PostgreSQL.
- [x] The response is `201` and matches the shared success shape.
- [x] The Short Code is exactly seven Base62 characters.
- [x] Applied migrations are safely skipped on later startups.
- [x] No ORM is introduced.
- [x] Redis is not used during URL creation.

## TDD Cycles

1. **RED:** Test that a valid HTTPS Original URL returns `201`, a seven-character Base62 code, and the configured Short URL.
2. **GREEN:** Add only enough migration, persistence, generation, configuration, and routing behavior to pass.
3. **REFACTOR:** Concentrate migration execution and URL creation behind small interfaces while green.
4. **RED:** Test that an already-applied migration is safely skipped.
5. **GREEN:** Record and check migration versions with the minimum implementation.
6. **REFACTOR:** Remove revealed duplication without widening public interfaces.

## Out of Scope

- Redirecting through a Short URL
- Duplicate reuse and normalization
- Full invalid-input coverage
- Short Code collision retries
- Expiration, authentication, and rate limiting

## Summary

This tracer bullet proves the complete creation path: automatic SQL migration,
HTTP request, PostgreSQL persistence, Base62 generation, and `201` response.
