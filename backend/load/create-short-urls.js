import http from "k6/http";
import { check, sleep } from "k6";

const baseUrl = (__ENV.BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const expectedShortUrlBase = (
  __ENV.EXPECTED_SHORT_URL_BASE || baseUrl
).replace(/\/$/, "");
const vus = Number.parseInt(__ENV.VUS || "100", 10);
const rampUp = __ENV.RAMP_UP || "30s";
const hold = __ENV.HOLD || "60s";
const rampDown = __ENV.RAMP_DOWN || "15s";
const sleepSeconds = Number.parseFloat(__ENV.SLEEP_SECONDS || "1");
const runId = (__ENV.RUN_ID || `run-${Date.now()}`).replace(/[^0-9A-Za-z-]/g, "-");

if (!Number.isInteger(vus) || vus < 1) {
  throw new Error("VUS must be a positive integer");
}

if (!Number.isFinite(sleepSeconds) || sleepSeconds < 0) {
  throw new Error("SLEEP_SECONDS must be a non-negative number");
}

export const options = {
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

export default function () {
  const originalUrl =
    `https://load-test.example.com/${runId}/vu-${__VU}/iteration-${__ITER}`;
  const response = http.post(
    `${baseUrl}/urls`,
    JSON.stringify({ url: originalUrl }),
    {
      headers: { "Content-Type": "application/json" },
      tags: { endpoint: "create-short-url" },
    },
  );

  let body;
  try {
    body = response.json();
  } catch {
    body = null;
  }

  if (response.status !== 201 && __ITER === 0) {
    console.error(
      `POST ${baseUrl}/urls failed with ${response.status}: ${response.body}`,
    );
  }

  check(response, {
    "creation returns 201": (result) => result.status === 201,
    "response has a seven-character code": () =>
      typeof body?.code === "string" && /^[0-9A-Za-z]{7}$/.test(body.code),
    "response contains the original URL": () => body?.originalUrl === originalUrl,
    "response contains the generated short URL": () =>
      typeof body?.shortUrl === "string"
      && typeof body?.code === "string"
      && body.shortUrl === `${expectedShortUrlBase}/${body.code}`,
  });

  sleep(sleepSeconds);
}
