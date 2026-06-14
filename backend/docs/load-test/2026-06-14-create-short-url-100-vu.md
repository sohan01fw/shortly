# Load Test Record — 100 VU URL Creation

**Date:** June 14, 2026  
**Endpoint tested:** `POST /urls` (URL creation only)

## Test Profile

- Ramp: 0 to 100 VUs over 30 seconds
- Hold: 100 VUs for 60 seconds
- Ramp down: 15 seconds

## Results

| Metric | Value |
|---|---:|
| Total requests | 8,209 |
| Throughput | ~77 requests/second |
| p95 latency | 26.48 ms |
| Failed requests | 0% |
| Checks passed | 100% (32,836/32,836) |

## Infrastructure at Peak

| Component | Observation |
|---|---|
| PostgreSQL connections | Spiked to approximately 14 and remained healthy |
| Redis memory | Grew to approximately 2.5 MiB from cache warming |
| Nginx connections | Approximately 100, matching the VU count |
| Errors | None observed |

## Verdict

No bottleneck was observed at 100 VUs. The system sustained approximately 77
URL creation requests per second with no failures and a p95 latency of 26.48
ms.

Maintaining 77 requests per second continuously would equal approximately 6.65
million requests per day. This is a mathematical extrapolation from the test,
not a production capacity guarantee; the test held peak load for only 60
seconds and did not measure long-term database growth or operational limits.

## Next Test

Run a 500-VU URL creation test to identify the next scaling limit or the
system's breaking point.
