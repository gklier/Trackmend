# BUSINESS.md

Working name: **Trackmend** (temporary; final name and domain are the owner's decision).

## What it is

A static website with four browser-only tools for sports activity files:
repair a damaged FIT file, join split activities (FIT or GPX), FIT to GPX, GPX to FIT.
Files are processed on the visitor's device and never uploaded.

## Who it is for

Runners and cyclists using Garmin, Wahoo, Coros and Strava who have one of three problems:
a recording that will not upload, one outing split into two recordings, or a file in the wrong format.
They arrive from search at the moment of the problem, use the tool once, and leave.

## Why someone would pick it

| Alternative | Its weakness (see OPPORTUNITIES.md for sources) | Our answer |
|---|---|---|
| Paid desktop repair tool (about EUR 39) | Price is high for a one-off; Windows only | Free, any browser |
| GOTOES and similar | Uploads the file to a server; size caps unless you donate | No upload, no cap |
| Asking strangers on forums to fix the file | Slow; hands location data to a stranger | Instant and private |
| A chat assistant | Cannot read or write a binary file | Does the actual transformation |

A free in-browser repair tool already exists elsewhere. Our edge is not exclusivity; it is a complete, honest
toolbox (repair + join + convert), clear explanations of what was found and done, and a verifiable privacy
claim (a Content-Security-Policy that blocks the pages from connecting anywhere else).

## Revenue model, in stages

Nothing here is earning yet. Each stage starts only when the previous one shows evidence.

1. **Now: free, measure demand.** Cost $0. Goal is indexed pages and real visitors.
2. **Display ads on guide pages and below tool results** once traffic justifies an application
   (AdSense first; premium networks have traffic minimums that research could not confirm).
   Needs the owner's ad account. No ads inside the tool panel, no interstitials.
3. **One-time paid "batch" pack ($5 to $9)** for people with many files: batch repair/convert, e.g. a whole
   Strava account export. Sold through a merchant of record with no monthly fee, delivered automatically.
   Build only if stage 1 shows people returning or processing several files in a row.
4. **Optional support link.** Already wired in (`PUBLIC_SUPPORT_URL`), hidden until the owner sets one.

Rough arithmetic, not a forecast: $100/month needs roughly 15 pack sales at $7, or ad income from a few
tens of thousands of monthly page views. Which is reachable is unknown until there is traffic data.

## Costs

Hosting on Cloudflare Pages free tier: $0. No server, database, paid API or AI inference in operation.
A custom domain (about $10 to $12 a year) is optional and needs owner approval.

## Risks

- Search demand is unmeasured. This is the main risk.
- A platform (Strava, Garmin) could add native merge/repair.
- Uploads of our output to Garmin Connect and Strava have not been tested by anyone yet. Structural
  validity is proven by tests; platform acceptance is not.
- The site name may conflict with an existing trademark; not checked. Owner must clear the final name.
