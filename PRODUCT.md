# PRODUCT.md

Live: https://trackmend.pages.dev (Cloudflare Pages, free tier, deploys from `main`).

## What it does
Browser-only tools for sports activity files. Files never leave the visitor's device (enforced by a
Content-Security-Policy that blocks the pages from connecting anywhere except Cloudflare analytics and the
licence check).

| Tool | Path | Notes |
|---|---|---|
| Repair FIT | `/repair-fit-file/` | Recovers readable records before *and after* damaged bytes, rebuilds lap/session/activity, fixes header size and checksum. Asks for the sport only when it was lost. |
| Join activities | `/merge-fit-files/` | Consecutive recordings → one activity. FIT or GPX. Refuses overlapping recordings. |
| FIT → GPX | `/fit-to-gpx/` | Positions, elevation, time, HR, cadence, temperature, power. |
| GPX → FIT | `/gpx-to-fit/` | Needs timestamps. Builds records, lap, session, activity. |
| Batch | `/batch/` | Any of the above over many files, zip download. Free up to 3 files per run. |

Six guides target the problems people post about on Garmin's forum (export originals, combine activities, why files
corrupt, duplicate uploads, zero-byte files, Strava rejections). All sourced; unverified points are hedged in text.

## Evidence of correctness
- 69 unit tests, cross-checked against an independent MIT decoder in strict mode.
- 9 real device recordings (third-party test data, not committed; `SAMPLES_DIR`).
- 13 corrupt files that users posted to Garmin's forum (not committed; `WILD` env, `test/wild.local.test.ts` is
  gitignored). Every recoverable one repairs into strictly valid output. For the three threads that also carried a
  helper's fixed file that the user confirmed Garmin Connect accepted, our output matches it in record count, laps
  and distance (±2 m). The one unrecoverable file (83 bytes) is correctly refused.
- 40 browser checks (`npm run e2e`), also run against the live URL.
- Not done by anyone: an actual upload of our output to Garmin Connect or Strava. The site says so.

## Monetization
- **Batch licence** (one-time, Lemon Squeezy as merchant of record, 5% + $0.50): removes the 3-file limit.
  Built and tested. Dormant until `PUBLIC_LS_PRODUCT_ID` and `PUBLIC_LS_CHECKOUT_URL` are set. The licence key is
  validated in the browser against Lemon Squeezy's public endpoint and matched to the product id. Suggested price:
  $9 (the comparable desktop repair tool is about €39; phone apps sell merging as an in-app purchase).
- **Support link** (`PUBLIC_SUPPORT_URL`): dormant until set.
- **Display ads**: not before traffic exists. Would require widening the CSP and updating the privacy page first.

## Deliberately not built
- Server-side anything. - Blending two devices' recordings. - TCX. - Accounts.
