# Load Test Record — 500 VU Hot-Cache Redirect

**Date:** June 16, 2026  
**Endpoint tested:** `GET /:code` (redirect path only)  
**Workload:** Hot-cache redirects through Redis

## Test Profile

- Ramp: 0 to 500 VUs over 30 seconds
- Hold: 500 VUs for 60 seconds
- Ramp down: 15 seconds
- Seeded short URLs before the measured run
- Warmed Redis with one manual redirect per seeded Short Code
- Disabled external redirect following so k6 measured Shortly's `302` response

## Results

| Metric | Value |
|---|---:|
| Throughput | ~400 requests/second |
| p95 latency | 3.39 ms |
| Failed requests | 0% |
| Checks passed | 100% |
| CPU at peak | Under 50% |

## Infrastructure at Peak

| Component | Observation |
|---|---|
| Redis | Served the redirect workload from cache |
| PostgreSQL connections | Only 4 active connections observed |
| Redirect service | Stable under 500 VUs |
| Errors | None observed |

## Interpretation

Redis absorbed almost all redirect traffic. PostgreSQL was barely involved
during the measured hot-cache run, which is the expected behavior for the
redirect path after cache warming.

This is a much faster path than URL creation. The earlier 1000 VU creation
test needed a larger PostgreSQL pool and reached 109 ms p95 latency. This 500
VU redirect test reached 3.39 ms p95 latency while using only 4 PostgreSQL
connections.

## Verdict

The hot-cache redirect path is healthy at 500 VUs. Redis is doing its job:
serving known Short Codes quickly and keeping redirect traffic away from
PostgreSQL.

## Next Test

Run a cold-cache redirect test by clearing Redis before the workload. That will
measure the PostgreSQL fallback path and show how quickly the cache repopulates
under redirect traffic.
