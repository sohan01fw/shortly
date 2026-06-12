# Reject Invalid Original URLs

**Type:** AFK  
**Status:** Completed  
**Blocked by:** Completed

## User Story

As a caller, I want invalid Original URLs rejected consistently so that I can
correct my request without creating unusable records.

## What to Build

Validate `url` at the public HTTP interface. It must be a string no longer than
2,048 characters, parse as a URL, and use `http` or `https`. Every failure
returns `400 Bad Request` using the shared error envelope and creates no record.

## Public Interface Behavior

- Missing, non-string, malformed, unsupported-protocol, and oversized values return `400`.
- Validation errors use code `INVALID_URL` and the agreed message.
- Valid HTTP and HTTPS inputs retain the creation behavior.

## Acceptance Criteria

- [x] Missing `url` returns the agreed `400` response.
- [x] A non-string `url` returns the same response.
- [x] A malformed URL returns the same response.
- [x] A non-HTTP(S) URL such as `ftp:` returns the same response.
- [x] A URL over 2,048 characters returns the same response.
- [x] Each case is tested through `POST /urls`, one case per TDD cycle.
- [x] Invalid requests do not consume or return a Short Code.

## TDD Cycles

1. **RED → GREEN:** Add the missing-field test, then the minimum shared error response.
2. **RED → GREEN:** Add the non-string test, then tighten type validation.
3. **RED → GREEN:** Add the malformed-URL test, then parse with the standard `URL` interface.
4. **RED → GREEN:** Add the unsupported-protocol test, then allow only HTTP and HTTPS.
5. **RED → GREEN:** Add the oversized-input test, then enforce 2,048 characters.
6. **REFACTOR:** Consolidate validation and error mapping after all behaviors are green.

## Out of Scope

- Domain allowlists or denylists
- Destination availability checks
- Malware or phishing detection
- Authentication and rate limiting

## Summary

This slice makes `POST /urls` predictable for malformed input while preserving
the successful Short URL creation path.
