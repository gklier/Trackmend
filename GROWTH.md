# GROWTH.md

Only verified facts. No traffic data exists yet (no analytics enabled, no Search Console).

## Where the first 100 visitors are expected to come from
Search, at the moment of the problem. Evidence that the queries exist: dozens of Garmin forum threads titled
"corrupt FIT file", "merge two activities", "file already uploaded" (see RESEARCH.md). Each guide and tool page
targets one of those phrasings.

## Done (free, no accounts)
| Date | Action | Result |
|---|---|---|
| 2026-11-12 | On-page SEO: titles, descriptions, canonical URLs, sitemap, schema.org WebApplication markup | Live |
| 2026-11-13 | IndexNow submission of all 14 URLs (key hosted at the site root) | HTTP 202 accepted. Covers Bing, Yandex, Seznam, Naver. |
| 2026-11-13 | Public GitHub repository with descriptive README | Discoverable by code search; one inbound link |
| 2026-11-13 | Six problem-specific guides | Live |

## Needs the owner (each is a one-time action)
1. Google Search Console: verify the site, submit `https://trackmend.pages.dev/sitemap-index.xml`. Google has no
   account-free submission route; without this, Google indexing waits for inbound links.
2. Cloudflare Web Analytics: enable on the Pages project, set `PUBLIC_CF_ANALYTICS_TOKEN`. Cookieless; the privacy
   page already describes it.
3. Optional listings (require accounts): AlternativeTo (alternative to FIT File Tools / GOTOES), Product Hunt.
   Not spam, one listing each. Text can be drafted on request.

## Not done, deliberately
- No forum posts or Reddit replies. They need accounts and read as spam when a new site posts them. If the owner
  wants to answer a thread personally, link the specific guide that matches the question.

## Decision rules
- 90 days after Google indexing, under 300 visits/month → distribution problem; review queries and titles before
  features.
- Visits but no batch purchases → revisit the offer (price, what is gated).
- Demand clearly absent after two distribution fixes → stop; next candidate is in RESEARCH.md.

## Experiments
None yet.
