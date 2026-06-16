# Load Test Record — 1000 VU Hot-Cache Redirect

**Date:** June 16, 2026  
**Endpoint tested:** `GET /:code` (redirect path only)  
**Workload:** Hot-cache redirects through Redis

## Test Profile

- Ramp: 0 to 1000 VUs over 30 seconds
- Hold: 1000 VUs for 60 seconds
- Ramp down: 15 seconds
- Seeded short URLs before the measured run
- Warmed Redis with one manual redirect per seeded Short Code
- Disabled external redirect following so k6 measured Shortly's `302` response

## Results

| Metric | Value |
|---|---:|
| Total checks | 175,654/175,654 |
| Throughput | 788 requests/second |
| p95 latency | 3.46 ms |
| Failed requests | 0% |
| Checks passed | 100% |
| CPU at peak | Under 40% |

## Infrastructure at Peak

| Component | Observation |
|---|---|
| Redis | Served the redirect workload from cache |
| PostgreSQL connections | Only 4 active connections observed |
| Redirect service | Stable under 1000 VUs |
| Errors | None observed |

## Interpretation

Redis handled the increased redirect load without meaningful latency movement.
The 500 VU hot-cache redirect test had 3.39 ms p95 latency; this 1000 VU run
landed at 3.46 ms p95 latency. Throughput nearly doubled while PostgreSQL
connections stayed at only 4.

The redirect path is behaving as designed: known Short Codes are served from
Redis, and PostgreSQL stays out of the hot request path.

## Verdict

The hot-cache redirect path is healthy at 1000 VUs. Redis absorbed the load,
the application returned clean `302` responses, and the system had 0% failures.

## Next Test

Run a higher hot-cache test or switch to a cold-cache redirect test to measure
PostgreSQL fallback behavior and cache repopulation under load.
