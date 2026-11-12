# OPPORTUNITIES.md

Research run: 2026-11-12. Three delegated research briefs plus orchestrator verification of the finalists.

**Read this first:** the research agents could not access keyword-volume tools, and two of the three could not
open pages directly. Search volumes are therefore unknown for every candidate. Nothing below supports a
$1,000/month outcome with verified evidence. Figures are marked VERIFIED (primary page fetched) or ESTIMATE.

## Scoring

Weights: paying demand 25, low owner involvement 20, low cost 15, differentiation 15, acquisition 15, scalability 10.
Each criterion scored 1–5; total is the weighted average (max 5).

| # | Opportunity | Pay | Owner | Cost | Diff | Acq | Scale | Total | Verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | Browser-only activity file tools (FIT/GPX repair, merge, convert) | 3 | 5 | 5 | 4 | 3 | 2 | **3.75** | **Selected** |
| 2 | NOAA-based date/location weather odds, frost dates, degree-days | 2 | 4 | 4 | 3 | 2 | 4 | 3.05 | Runner-up |
| 3 | Commercial lease calculators (CAM, NNN, pro-rata) | 2 | 4 | 5 | 3 | 2 | 2 | 3.00 | Rejected |
| 4 | Residential landlord tools (prorated rent, late fees by state) | 3 | 2 | 4 | 3 | 2 | 4 | 2.90 | Top three, rejected |
| 5 | Tire/wheel fitment calculators | 3 | 4 | 5 | 1 | 1 | 3 | 2.90 | Rejected |
| 6 | NAS/home-server capacity + drive cost tools | 3 | 3 | 4 | 2 | 2 | 3 | 2.85 | Rejected |
| 7 | Travel points calculators | 3 | 2 | 4 | 1 | 1 | 4 | 2.50 | Rejected |
| 8 | Self-hosting config generators | 1 | 4 | 5 | 1 | 2 | 2 | 2.40 | Rejected |
| 9 | Paid landlord/CAM spreadsheet templates | 2 | 3 | 4 | 1 | 2 | 2 | 2.35 | Rejected |
| 10 | Training calculators (FTP, zones, pace) | 1 | 5 | 5 | 1 | 1 | 2 | 2.40 | Rejected |
| 11 | Auto maintenance/spec lookups | 1 | 3 | 3 | 1 | 1 | 2 | 1.80 | Rejected |
| 12 | Home networking calculators | 1 | 5 | 5 | 1 | 1 | 1 | 2.30 | Rejected |
| 13 | Generic developer utilities | 1 | 5 | 5 | 1 | 1 | 1 | 2.30 | Rejected |

## 1. Activity file tools — selected

Evidence:
- VERIFIED: the best-known desktop repair tool is paid; forum users cite a €39 licence and object to paying it for
  one file. https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/262079/can-someone-repair-my-fit-file
- VERIFIED: Garmin's forums carry many separate "please repair my corrupt FIT file" threads (search result list,
  2026-11-12), e.g. https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/159128/corrupt-fit-file-repair-requests/1564923
- VERIFIED: GOTOES, the common merge tool, processes uploads server-side, is donation-funded, and caps free
  uploads at 14 MB per file / 20 files. https://gotoes.org/strava/Combine_GPX_TCX_FIT_Files.php
- VERIFIED: Strava has no native merge; a feature request was posted July 2026.
  https://communityhub.strava.com/developers-api-7/auto-merge-consecutive-activities-when-the-gap-is-short-like-pause-resume-13678
- VERIFIED (listing only): phone apps sell merging via in-app purchase. https://apps.apple.com/us/app/-/id6736858288
- A language model cannot repair or merge a binary file in a chat reply. This is the most AI-resistant candidate.

Against:
- VERIFIED: a free in-browser repair tool exists. https://the5krunner.com/tools/fit-file/fit-file-repair/
- gpx.studio is free, open source and good at GPX editing. https://gpx.studio/about.html
- Each person needs this rarely, so traffic depends entirely on search, and volume is unknown.
- Honest ceiling: $100/month looks plausible; $1,000/month is unproven and would need the paid tier to work.

## 2. Weather odds (NOAA) — runner-up

- VERIFIED: Open-Meteo's free tier excludes sites with ads or subscriptions. https://open-meteo.com/en/terms
- A $0 build needs a pre-computed NOAA dataset (terms not yet verified). Head terms belong to timeanddate.com and
  WeatherSpark. No verified evidence that anyone pays. Worth revisiting as the second asset: larger audience,
  non-technical visitors, better fit for display ads.

## Rejections, one line each

- Commercial lease calculators: tiny audience, lease-specific maths limits authority, no affiliate programme found,
  and it overlaps the owner's employer's line of business. Rejected partly on conflict-of-interest grounds.
- Residential landlord tools: Zillow, Avail and Apartments.com hold page one; per-state statute data needs ongoing
  upkeep and carries legal exposure. Fails the low-maintenance requirement.
- Fitment calculators: VERIFIED Tire Rack pays 6% (https://www.tirerack.com/affiliate), but tiresize.com and
  wheel-size.com are entrenched and the simple maths is answered by AI summaries.
- NAS/drive cost tools: diskprices.com proves the affiliate model (https://synack.me/blog/diskprices-qa) but depends
  on Amazon at 2.5% (VERIFIED, https://affiliate-program.amazon.com/help/node/topic/GRXPHT8U84RAYDXZ) and live
  price data needs API access a new site cannot get.
- Travel points: crowded; card affiliate approval is gated; valuations go stale.
- Config generators, networking and developer utilities, training calculators: commodity output a chat model
  produces on request; technical audiences block ads (72% in a vendor-sponsored survey,
  https://theregister.com/2024/03/27/america_ad_blocker).
- Templates: no verified sales evidence; free substitutes everywhere.
- Auto spec lookups: needs a licensed data set.

## Ad network thresholds (unverified, check before applying)

Research returned conflicting minimum-traffic figures for Raptive, Mediavine and Ezoic. Treat all as ESTIMATE.
AdSense has no published traffic minimum but approval is not instant.
