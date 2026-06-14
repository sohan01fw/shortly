# Load Test Records

Measured load-test results for Shortly. Each record documents the tested
endpoint, workload profile, observed application performance, and
infrastructure behavior.

- [100 VU URL creation — June 14, 2026](./2026-06-14-create-short-url-100-vu.md)
- [500 VU URL creation — June 14, 2026](./2026-06-14-create-short-url-500-vu.md)

After recording a completed creation load test, clean its generated data with:

```sh
bun run load:clean
```

This removes only URLs generated under `https://load-test.example.com/` and
their matching Redis cache entries.
