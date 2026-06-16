# Post Draft — 500 VU Redirect Load Test

Redis is doing exactly what we wanted for Shortly's redirect path.

I ran a 500 VU hot-cache redirect load test against `GET /:code`. The test
pre-created Short URLs, warmed Redis, then measured only Shortly's `302`
redirect response without following the external destination.

The result:

- 100% checks passed
- 0% request failures
- p95 latency: 3.39 ms
- Throughput: about 400 requests/second
- PostgreSQL connections: only 4
- CPU stayed under 50%

The interesting part is the contrast with URL creation. Creation at 1000 VUs
needed a larger PostgreSQL pool and landed at 109 ms p95 latency. Redirect at
500 VUs barely touched PostgreSQL and landed at 3.39 ms p95 latency.

That tells the story clearly: Redis is absorbing almost all hot redirect
traffic, and the database is staying out of the critical path.

Next, I want to test the cold-cache redirect path to measure PostgreSQL
fallback behavior and cache repopulation under load.
