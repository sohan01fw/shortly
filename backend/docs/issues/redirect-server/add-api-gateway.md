# Add the API Gateway

**Type:** AFK  
**Status:** Completed  
**Blocked by:** [Redirect from PostgreSQL](./redirect-from-postgres.md), [Cache Successful Redirects](./cache-redirects.md), [Cache Missing Short Codes](./handle-missing-links.md), and [Survive Dependency Failures](./survive-cache-failure.md)

## User Story

As a caller, I want one stable public origin for creation and redirects so that
I do not need to know which server handles each request.

## What to Build

Add Nginx as a thin gateway on public port `5000`. Route `POST /urls` to the
Creation Server and `GET|HEAD /:code` to the Redirect Server. Run both Bun
processes on private Compose ports and keep `SHORT_URL_BASE_URL` pointed at the
gateway so all existing and newly generated Short URLs remain valid.

Expose gateway liveness at `/health`, plus routed Creation and Redirect Server
health at `/health/creation` and `/health/redirect`. Docker must probe each Bun
process directly so gateway liveness cannot hide an unhealthy upstream.

Change `bun dev` to run the full Docker development topology with source mounts
and Bun watch processes. Keep `bun run dev:down` as the full-stack shutdown.

## Public Interface Behavior

- Public `POST /urls` retains the complete v1 contract.
- Public `GET|HEAD /:code` retains the redirect contract.
- Nginx owns host port `5000`; Bun server ports are not published.
- Gateway health routes expose liveness and upstream health separately.
- Existing `http://localhost:5000/{code}` Short URLs continue to work.

## Acceptance Criteria

- [x] A gateway integration test creates a Short URL and follows its redirect through port `5000`.
- [x] Nginx routes only creation requests to the Creation Server.
- [x] Nginx routes only Short Code `GET|HEAD` requests to the Redirect Server.
- [x] Unsupported public methods preserve the Redirect Server `405` behavior.
- [x] Gateway, Creation Server, and Redirect Server health routes are distinct.
- [x] Compose starts Nginx, both Bun processes, PostgreSQL, and Redis in dependency order.
- [x] `bun dev` provides watch-mode development for both Bun processes.
- [x] `bun run dev:down` removes the complete development stack.
- [x] Full tests, typecheck, Docker image builds, and Compose validation pass.

## TDD Cycles

1. **RED:** Add an end-to-end gateway test for public URL creation.
2. **GREEN:** Add minimal Nginx creation routing and private Creation Server port.
3. **RED:** Extend the gateway test through public Short URL redirect.
4. **GREEN:** Add Redirect Server routing and its private port.
5. **RED → GREEN:** Add gateway and routed upstream health behaviors.
6. **RED → GREEN:** Verify method routing and `405` preservation.
7. **REFACTOR:** Consolidate Compose environment and health definitions without changing routing.
8. **RED → GREEN:** Verify the full Docker development workflow and shutdown command.
9. **REFACTOR:** Update operational documentation and run the complete verification suite.

## Out of Scope

- TLS termination and public domains
- Gateway authentication or rate limiting
- Load balancing across multiple replicas
- Metrics and access-log analytics
- Production deployment manifests

## Summary

This final slice puts Nginx on the stable public origin, routes creation and
redirect traffic to independently runnable servers, and completes the local
Docker development topology without invalidating existing Short URLs.
