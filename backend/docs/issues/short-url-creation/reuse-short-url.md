# Normalize and Reuse a Short URL

**Type:** AFK  
**Status:** Completed  
**Blocked by:** Completed

## User Story

As a local user, I want equivalent Original URLs to reuse one Short URL so that
the database does not accumulate duplicate destinations.

## What to Build

Normalize every valid Original URL before persistence. Lowercase the hostname
and remove its default port. Preserve path, trailing slash, query string, and
fragment exactly because each may change the destination.

Enforce Normalized URL uniqueness in PostgreSQL. Matching requests return the
existing record with `200 OK`. Concurrent equivalent requests must create one
record and return the same Short URL to every caller.

## Public Interface Behavior

- The first new Normalized URL returns `201`.
- Equivalent submissions return the same data with `200`.
- Hostname case and explicit default ports do not create distinct records.
- Different paths, trailing slashes, queries, or fragments remain distinct.
- `originalUrl` is the canonical normalized value stored in PostgreSQL.

## Acceptance Criteria

- [x] An exact duplicate returns the same code, first with `201`, then `200`.
- [x] Hostname casing differences reuse the Short URL.
- [x] Explicit `:80` and `:443` default ports reuse the Short URL.
- [x] Path and trailing-slash differences produce distinct Short URLs.
- [x] Query differences produce distinct Short URLs.
- [x] Fragment differences produce distinct Short URLs.
- [x] Concurrent equivalent requests create one record and share one code.
- [x] PostgreSQL is the final authority for uniqueness.

## TDD Cycles

1. **RED → GREEN:** Add exact-duplicate reuse, then return the existing record with `200`.
2. **RED → GREEN:** Add hostname-case equivalence, then canonical normalization.
3. **RED → GREEN:** Add default-port equivalence, then extend normalization minimally.
4. **RED → GREEN:** Add path and trailing-slash distinction, preserving both.
5. **RED → GREEN:** Add query and fragment distinction, preserving both.
6. **RED → GREEN:** Add concurrent duplicate creation, then return the winning row after a uniqueness conflict.
7. **REFACTOR:** Deepen normalization and create-or-reuse behind one interface.

## Out of Scope

- Redirect behavior
- Query-parameter sorting
- Removing fragments or trailing slashes
- Storing every submitted variation

## Summary

This slice turns creation into create-or-reuse behavior, with PostgreSQL
guaranteeing deduplication under sequential and concurrent requests.
