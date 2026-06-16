# Post Draft — 1000 VU Redirect Load Test

Redis is carrying Shortly's redirect path beautifully.

After the 500 VU hot-cache redirect test passed, I pushed the same workload to
1000 VUs. The test pre-created Short URLs, warmed Redis, then measured only
Shortly's `302` response from `GET /:code`.

The result:

- 100% checks passed: 175,654/175,654
- 0% request failures
- p95 latency: 3.46 ms
- Throughput: 788 requests/second
- PostgreSQL connections: only 4
- CPU stayed under 40%

The best part: latency barely moved. At 500 VUs, p95 was 3.39 ms. At 1000 VUs,
p95 was 3.46 ms. That is the cache doing exactly what it is supposed to do.

The database stayed almost untouched because Redis served the hot redirect
traffic. For known Short Codes, redirect performance is now clearly dominated
by the cache path, not PostgreSQL.

Next, I want to test cold-cache redirects to see how the system behaves when
traffic has to fall back to PostgreSQL and repopulate Redis under load.
