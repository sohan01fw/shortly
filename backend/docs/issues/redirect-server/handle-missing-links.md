# Cache Missing Short Codes

**Type:** AFK  
**Status:** Completed  
**Blocked by:** [Cache Successful Redirects](./cache-redirects.md)

## User Story

As the system owner, I want repeated invalid Short Code requests absorbed by
Redis so that random traffic does not repeatedly query PostgreSQL.

## What to Build

Reject malformed paths before accessing Redis or PostgreSQL. A valid Short Code
contains exactly seven Base62 characters. Malformed and unknown codes return the
same structured `404`, so storage details are not exposed.

When PostgreSQL has no matching Short Code, store a distinct negative sentinel
in Redis for 60 seconds. A negative Cache Hit returns `404` without PostgreSQL.
When URL creation later succeeds for that code, its best-effort positive cache
write replaces any sentinel immediately.

## Public Interface Behavior

- Malformed Short Codes return structured `404` without dependency access.
- Unknown valid codes return `404` and create a 60-second negative cache entry.
- Repeated requests during that TTL return `404` without PostgreSQL lookup.
- A newly created code replaces a stale negative sentinel with its Original URL.
- Positive and negative cache entries cannot be confused.

## Acceptance Criteria

- [x] Codes with wrong length or non-Base62 characters return the agreed `404`.
- [x] Malformed-code tests prove no Redis or PostgreSQL lookup occurs.
- [x] An unknown valid code creates a distinct negative Redis value.
- [x] The negative entry has a positive TTL no greater than 60 seconds.
- [x] A negative Cache Hit returns `404` while PostgreSQL lookup is unavailable.
- [x] Creation replaces a pre-existing negative sentinel for the generated code.
- [x] A replaced sentinel resolves as a normal `302` redirect.

## TDD Cycles

1. **RED → GREEN:** Add wrong-length `404` behavior before dependency lookup.
2. **RED → GREEN:** Add non-Base62 `404` behavior before dependency lookup.
3. **RED:** Test that a PostgreSQL miss creates a negative entry in real Redis.
4. **GREEN:** Add a distinct sentinel with a 60-second TTL.
5. **RED:** Test that a negative Cache Hit avoids PostgreSQL.
6. **GREEN:** Interpret the sentinel before database lookup.
7. **RED:** Test creation replacing a sentinel and enabling redirect.
8. **GREEN:** Reuse positive cache warming to overwrite the negative entry.
9. **REFACTOR:** Centralize positive, negative, and absent cache-result decoding.

## Out of Scope

- Custom 404 web pages
- Variable-length Short Codes
- Abuse detection or rate limiting
- Permanent negative caching
- Cache metrics

## Summary

This slice protects PostgreSQL from repeated misses, rejects malformed Short
Codes early, and prevents negative cache entries from hiding newly created URLs.
