import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { Server } from "node:http";

process.env.DATABASE_URL ??= "postgres://shortly:shortly@localhost:5432/shortly";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.SHORT_URL_BASE_URL = "http://localhost:5000";

const { app, createApp } = await import("../src/app");
const { postgres } = await import("../src/dependencies");
const { runMigrations } = await import("../src/database/migrations");

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
  await runMigrations(postgres);
  const listening = await listen(app);
  server = listening.server;
  baseUrl = listening.baseUrl;
});

beforeEach(async () => {
  await postgres.query("TRUNCATE urls RESTART IDENTITY");
});

afterAll(async () => {
  if (server) {
    await closeServer(server);
  }
  await postgres.end();
});

describe("POST /urls", () => {
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
        "SELECT short_code, original_url, normalized_url FROM urls ORDER BY id",
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
        "SELECT short_code, original_url, normalized_url FROM urls ORDER BY id",
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
  ]);
});
