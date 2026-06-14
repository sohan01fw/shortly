import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { Server } from "node:http";

process.env.DATABASE_URL ??= "postgres://shortly:shortly@localhost:5432/shortly";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.SHORT_URL_BASE_URL = "http://localhost:5000";

const { app, createApp } = await import("../src/app");
const { createRedirectApp } = await import("../src/redirect-app");
const {
  createDependencyLifecycle,
  postgres,
  redis,
  startDependencies,
  stopDependencies,
} = await import("../src/dependencies");
const { runMigrations } = await import("../src/database/migrations");
const { createAppMetrics } = await import("../src/metrics");

let server: Server | undefined;
let baseUrl: string;

const postUrlTo = (serverBaseUrl: string, body: unknown): Promise<Response> =>
  fetch(`${serverBaseUrl}/urls`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const postUrl = (body: unknown): Promise<Response> => postUrlTo(baseUrl, body);

const listen = async (application: ReturnType<typeof createApp>): Promise<{
  server: Server;
  baseUrl: string;
}> => {
  const listeningServer = application.listen(0);
  await new Promise<void>((resolve) => listeningServer.once("listening", resolve));
  const address = listeningServer.address();

  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a TCP port");
  }

  return {
    server: listeningServer,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
};

const closeServer = (serverToClose: Server): Promise<void> =>
  new Promise<void>((resolve, reject) =>
    serverToClose.close((error) => (error ? reject(error) : resolve())),
  );

type ShortUrlResponse = {
  code: string;
  shortUrl: string;
  originalUrl: string;
};

const createUrl = async (url: string): Promise<{
  response: Response;
  body: ShortUrlResponse;
}> => {
  const response = await postUrl({ url });
  return { response, body: (await response.json()) as ShortUrlResponse };
};

const expectInvalidUrl = async (body: unknown): Promise<void> => {
  const response = await postUrl(body);

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: {
      code: "INVALID_URL",
      message: "A valid HTTP or HTTPS URL is required.",
    },
  });

  const stored = await postgres.query("SELECT COUNT(*)::int AS count FROM urls");
  expect(stored.rows).toEqual([{ count: 0 }]);
};

beforeAll(async () => {
  await startDependencies();
  await runMigrations(postgres);
  const listening = await listen(app);
  server = listening.server;
  baseUrl = listening.baseUrl;
});

beforeEach(async () => {
  await Promise.all([
    postgres.query("TRUNCATE urls RESTART IDENTITY"),
    redis.flushDb(),
  ]);
});

afterAll(async () => {
  if (server) {
    await closeServer(server);
  }
  await stopDependencies();
});

