import express from "express";

import {
  checkDependencies,
  type DependencyHealthCheck,
} from "./dependencies";
import {
  redirectUnavailableError,
  shortUrlNotFoundError,
} from "./urls/errors";
import {
  redisRedirectCache,
  type RedirectCache,
} from "./urls/redirect-cache";
import {
  postgresShortUrlStore,
  type ShortUrlStore,
} from "./urls/short-url-store";
import { redirectMetrics, type AppMetrics } from "./metrics";

const shortCodePattern = /^[0-9A-Za-z]{7}$/;

export const createRedirectApp = (
  shortUrlStore: ShortUrlStore = postgresShortUrlStore,
  redirectCache: RedirectCache = redisRedirectCache,
  healthCheck: DependencyHealthCheck = checkDependencies,
  metrics: AppMetrics = redirectMetrics,
): express.Express => {
  const app = express();

  app.use(metrics.requestMiddleware);
  app.get("/metrics", async (_request, response) => {
    response.type(metrics.contentType).send(await metrics.registry.metrics());
  });

  app.get("/health", async (_request, response) => {
    const health = await healthCheck();
    if (health.postgres === "down") {
      metrics.recordDependencyFailure("postgres", "health_check");
    }
    if (health.redis === "down") {
      metrics.recordDependencyFailure("redis", "health_check");
    }
    response.status(health.status === "error" ? 503 : 200).json(health);
  });

  app.all("/:code", async (request, response) => {
    if (!shortCodePattern.test(request.params.code)) {
      metrics.recordRedirect("not_found");
      response.status(404).json(shortUrlNotFoundError);
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.set("Allow", "GET, HEAD").sendStatus(405);
      return;
    }

    let cached: Awaited<ReturnType<RedirectCache["lookup"]>> = {
      kind: "absent",
    };

    try {
      cached = await redirectCache.lookup(request.params.code);
    } catch (error) {
      metrics.recordCache("error");
      metrics.recordDependencyFailure("redis", "cache_lookup");
      console.error("Unable to read redirect cache", error);
    }

    if (cached.kind === "hit") {
      metrics.recordCache("hit");
      metrics.recordRedirect("redirected");
      response.redirect(302, cached.originalUrl);
      return;
    }

    if (cached.kind === "missing") {
      metrics.recordCache("negative_hit");
      metrics.recordRedirect("not_found");
      response.status(404).json(shortUrlNotFoundError);
      return;
    }

    metrics.recordCache("miss");
    metrics.recordPostgresFallback();
    let originalUrl: string | undefined;

    try {
      originalUrl = await shortUrlStore.findOriginalUrl(request.params.code);
    } catch (error) {
      metrics.recordDependencyFailure("postgres", "redirect_lookup");
      metrics.recordRedirect("unavailable");
      console.error("Unable to query Short URL storage", error);
      response.status(503).json(redirectUnavailableError);
      return;
    }

    if (!originalUrl) {
      try {
        await redirectCache.storeMissing(request.params.code);
      } catch (error) {
        metrics.recordCache("write_error");
        metrics.recordDependencyFailure("redis", "cache_write_missing");
        console.error("Unable to cache missing Short Code", error);
      }
      metrics.recordRedirect("not_found");
      response.status(404).json(shortUrlNotFoundError);
      return;
    }

    try {
      await redirectCache.storeOriginalUrl(request.params.code, originalUrl);
    } catch (error) {
      metrics.recordCache("write_error");
      metrics.recordDependencyFailure("redis", "cache_write_redirect");
      console.error("Unable to cache redirect", error);
    }
    metrics.recordRedirect("redirected");
    response.redirect(302, originalUrl);
  });

  return app;
};

export const redirectApp = createRedirectApp();
