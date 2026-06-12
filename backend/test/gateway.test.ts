import { expect, test } from "bun:test";

const gatewayBaseUrl = process.env.GATEWAY_BASE_URL;
const gatewayTest = gatewayBaseUrl ? test : test.skip;

gatewayTest("creates a Short URL through the public gateway", async () => {
  const originalUrl = `https://example.com/gateway-${crypto.randomUUID()}`;
  const response = await fetch(`${gatewayBaseUrl}/urls`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: originalUrl }),
  });

  expect(response.status).toBe(201);
  const body = (await response.json()) as {
    code: string;
    shortUrl: string;
    originalUrl: string;
  };
  expect(body).toEqual({
    code: expect.stringMatching(/^[0-9A-Za-z]{7}$/),
    shortUrl: `http://localhost:5000/${body.code}`,
    originalUrl,
  });

  const redirectResponse = await fetch(body.shortUrl, { redirect: "manual" });
  expect(redirectResponse.status).toBe(302);
  expect(redirectResponse.headers.get("location")).toBe(originalUrl);

  const headResponse = await fetch(body.shortUrl, {
    method: "HEAD",
    redirect: "manual",
  });
  expect(headResponse.status).toBe(302);
  expect(headResponse.headers.get("location")).toBe(originalUrl);
  expect(await headResponse.text()).toBe("");
});

gatewayTest("exposes gateway and upstream health separately", async () => {
  const [gateway, creation, redirect] = await Promise.all([
    fetch(`${gatewayBaseUrl}/health`),
    fetch(`${gatewayBaseUrl}/health/creation`),
    fetch(`${gatewayBaseUrl}/health/redirect`),
  ]);

  expect(gateway.status).toBe(200);
  expect(await gateway.json()).toEqual({ status: "ok" });
  expect(creation.status).toBe(200);
  expect(await creation.json()).toEqual({
    status: "ok",
    postgres: "up",
    redis: "up",
  });
  expect(redirect.status).toBe(200);
  expect(await redirect.json()).toEqual({
    status: "ok",
    postgres: "up",
    redis: "up",
  });
});

gatewayTest("preserves Redirect Server method handling", async () => {
  const response = await fetch(`${gatewayBaseUrl}/Unknown`, {
    method: "POST",
  });

  expect(response.status).toBe(405);
  expect(response.headers.get("allow")).toBe("GET, HEAD");
});

gatewayTest("routes only POST requests to the Creation Server", async () => {
  const response = await fetch(`${gatewayBaseUrl}/urls`);

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({
    error: {
      code: "SHORT_URL_NOT_FOUND",
      message: "Short URL not found.",
    },
  });
});