describe("POST /urls", () => {
  test("warms the positive redirect cache after creation", async () => {
    const created = await createUrl("https://example.com/warm-cache");

    expect(created.response.status).toBe(201);
    expect(await redis.get(`short-url:${created.body.code}`)).toBe(
      created.body.originalUrl,
    );

    const ttl = await redis.ttl(`short-url:${created.body.code}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(24 * 60 * 60);
  });

  test("refreshes the positive redirect cache when reusing a Short URL", async () => {
    const originalUrl = "https://example.com/refresh-cache";
    const first = await createUrl(originalUrl);
    const cacheKey = `short-url:${first.body.code}`;
    await redis.set(cacheKey, "https://example.com/stale", { EX: 1 });

    const reused = await createUrl(originalUrl);

    expect(reused.response.status).toBe(200);
    expect(reused.body).toEqual(first.body);
    expect(await redis.get(cacheKey)).toBe(first.body.originalUrl);
    expect(await redis.ttl(cacheKey)).toBeGreaterThan(1);
  });

  test("creation succeeds when its best-effort cache write fails", async () => {
    const cacheError = new Error("Redis write failed");
    const failingCache = {
      storeOriginalUrl: async (): Promise<void> => {
        throw cacheError;
      },
    };
    const creationServer = await listen(createApp(() => "CACHEER", failingCache));
    const originalConsoleError = console.error;
    const loggedErrors: unknown[][] = [];
    console.error = (...args: unknown[]) => loggedErrors.push(args);

    try {
      const response = await postUrlTo(creationServer.baseUrl, {
        url: "https://example.com/cache-error",
      });

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({
        code: "CACHEER",
        shortUrl: "http://localhost:5000/CACHEER",
        originalUrl: "https://example.com/cache-error",
      });
      expect(loggedErrors).toContainEqual([
        "Unable to warm redirect cache",
        cacheError,
      ]);
    } finally {
      console.error = originalConsoleError;
      await closeServer(creationServer.server);
    }
  });

  test("creation replaces a negative sentinel and enables redirect", async () => {
    const code = "NEWLINK";
    const originalUrl = "https://example.com/replaced-sentinel";
    await redis.set(`short-url:${code}`, "__SHORT_URL_NOT_FOUND__", { EX: 60 });
    const creationServer = await listen(createApp(() => code));
    const redirectServer = await listen(createRedirectApp());

    try {
      const creationResponse = await postUrlTo(creationServer.baseUrl, {
        url: originalUrl,
      });

      expect(creationResponse.status).toBe(201);
      expect(await redis.get(`short-url:${code}`)).toBe(originalUrl);

      const redirectResponse = await fetch(
        `${redirectServer.baseUrl}/${code}`,
        { redirect: "manual" },
      );

      expect(redirectResponse.status).toBe(302);
      expect(redirectResponse.headers.get("location")).toBe(originalUrl);
    } finally {
      await Promise.all([
        closeServer(creationServer.server),
        closeServer(redirectServer.server),
      ]);
    }
  });

  test("creates and persists a short URL", async () => {
    const originalUrl = "https://example.com/page";
    const response = await postUrl({ url: originalUrl });

    expect(response.status).toBe(201);

    const body = (await response.json()) as ShortUrlResponse;

    expect(body).toEqual({
      code: expect.stringMatching(/^[0-9A-Za-z]{7}$/),
      shortUrl: `http://localhost:5000/${body.code}`,
      originalUrl,
    });

    const stored = await postgres.query(
      "SELECT short_code, original_url, normalized_url FROM urls WHERE short_code = $1",
      [body.code],
    );

    expect(stored.rows).toEqual([
      {
        short_code: body.code,
        original_url: originalUrl,
        normalized_url: originalUrl,
      },
    ]);
  });

  test("rejects a missing URL", async () => {
    await expectInvalidUrl({});
  });

  test("rejects a non-string URL", async () => {
    await expectInvalidUrl({ url: 42 });
  });

  test("rejects a malformed URL", async () => {
    await expectInvalidUrl({ url: "not a url" });
  });

  test("rejects a URL with an unsupported protocol", async () => {
    await expectInvalidUrl({ url: "ftp://example.com/file" });
  });

  test("rejects a URL longer than 2,048 characters", async () => {
    await expectInvalidUrl({ url: `https://example.com/${"a".repeat(2030)}` });
  });

  test("accepts a valid HTTP URL", async () => {
    const response = await postUrl({ url: "http://example.com/page" });

    expect(response.status).toBe(201);
  });

  test("reuses an exact duplicate", async () => {
    const first = await createUrl("https://example.com/page");
    const second = await createUrl("https://example.com/page");

    expect(first.response.status).toBe(201);
    expect(second.response.status).toBe(200);
    expect(second.body).toEqual(first.body);
  });

  test("reuses a URL when hostname casing differs", async () => {
    const first = await createUrl("https://EXAMPLE.com/page");
    const second = await createUrl("https://example.COM/page");

    expect(second.response.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(second.body.originalUrl).toBe("https://example.com/page");
  });

  test("reuses a URL when its explicit default port differs", async () => {
    const http = await createUrl("http://example.com:80/page");
    const httpWithoutPort = await createUrl("http://example.com/page");

    expect(httpWithoutPort.response.status).toBe(200);
    expect(httpWithoutPort.body).toEqual(http.body);

    await postgres.query("TRUNCATE urls RESTART IDENTITY");

    const https = await createUrl("https://example.com:443/page");
    const httpsWithoutPort = await createUrl("https://example.com/page");

    expect(httpsWithoutPort.response.status).toBe(200);
    expect(httpsWithoutPort.body).toEqual(https.body);
  });

  test("keeps different paths and trailing slashes distinct", async () => {
    const page = await createUrl("https://example.com/page");
    const otherPage = await createUrl("https://example.com/other");
    const trailingSlash = await createUrl("https://example.com/page/");

    expect(otherPage.response.status).toBe(201);
    expect(trailingSlash.response.status).toBe(201);
    expect(
      new Set([page.body.code, otherPage.body.code, trailingSlash.body.code]).size,
    ).toBe(3);
  });

  test("keeps query differences distinct", async () => {
    const first = await createUrl("https://example.com/page?view=one");
    const second = await createUrl("https://example.com/page?view=two");

    expect(second.response.status).toBe(201);
    expect(second.body.code).not.toBe(first.body.code);
  });

  test("keeps fragment differences distinct", async () => {
    const first = await createUrl("https://example.com/page#one");
    const second = await createUrl("https://example.com/page#two");

    expect(second.response.status).toBe(201);
    expect(second.body.code).not.toBe(first.body.code);
  });

  test("concurrent equivalent requests create one record and share one code", async () => {
    const requests = Array.from({ length: 8 }, (_, index) =>
      createUrl(index % 2 === 0
        ? "https://EXAMPLE.com:443/page"
        : "https://example.com/page"),
    );
    const results = await Promise.all(requests);

    expect(results.filter(({ response }) => response.status === 201)).toHaveLength(1);
    expect(results.filter(({ response }) => response.status === 200)).toHaveLength(7);
    expect(new Set(results.map(({ body }) => body.code)).size).toBe(1);

    const stored = await postgres.query("SELECT COUNT(*)::int AS count FROM urls");
    expect(stored.rows).toEqual([{ count: 1 }]);
  });

  test("retries a short code collision and succeeds with another code", async () => {
    const existingApp = await listen(createApp(() => "COLLIDE"));
    const codes = ["COLLIDE", "SUCCESS"];
    const retryingApp = await listen(createApp(() => codes.shift() ?? "SUCCESS"));

    try {
      const existing = await postUrlTo(existingApp.baseUrl, {
        url: "https://example.com/existing",
      });
      const response = await postUrlTo(retryingApp.baseUrl, {
        url: "https://example.com/new",
      });

      expect(existing.status).toBe(201);
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({
        code: "SUCCESS",
        shortUrl: "http://localhost:5000/SUCCESS",
        originalUrl: "https://example.com/new",
      });
    } finally {
      await Promise.all([
        closeServer(existingApp.server),
        closeServer(retryingApp.server),
      ]);
    }
  });

  test("returns a structured error after five short code collisions", async () => {
    const existingApp = await listen(createApp(() => "COLLIDE"));
    let attempts = 0;
    const exhaustedApp = await listen(createApp(() => {
      attempts += 1;
      return "COLLIDE";
    }));

    try {
      await postUrlTo(existingApp.baseUrl, {
        url: "https://example.com/existing",
      });
      const before = await postgres.query(
        "SELECT short_code, original_url, normalized_url FROM urls ORDER BY short_code",
      );

      const response = await postUrlTo(exhaustedApp.baseUrl, {
        url: "https://example.com/new",
      });

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: {
          code: "SHORT_CODE_GENERATION_FAILED",
          message: "Unable to generate a unique short URL.",
        },
      });
      expect(attempts).toBe(5);

      const after = await postgres.query(
        "SELECT short_code, original_url, normalized_url FROM urls ORDER BY short_code",
      );
      expect(after.rows).toEqual(before.rows);
    } finally {
      await Promise.all([
        closeServer(existingApp.server),
        closeServer(exhaustedApp.server),
      ]);
    }
  });
});

