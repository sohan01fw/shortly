import type { NextFunction, Request, Response } from "express";
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from "prom-client";

type ServiceName = "creation" | "redirect";

export type AppMetrics = {
  registry: Registry;
  contentType: string;
  requestMiddleware: (request: Request, response: Response, next: NextFunction) => void;
  recordUrlCreation(outcome: "created" | "reused" | "invalid" | "failed"): void;
  recordRedirect(outcome: "redirected" | "not_found" | "unavailable"): void;
  recordCache(outcome: "hit" | "negative_hit" | "miss" | "error" | "write_error"): void;
  recordPostgresFallback(): void;
  recordDependencyFailure(dependency: "postgres" | "redis", operation: string): void;
};

const routeName = (service: ServiceName, request: Request): string => {
  if (request.path === "/health") return "/health";
  if (request.path === "/metrics") return "/metrics";
  if (service === "creation" && request.path === "/urls") return "/urls";
  if (service === "creation" && request.path === "/") return "/";
  if (service === "redirect") return "/:code";
  return "unmatched";
};

export const createAppMetrics = (service: ServiceName): AppMetrics => {
  const registry = new Registry();
  registry.setDefaultLabels({ service });
  collectDefaultMetrics({ register: registry, prefix: "shortly_" });

  const requests = new Counter({
    name: "shortly_http_requests_total",
    help: "HTTP requests handled by Shortly services.",
    labelNames: ["method", "route", "status"] as const,
    registers: [registry],
  });
  const requestDuration = new Histogram({
    name: "shortly_http_request_duration_seconds",
    help: "HTTP request duration in seconds.",
    labelNames: ["method", "route", "status"] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });
  const urlCreations = new Counter({
    name: "shortly_url_creation_total",
    help: "Short URL creation attempts by outcome.",
    labelNames: ["outcome"] as const,
    registers: [registry],
  });
  const redirects = new Counter({
    name: "shortly_redirect_total",
    help: "Short URL redirect attempts by outcome.",
    labelNames: ["outcome"] as const,
    registers: [registry],
  });
  const cacheOperations = new Counter({
    name: "shortly_redirect_cache_total",
    help: "Redirect cache operations by outcome.",
    labelNames: ["outcome"] as const,
    registers: [registry],
  });
  const postgresFallbacks = new Counter({
    name: "shortly_postgres_fallback_total",
    help: "Redirect requests that fell back to PostgreSQL.",
    registers: [registry],
  });
  const dependencyFailures = new Counter({
    name: "shortly_dependency_failures_total",
    help: "Dependency operation failures.",
    labelNames: ["dependency", "operation"] as const,
    registers: [registry],
  });

  return {
    registry,
    contentType: registry.contentType,
    requestMiddleware(request, response, next) {
      if (request.path === "/metrics") {
        next();
        return;
      }

      const startedAt = process.hrtime.bigint();
      response.once("finish", () => {
        const labels = {
          method: request.method,
          route: routeName(service, request),
          status: String(response.statusCode),
        };
        requests.inc(labels);
        requestDuration.observe(
          labels,
          Number(process.hrtime.bigint() - startedAt) / 1_000_000_000,
        );
      });
      next();
    },
    recordUrlCreation: (outcome) => urlCreations.inc({ outcome }),
    recordRedirect: (outcome) => redirects.inc({ outcome }),
    recordCache: (outcome) => cacheOperations.inc({ outcome }),
    recordPostgresFallback: () => postgresFallbacks.inc(),
    recordDependencyFailure: (dependency, operation) =>
      dependencyFailures.inc({ dependency, operation }),
  };
};

export const creationMetrics = createAppMetrics("creation");
export const redirectMetrics = createAppMetrics("redirect");
