import http from "k6/http";
import { check, sleep } from "k6";

const baseUrl = (__ENV.BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const vus = Number.parseInt(__ENV.VUS || "500", 10);
const seedUrlCount = Number.parseInt(__ENV.SEED_URL_COUNT || "1000", 10);
const rampUp = __ENV.RAMP_UP || "30s";
const hold = __ENV.HOLD || "60s";
const rampDown = __ENV.RAMP_DOWN || "15s";
const sleepSeconds = Number.parseFloat(__ENV.SLEEP_SECONDS || "1");
const setupTimeout = __ENV.SETUP_TIMEOUT || "5m";
const runId = (__ENV.RUN_ID || `run-${Date.now()}`).replace(/[^0-9A-Za-z-]/g, "-");

if (!Number.isInteger(vus) || vus < 1) {
  throw new Error("VUS must be a positive integer");
}

if (!Number.isInteger(seedUrlCount) || seedUrlCount < 1) {
  throw new Error("SEED_URL_COUNT must be a positive integer");
}

if (!Number.isFinite(sleepSeconds) || sleepSeconds < 0) {
  throw new Error("SLEEP_SECONDS must be a non-negative number");
}

export const options = {
  setupTimeout,
  stages: [
    { duration: rampUp, target: vus },
    { duration: hold, target: vus },
    { duration: rampDown, target: 0 },
  ],
  thresholds: {
    checks: ["rate>0.99"],
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1000"],
  },
};

export function setup() {
  const seededUrls = [];

  for (let index = 0; index < seedUrlCount; index += 1) {
    const originalUrl =
      `https://load-test.example.com/${runId}/redirect/${index}`;
    const createResponse = http.post(
      `${baseUrl}/urls`,
      JSON.stringify({ url: originalUrl }),
      {
        headers: { "Content-Type": "application/json" },
        tags: { endpoint: "redirect-seed-create" },
      },
    );

    let body;
    try {
      body = createResponse.json();
    } catch {
      body = null;
    }

    const created = check(createResponse, {
      "seed creation returns 201 or 200": (result) =>
        result.status === 201 || result.status === 200,
      "seed response has a seven-character code": () =>
        typeof body?.code === "string" && /^[0-9A-Za-z]{7}$/.test(body.code),
      "seed response contains original URL": () =>
        body?.originalUrl === originalUrl,
    });

    if (!created) {
      throw new Error(
        `Unable to seed redirect URL ${index}: ${createResponse.status} ${createResponse.body}`,
      );
    }

    seededUrls.push({
      code: body.code,
      originalUrl,
    });
  }

  for (const seededUrl of seededUrls) {
    const warmResponse = http.get(`${baseUrl}/${seededUrl.code}`, {
      redirects: 0,
      tags: { endpoint: "redirect-cache-warmup" },
    });

    const warmed = check(warmResponse, {
      "warmup redirect returns 302": (result) => result.status === 302,
      "warmup location matches original URL": (result) =>
        result.headers.Location === seededUrl.originalUrl,
    });

    if (!warmed) {
      throw new Error(
        `Unable to warm redirect ${seededUrl.code}: ${warmResponse.status} ${warmResponse.body}`,
      );
    }
  }

  return seededUrls;
}

export default function (seededUrls) {
  const seededUrl = seededUrls[(__VU + __ITER) % seededUrls.length];
  const response = http.get(`${baseUrl}/${seededUrl.code}`, {
    redirects: 0,
    tags: { endpoint: "redirect-hot-cache" },
  });

  if (response.status !== 302 && __ITER === 0) {
    console.error(
      `GET ${baseUrl}/${seededUrl.code} failed with ${response.status}: ${response.body}`,
    );
  }

  check(response, {
    "redirect returns 302": (result) => result.status === 302,
    "redirect location matches original URL": (result) =>
      result.headers.Location === seededUrl.originalUrl,
  });

  sleep(sleepSeconds);
}
