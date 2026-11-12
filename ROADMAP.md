# ROADMAP.md

## Current phase: built and tested, waiting on deployment access

### Done (2026-11-12)
- Tool and environment audit; delegation set up (AGENTS.md).
- 13 opportunities researched and scored; one selected (OPPORTUNITIES.md).
- FIT reader/writer, repair, join, FIT<->GPX conversion, with tests against real device files.
- Site: home, four tool pages, three sourced guides, about, privacy, 404, sitemap, security headers.
- Browser end-to-end suite. CI workflow file.

### Blocked on the owner (see OPERATIONS.md, "Owner actions")
1. A GitHub repository to push to.
2. Cloudflare Pages project connected to it.
3. Decision on the name/domain.

### Next, in order of expected revenue impact
1. Deploy. Verify the live URL, headers and sitemap.
2. Upload one repaired and one joined file to Garmin Connect and Strava (owner, 10 minutes) and record the result.
   This is the biggest unverified claim.
3. Search Console + Bing Webmaster: submit sitemap. Turn on Cloudflare Web Analytics.
4. Listings where permitted: AlternativeTo (as an alternative to the tools named in OPPORTUNITIES.md).
5. Wait for data. Then decide between ads and the paid batch pack (BUSINESS.md).

### Candidate improvements (do not build before traffic exists)
- TCX read/write.
- Mid-file damage: resynchronise after a bad block instead of stopping.
- Trim/crop an activity; remove a GPS spike.
- Batch mode (the paid pack).
- Blend two devices' recordings of one activity.

### Rejected
- Using Garmin's FIT SDK: its licence is a binding agreement the owner has not accepted. We use our own code.
- Server-side processing: adds cost and removes the privacy advantage.
