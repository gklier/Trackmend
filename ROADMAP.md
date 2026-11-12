# ROADMAP.md

## Current phase: live, awaiting owner verification of platform uploads

Live at https://trackmend.pages.dev (Cloudflare Pages, deploys from `main`).

### Done (2026-11-12)
- Tool and environment audit; delegation set up (AGENTS.md).
- 13 opportunities researched and scored; one selected (OPPORTUNITIES.md).
- FIT reader/writer, repair, join, FIT<->GPX conversion, with tests against real device files.
- Site: home, four tool pages, three sourced guides, about, privacy, 404, sitemap, security headers.
- Browser end-to-end suite. CI workflow file.

### Done since first build
- Repository `gklier/trackmend` connected; Cloudflare Pages project `trackmend` deployed.
- `SITE_URL` set; sitemap and canonical links verified live.
- Full browser suite (33 checks) passes against the live URL.

### Blocked on the owner (see OPERATIONS.md, "Owner actions")
1. Upload one repaired and one joined file to Garmin Connect and Strava, and report the result.
2. Decision on the final name and domain (currently a placeholder).
3. Search Console and Bing Webmaster access, to submit the sitemap.

### Next, in order of expected revenue impact
1. Upload test (owner): see Blocked above. This is the biggest unverified claim.
2. Search Console + Bing Webmaster: submit sitemap. Turn on Cloudflare Web Analytics.
3. Listings where permitted: AlternativeTo (as an alternative to the tools named in OPPORTUNITIES.md).
4. Wait for data. Then decide between ads and the paid batch pack (BUSINESS.md).

### Candidate improvements (do not build before traffic exists)
- TCX read/write.
- Mid-file damage: resynchronise after a bad block instead of stopping.
- Trim/crop an activity; remove a GPS spike.
- Batch mode (the paid pack).
- Blend two devices' recordings of one activity.

### Rejected
- Using Garmin's FIT SDK: its licence is a binding agreement the owner has not accepted. We use our own code.
- Server-side processing: adds cost and removes the privacy advantage.
