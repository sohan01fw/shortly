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

const shortCodePattern = /^[0-9A-Za-z]{7}$/;

export const createRedirectApp = (
  shortUrlStore: ShortUrlStore = postgresShortUrlStore,
  redirectCache: RedirectCache = redisRedirectCache,
  healthCheck: DependencyHealthCheck = checkDependencies,
): express.Express => {
  const app = express();

  app.get("/health", async (_request, response) => {
    const health = await healthCheck();
    response.status(health.status === "error" ? 503 : 200).json(health);
  });

  app.all("/:code", async (request, response) => {
    if (!shortCodePattern.test(request.params.code)) {
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
      console.error("Unable to read redirect cache", error);
    }

    if (cached.kind === "hit") {
      response.redirect(302, cached.originalUrl);
      return;
    }

    if (cached.kind === "missing") {
      response.status(404).json(shortUrlNotFoundError);
      return;
    }

    let originalUrl: string | undefined;

    try {
      originalUrl = await shortUrlStore.findOriginalUrl(request.params.code);
    } catch (error) {
      console.error("Unable to query Short URL storage", error);
      response.status(503).json(redirectUnavailableError);
      return;
    }

    if (!originalUrl) {
      try {
        await redirectCache.storeMissing(request.params.code);
      } catch (error) {
        console.error("Unable to cache missing Short Code", error);
      }
      response.status(404).json(shortUrlNotFoundError);
      return;
    }

    try {
      await redirectCache.storeOriginalUrl(request.params.code, originalUrl);
    } catch (error) {
      console.error("Unable to cache redirect", error);
    }
    response.redirect(302, originalUrl);
  });

  return app;
};

export const redirectApp = createRedirectApp();
