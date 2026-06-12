# ADR 001: Nginx Fronts Two Bun Processes

## Status

Accepted

## Context

Short URL creation and redirect traffic have different scaling and operational
profiles, but they share one domain model, PostgreSQL schema, migration history,
and TypeScript package.

## Decision

Run the Creation Server and Redirect Server as separate Bun processes from the
same package. Nginx will own the public port and route creation requests to the
Creation Server and redirect requests to the Redirect Server.

## Consequences

Each server can be deployed, restarted, and scaled independently without
duplicating shared code or migration ownership. Nginx adds a routing component,
and both processes must remain compatible with the shared database schema.
