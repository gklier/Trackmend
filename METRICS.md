# METRICS.md

Only verified numbers go here. As of 2026-11-12 the site is not deployed, so there are none.

| Metric | Value | Source |
|---|---|---|
| Visitors | none (not deployed) | n/a |
| Search impressions | none | n/a |
| Tool runs | not measured (no analytics configured) | n/a |
| Revenue | $0.00 | n/a |

## What to measure once live

1. Search Console: impressions and clicks per page, queries that bring visitors.
2. Cloudflare Web Analytics: visits per page, referrers.
3. After that: tool completions (needs a privacy-safe counter; not built).

## Decision rules

- 90 days after indexing, fewer than 300 visits/month: the problem is distribution. Review queries and titles
  before adding features.
- Traffic but no interest in a paid pack or ads: revisit the offer, or accept this as a small ad-supported asset.
- If demand is clearly absent after two distribution fixes, stop and start the runner-up in OPPORTUNITIES.md.

## Experiments

None run yet.

## Quality evidence (2026-11-12)

- 25 unit tests pass in CI configuration; 61 pass when the 9 real Garmin recordings are supplied via `SAMPLES_DIR`.
- 33 browser checks pass (`npm run e2e`): every tool flow, error paths, keyboard reachability,
  no overflow at 360 px, no console errors, zero requests leaving the site's origin.
- Built site: 12 pages, about 220 KB total, 27 KB of JavaScript.
