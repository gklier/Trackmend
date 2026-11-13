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

| Alternative | Its weakness (see RESEARCH.md for sources) | Our answer |
|---|---|---|
| Paid desktop repair tool (about EUR 39) | Price is high for a one-off; Windows only | Free, any browser |
| GOTOES and similar | Uploads the file to a server; size caps unless you donate | No upload, no cap |
| Asking strangers on forums to fix the file | Slow; hands location data to a stranger | Instant and private |
| A chat assistant | Cannot read or write a binary file | Does the actual transformation |

A free in-browser repair tool already exists elsewhere. Our edge is not exclusivity; it is a complete, honest
toolbox (repair + join + convert), clear explanations of what was found and done, and a verifiable privacy
claim (a Content-Security-Policy that blocks the pages from connecting anywhere else).

## Revenue model

Nothing is earning yet.

1. **Batch licence, one-time, suggested $9** (built, dormant until the owner creates the Lemon Squeezy product; see
   PRODUCT.md). Lemon Squeezy is merchant of record (5% + $0.50 per sale, handles tax), so delivery, invoicing and
   refunds need no owner work. Rationale: the comparable desktop repair tool sells at about €39 and users complain
   about paying it for one file; a cheap one-time unlock for "many files" fits that complaint.
2. **Support link** (`PUBLIC_SUPPORT_URL`), dormant until set. Two established competitors run on donations alone.
3. **Display ads** only after traffic exists and only outside the tool panels.

Rough arithmetic, not a forecast: $100/month is about 13 licence sales at $9 after fees. Whether that is reachable is
unknown until there is traffic data.

## Costs

Hosting on Cloudflare Pages free tier: $0. No server, database, paid API or AI inference in operation.
A custom domain (about $10 to $12 a year) is optional and needs owner approval.

## Risks

- Search demand is unmeasured. This is the main risk.
- A platform (Strava, Garmin) could add native merge/repair.
- Uploads of our output to Garmin Connect and Strava have not been tested by anyone yet. Structural validity is
  proven by tests, and on three forum cases our output matches files Garmin accepted; direct acceptance is not proven.
- The site name may conflict with an existing trademark; not checked. Owner must clear the final name.
