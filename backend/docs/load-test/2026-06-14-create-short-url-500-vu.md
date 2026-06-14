# Load Test Record — 500 VU (URL Creation)

**Date:** June 14, 2026
**Endpoint tested:** `POST /urls` (URL creation only)

---

## Test Profile
- Ramp: 0 → 500 VUs over 30s
- Hold: 500 VUs for 60s
- Ramp down: 15s

---

## First Run — FAILED ❌

| Metric | Value |
|---|---|
| Throughput | ~401 req/sec |
| p95 latency | 540ms |
| Failed requests | **6.96%** (threshold <1%) |
| Checks passed | **93%** (threshold >99%) |

**Error**: `connection reset by peer` — Nginx dropped connections above ~450 concurrent.

**Root cause**: Nginx default worker connection limit was **512**, open-file limit **1,024** — not enough for 500 VUs hitting simultaneously.

---

## Fix Applied

| Setting | Before | After |
|---|---|---|
| Worker connections | 512 | 4,096 |
| Open-file limit | 1,024 | 8,192 |
| Worker processes | 1 | auto |

---

## Second Run — PASSED ✅

| Metric | Value |
|---|---|
| Nginx connections | Hit ~500, no drops |
| p95 latency | ~125ms (improved) |
| Failed requests | 0% |
| PostgreSQL connections | Stable ~13 |
| Redis memory | Grew to ~12 MiB |

**Verdict**: Nginx fix confirmed. 500 VUs handled cleanly.

---

## Key Insight
Increasing Nginx limits is a short-term fix — not infinitely scalable. Real solution at higher scale: horizontal scaling (multiple backend instances) + cloud load balancer (AWS ALB, Cloudflare) in front of Nginx.

---

## Next
Push to 1,000 VU → find next bottleneck (likely Postgres connection pool or DB counter write contention).
