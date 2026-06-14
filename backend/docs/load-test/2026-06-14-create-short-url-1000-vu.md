# Load Test Record — 1000 VU (URL Creation)

**Date:** June 14, 2026
**Endpoint tested:** `POST /urls` (URL creation only)

---

## Test Profile
- Ramp: 0 → 1000 VUs over 30s
- Hold: 1000 VUs for 60s
- Ramp down: 15s

---

## First Run — FAILED ❌

| Metric | Value |
|---|---|
| Throughput | ~548 req/sec |
| p95 latency | **1.17s** (crossed 1000ms threshold) |
| Failed requests | **22.23%** |
| Checks passed | **77.76%** |
| CPU peak | **300%** (Nginx) |

**Errors**: system oscillating — choking, recovering, choking again. Unstable under load.

**Assumed root cause (wrong)**: DB auto-increment counter write contention → Redis INCR needed.

**Actual root causes (data-driven):**
- Nginx opening new TCP connection per request → 272% CPU
- DB connection pool too small (10 connections for 1000 VUs)
- Unnecessary `SELECT` before every `INSERT` (extra DB round trip)

---

## Fixes Applied

| Fix | Before | After |
|---|---|---|
| Nginx upstream connection reuse | New TCP per request | Keepalive connections |
| DB connection pool | 10 | 30 |
| Pre-insert SELECT | Present | Removed |
| Unused DB sequence/index | Present | Removed |

---

## Second Run — PASSED ✅

| Metric | Value |
|---|---|
| Throughput | **763 req/sec** |
| p95 latency | **109ms** (was 1.17s — 10x improvement) |
| Failed requests | **0%** |
| Checks passed | **100%** (323,104/323,104) |
| CPU peak | ~60% (stable) |

---

## Key Lesson
Assumed the bottleneck was the DB counter — data showed it was Nginx TCP overhead and pool starvation. Always fix what the data shows, not what you assumed.

---

## Next
Load test redirect path (`GET /:code`) — find bottleneck there.