describe("Prometheus metrics", () => {
  test("exposes creation request and outcome metrics without URL labels", async () => {
    const metrics = createAppMetrics("creation");
    const creationServer = await listen(
      createApp(
        () => "METRIC1",
        { storeOriginalUrl: async () => undefined },
        async () => ({
          status: "ok" as const,
          postgres: "up" as const,
          redis: "up" as const,
        }),
        metrics,
      ),
    );
    const originalUrl = "https://example.com/private-path";

    try {
      const response = await postUrlTo(creationServer.baseUrl, { url: originalUrl });
      expect(response.status).toBe(201);

      const metricsResponse = await fetch(`${creationServer.baseUrl}/metrics`);
      const body = await metricsResponse.text();

      expect(metricsResponse.headers.get("content-type")).toContain(
        "text/plain",
      );
      expect(body).toContain("shortly_http_requests_total");
      expect(body).toContain('route="/urls"');
      expect(body).toContain('shortly_url_creation_total{outcome="created",service="creation"} 1');
      expect(body).not.toContain(originalUrl);
      expect(body).not.toContain("METRIC1");
    } finally {
      await closeServer(creationServer.server);
    }
  });

  test("records redirect cache misses and PostgreSQL fallback", async () => {
    const metrics = createAppMetrics("redirect");
    const redirectServer = await listen(
      createRedirectApp(
        { findOriginalUrl: async () => "https://example.com/target" },
        {
          lookup: async () => ({ kind: "absent" as const }),
          storeOriginalUrl: async () => undefined,
          storeMissing: async () => undefined,
        },
        async () => ({
          status: "ok" as const,
          postgres: "up" as const,
          redis: "up" as const,
        }),
        metrics,
      ),
    );

    try {
      const response = await fetch(`${redirectServer.baseUrl}/METRIC2`, {
        redirect: "manual",
      });
      expect(response.status).toBe(302);

      const body = await fetch(`${redirectServer.baseUrl}/metrics`).then(
        (result) => result.text(),
      );
      expect(body).toContain('shortly_redirect_cache_total{outcome="miss",service="redirect"} 1');
      expect(body).toContain("shortly_postgres_fallback_total{service=\"redirect\"} 1");
      expect(body).toContain('shortly_redirect_total{outcome="redirected",service="redirect"} 1');
      expect(body).not.toContain("METRIC2");
    } finally {
      await closeServer(redirectServer.server);
    }
  });
});

