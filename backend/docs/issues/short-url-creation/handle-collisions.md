# Handle Short Code Collisions

**Type:** AFK  
**Status:** Completed  
**Blocked by:** Completed

## User Story

As a caller, I want Short Code generation to recover from rare collisions and
fail consistently if creation cannot complete.

## What to Build

Enforce Short Code uniqueness in PostgreSQL. When a generated Base62 code exists,
generate another and retry, up to five total attempts. If all attempts collide,
return a structured `500` without modifying existing records.

Complete operational wiring: document `SHORT_URL_BASE_URL`, run migrations in
local and Docker startup paths, add a test command, and verify the backend
without introducing redirect behavior or Redis caching.

## Public Interface Behavior

- A recoverable collision is invisible and returns the normal `201` response.
- Five exhausted attempts return:

  ```json
  {
    "error": {
      "code": "SHORT_CODE_GENERATION_FAILED",
      "message": "Unable to generate a unique short URL."
    }
  }
  ```

- Unexpected persistence failures return structured `500` errors and are logged
  without exposing internal details.

## Acceptance Criteria

- [x] A behavior test forces one collision and observes success with another code.
- [x] A behavior test forces five collisions and observes the agreed `500` response.
- [x] Existing records remain unchanged after collision failures.
- [x] Production Base62 generation uses cryptographically secure randomness.
- [x] `SHORT_URL_BASE_URL=http://localhost:5000` is documented.
- [x] Migrations complete before HTTP readiness locally and in Docker.
- [x] A package test command runs the integration suite.
- [x] Tests, typecheck, and Compose validation pass.

## TDD Cycles

1. **RED:** Test one controlled collision followed by success.
2. **GREEN:** Add a deterministic code-source seam and retry only Short Code uniqueness conflicts.
3. **REFACTOR:** Keep production and test adapters behind the same small interface.
4. **RED:** Test five exhausted collision attempts and the agreed `500` error.
5. **GREEN:** Bound retries and map exhaustion to the public response.
6. **REFACTOR:** Centralize unexpected-error handling and logging.
7. **RED → GREEN:** Verify migrations complete before readiness.
8. **REFACTOR:** Finalize scripts and docs, then run the complete verification suite.

## Out of Scope

- `GET /:code` redirects
- Redis lookup or creation caching
- Expiration or deletion
- Authentication, analytics, and rate limiting
- Configurable Short Code length

## Summary

This final slice makes collisions safe, defines terminal failure behavior, and
leaves the creation flow documented and verifiable in every startup mode.
