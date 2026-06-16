# Load Test Records

Measured load-test results for Shortly. Each record documents the tested
endpoint, workload profile, observed application performance, and
infrastructure behavior.

- [100 VU URL creation — June 14, 2026](./2026-06-14-create-short-url-100-vu.md)
- [500 VU URL creation — June 14, 2026](./2026-06-14-create-short-url-500-vu.md)
- [1000 VU URL creation — June 14, 2026](./2026-06-14-create-short-url-1000-vu.md)
- [500 VU hot-cache redirect — June 16, 2026](./2026-06-16-redirect-hot-cache-500-vu.md)
- [Post draft: 500 VU hot-cache redirect — June 16, 2026](./2026-06-16-redirect-hot-cache-500-vu-post.md)
- [1000 VU hot-cache redirect — June 16, 2026](./2026-06-16-redirect-hot-cache-1000-vu.md)
- [Post draft: 1000 VU hot-cache redirect — June 16, 2026](./2026-06-16-redirect-hot-cache-1000-vu-post.md)

Run a hot-cache redirect load test with:

```sh
VUS=500 RAMP_UP=30s HOLD=60s RAMP_DOWN=15s bun run load:redirect
```

The redirect test seeds `SEED_URL_COUNT` short URLs, warms Redis with one
manual redirect per code, then measures only Shortly's `302` response by
disabling external redirect following.

After recording a completed load test, clean its generated data with:

```sh
bun run load:clean
```

This removes only URLs generated under `https://load-test.example.com/` and
their matching Redis cache entries.
