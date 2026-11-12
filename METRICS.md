# METRICS.md

Only verified numbers go here. The site went live at https://trackmend.pages.dev on 2026-11-12. No traffic data exists yet.

| Metric | Value | Source |
|---|---|---|
| Visitors | not measured (analytics not enabled) | n/a |
| Search impressions | not measured (Search Console not connected) | n/a |
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

- Live deployment: 33 of 33 browser checks pass against https://trackmend.pages.dev, including security headers, sitemap and canonical links.

- 25 unit tests pass in CI configuration; 61 pass when the 9 real Garmin recordings are supplied via `SAMPLES_DIR`.
- 33 browser checks pass (`npm run e2e`): every tool flow, error paths, keyboard reachability,
  no overflow at 360 px, no console errors, zero requests leaving the site's origin.
- Built site: 12 pages, about 220 KB total, 27 KB of JavaScript.