describe("Redirect Server", () => {
  test("both servers stay ready with degraded health when Redis is down", async () => {
    const degradedHealth = async () => ({
      status: "degraded" as const,
      postgres: "up" as const,
      redis: "down" as const,
    });
    const creationServer = await listen(
      createApp(undefined, undefined, degradedHealth),
    );
    const redirectServer = await listen(
      createRedirectApp(undefined, undefined, degradedHealth),
    );

    try {
      const [creationResponse, redirectResponse] = await Promise.all([
        fetch(`${creationServer.baseUrl}/health`),
        fetch(`${redirectServer.baseUrl}/health`),
      ]);

      expect(creationResponse.status).toBe(200);
      expect(redirectResponse.status).toBe(200);
      expect(await creationResponse.json()).toEqual({
        status: "degraded",
        postgres: "up",
        redis: "down",
      });
      expect(await redirectResponse.json()).toEqual({
        status: "degraded",
        postgres: "up",
        redis: "down",
      });
    } finally {
      await Promise.all([
        closeServer(creationServer.server),
        closeServer(redirectServer.server),
      ]);
    }
  });

  test("both servers fail readiness when PostgreSQL is down", async () => {
    const failedHealth = async () => ({
      status: "error" as const,
      postgres: "down" as const,
      redis: "up" as const,
    });
    const creationServer = await listen(
      createApp(undefined, undefined, failedHealth),
    );
    const redirectServer = await listen(
      createRedirectApp(undefined, undefined, failedHealth),
    );

    try {
      const [creationResponse, redirectResponse] = await Promise.all([
        fetch(`${creationServer.baseUrl}/health`),
        fetch(`${redirectServer.baseUrl}/health`),
      ]);

      expect(creationResponse.status).toBe(503);
      expect(redirectResponse.status).toBe(503);
      expect(await creationResponse.json()).toEqual({
        status: "error",
        postgres: "down",
        redis: "up",
      });
      expect(await redirectResponse.json()).toEqual({
        status: "error",
        postgres: "down",
        redis: "up",
      });
    } finally {
      await Promise.all([
        closeServer(creationServer.server),
        closeServer(redirectServer.server),
      ]);
    }
  });

  test("falls back to PostgreSQL when Redis is unavailable", async () => {
    const created = await createUrl("https://example.com/redis-outage");
    const unavailableCache = {
      lookup: async () => {
        throw new Error("Redis lookup failed");
      },
      storeOriginalUrl: async (): Promise<void> => {
        throw new Error("Redis write failed");
      },
      storeMissing: async (): Promise<void> => {
        throw new Error("Redis write failed");
      },
    };
    const redirectServer = await listen(
      createRedirectApp(undefined, unavailableCache),
    );

    try {
      const response = await fetch(
        `${redirectServer.baseUrl}/${created.body.code}`,
        { redirect: "manual" },
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(created.body.originalUrl);
    } finally {
      await closeServer(redirectServer.server);
    }
  });

  test("returns 404 for an unknown code when Redis is unavailable", async () => {
    const unavailableCache = {
      lookup: async () => {
        throw new Error("Redis lookup failed");
      },
      storeOriginalUrl: async (): Promise<void> => {
        throw new Error("Redis write failed");
      },
      storeMissing: async (): Promise<void> => {
        throw new Error("Redis write failed");
      },
    };
    const redirectServer = await listen(
      createRedirectApp(undefined, unavailableCache),
    );

    try {
      const response = await fetch(`${redirectServer.baseUrl}/Unknown`);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: {
          code: "SHORT_URL_NOT_FOUND",
          message: "Short URL not found.",
        },
      });
    } finally {
      await closeServer(redirectServer.server);
    }
  });

  test("a Cache Miss redirects and caches the Original URL for 24 hours", async () => {
    const created = await createUrl("https://example.com/cache-miss");
    await redis.del(`short-url:${created.body.code}`);
    const redirectServer = await listen(createRedirectApp());

    try {
      const response = await fetch(
        `${redirectServer.baseUrl}/${created.body.code}`,
        { redirect: "manual" },
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(created.body.originalUrl);
      expect(await redis.get(`short-url:${created.body.code}`)).toBe(
        created.body.originalUrl,
      );

      const ttl = await redis.ttl(`short-url:${created.body.code}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(24 * 60 * 60);
    } finally {
      await closeServer(redirectServer.server);
    }
  });

  test("a Cache Hit redirects without a PostgreSQL lookup", async () => {
    const code = "CACHED1";
    const originalUrl = "https://example.com/cache-hit";
    await redis.set(`short-url:${code}`, originalUrl);
    const unavailableStore = {
      findOriginalUrl: async (): Promise<string | undefined> => {
        throw new Error("PostgreSQL lookup should not run on a Cache Hit");
      },
    };
    const redirectServer = await listen(createRedirectApp(unavailableStore));

    try {
      const response = await fetch(`${redirectServer.baseUrl}/${code}`, {
        redirect: "manual",
      });

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(originalUrl);
    } finally {
      await closeServer(redirectServer.server);
    }
  });

  test("reports PostgreSQL and Redis dependency health", async () => {
    const redirectServer = await listen(createRedirectApp());

    try {
      const response = await fetch(`${redirectServer.baseUrl}/health`);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        status: "ok",
        postgres: "up",
        redis: "up",
      });
    } finally {
      await closeServer(redirectServer.server);
    }
  });

  test("redirects a stored Short Code to its Original URL", async () => {
    const created = await createUrl(
      "https://EXAMPLE.com:443/redirect-target",
    );
    const redirectServer = await listen(createRedirectApp());

    try {
      const response = await fetch(
        `${redirectServer.baseUrl}/${created.body.code}`,
        { redirect: "manual" },
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        "https://example.com/redirect-target",
      );
    } finally {
      await closeServer(redirectServer.server);
    }
  });

  test("returns structured 404 for an unknown Short Code", async () => {
    const redirectServer = await listen(createRedirectApp());

    try {
      const response = await fetch(`${redirectServer.baseUrl}/Unknown`, {
        redirect: "manual",
      });

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: {
          code: "SHORT_URL_NOT_FOUND",
          message: "Short URL not found.",
        },
      });
    } finally {
      await closeServer(redirectServer.server);
    }
  });

  test("caches an unknown Short Code as missing for 60 seconds", async () => {
    const code = "MISSING";
    const redirectServer = await listen(createRedirectApp());

    try {
      const response = await fetch(`${redirectServer.baseUrl}/${code}`);

      expect(response.status).toBe(404);
      expect(await redis.get(`short-url:${code}`)).toBe(
        "__SHORT_URL_NOT_FOUND__",
      );

      const ttl = await redis.ttl(`short-url:${code}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60);
    } finally {
      await closeServer(redirectServer.server);
    }
  });

  test("a negative Cache Hit returns 404 without a PostgreSQL lookup", async () => {
    const code = "MISSING";
    await redis.set(`short-url:${code}`, "__SHORT_URL_NOT_FOUND__", { EX: 60 });
    const unavailableStore = {
      findOriginalUrl: async (): Promise<string | undefined> => {
        throw new Error("PostgreSQL lookup should not run on a negative Cache Hit");
      },
    };
    const redirectServer = await listen(createRedirectApp(unavailableStore));

    try {
      const response = await fetch(`${redirectServer.baseUrl}/${code}`, {
        redirect: "manual",
      });

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: {
          code: "SHORT_URL_NOT_FOUND",
          message: "Short URL not found.",
        },
      });
    } finally {
      await closeServer(redirectServer.server);
    }
  });

  test("returns 503 when an uncached lookup cannot reach PostgreSQL", async () => {
    const unavailableStore = {
      findOriginalUrl: async (): Promise<string | undefined> => {
        throw new Error("PostgreSQL lookup failed");
      },
    };
    const emptyCache = {
      lookup: async () => ({ kind: "absent" as const }),
      storeOriginalUrl: async (): Promise<void> => undefined,
      storeMissing: async (): Promise<void> => undefined,
    };
    const redirectServer = await listen(
      createRedirectApp(unavailableStore, emptyCache),
    );

    try {
      const response = await fetch(`${redirectServer.baseUrl}/Unknown`);

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: {
          code: "REDIRECT_UNAVAILABLE",
          message: "Unable to resolve the short URL right now.",
        },
      });
    } finally {
      await closeServer(redirectServer.server);
    }
  });

  test("rejects a wrong-length Short Code without dependency lookup", async () => {
    const unavailableStore = {
      findOriginalUrl: async (): Promise<string | undefined> => {
        throw new Error("PostgreSQL lookup should not run");
      },
    };
    const unavailableCache = {
      lookup: async () => {
        throw new Error("Redis lookup should not run");
      },
      storeOriginalUrl: async (): Promise<void> => {
        throw new Error("Redis write should not run");
      },
      storeMissing: async (): Promise<void> => {
        throw new Error("Redis write should not run");
      },
    };
    const redirectServer = await listen(
      createRedirectApp(unavailableStore, unavailableCache),
    );

    try {
      const response = await fetch(`${redirectServer.baseUrl}/Short1`);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: {
          code: "SHORT_URL_NOT_FOUND",
          message: "Short URL not found.",
        },
      });
    } finally {
      await closeServer(redirectServer.server);
    }
  });

  test("rejects a non-Base62 Short Code without dependency lookup", async () => {
    const unavailableStore = {
      findOriginalUrl: async (): Promise<string | undefined> => {
        throw new Error("PostgreSQL lookup should not run");
      },
    };
    const unavailableCache = {
      lookup: async () => {
        throw new Error("Redis lookup should not run");
      },
      storeOriginalUrl: async (): Promise<void> => {
        throw new Error("Redis write should not run");
      },
      storeMissing: async (): Promise<void> => {
        throw new Error("Redis write should not run");
      },
    };
    const redirectServer = await listen(
      createRedirectApp(unavailableStore, unavailableCache),
    );

    try {
      const response = await fetch(`${redirectServer.baseUrl}/BAD-CDE`);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: {
          code: "SHORT_URL_NOT_FOUND",
          message: "Short URL not found.",
        },
      });
    } finally {
      await closeServer(redirectServer.server);
    }
  });

  test("returns redirect metadata without a body for HEAD", async () => {
    const originalUrl = "https://example.com/head-target";
    const created = await createUrl(originalUrl);
    const redirectServer = await listen(createRedirectApp());

    try {
      const response = await fetch(
        `${redirectServer.baseUrl}/${created.body.code}`,
        { method: "HEAD", redirect: "manual" },
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(originalUrl);
      expect(await response.text()).toBe("");
    } finally {
      await closeServer(redirectServer.server);
    }
  });

  test("returns 405 and allowed methods for an unsupported method", async () => {
    const redirectServer = await listen(createRedirectApp());

    try {
      const response = await fetch(`${redirectServer.baseUrl}/Unknown`, {
        method: "POST",
      });

      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD");
    } finally {
      await closeServer(redirectServer.server);
    }
  });
});

test("an already-applied migration is safely skipped", async () => {
  await runMigrations(postgres);
  await runMigrations(postgres);

  const applied = await postgres.query(
    `SELECT version, COUNT(*)::int AS count
     FROM schema_migrations
     GROUP BY version
     ORDER BY version`,
  );

  expect(applied.rows).toEqual([
    { version: "001_create_urls.sql", count: 1 },
    { version: "002_unique_normalized_url.sql", count: 1 },
    { version: "003_remove_unused_url_id.sql", count: 1 },
  ]);
});

test("dependency lifecycle tolerates Redis never connecting", async () => {
  let postgresEnded = false;
  let redisQuitCalled = false;
  const lifecycle = createDependencyLifecycle(
    {
      query: async () => ({ rows: [] }),
      end: async () => {
        postgresEnded = true;
      },
    },
    {
      isOpen: false,
      connect: async () => {
        throw new Error("Redis unavailable");
      },
      quit: async () => {
        redisQuitCalled = true;
      },
    },
    () => undefined,
  );

  await expect(lifecycle.start()).resolves.toBeUndefined();
  await expect(lifecycle.stop()).resolves.toBeUndefined();
  expect(postgresEnded).toBe(true);
  expect(redisQuitCalled).toBe(false);
});
