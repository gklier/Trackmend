# STATUS.md

Read this first. Updated 2026-11-13.

## State
- **Live:** https://trackmend.pages.dev — 16 pages, 5 tools, 6 guides. All suites green (69 unit, 40 browser).
- **Revenue:** $0.00 verified. **Spent:** $0.00.
- **Monetization:** batch licence built and tested, dormant until the owner creates the Lemon Squeezy product.
- **Distribution:** IndexNow done. Google not yet (needs owner's Search Console). No analytics yet.

## Blocked on the owner (one sitting, about 30 minutes)
1. **Lemon Squeezy store + product** (identity and tax forms are theirs to accept). Create a product "Trackmend batch
   licence", one-time, suggested $9, licence keys enabled with unlimited activations. Then in Cloudflare Pages set
   `PUBLIC_LS_PRODUCT_ID` (the numeric product id) and `PUBLIC_LS_CHECKOUT_URL` (the product's checkout link) and
   trigger a new deployment. The purchase option appears automatically.
2. **Google Search Console**: add the property, submit the sitemap.
3. **Cloudflare Web Analytics**: enable, set `PUBLIC_CF_ANALYTICS_TOKEN`, redeploy.
4. **Name**: "Trackmend" is unchecked against trademarks and domains. A custom domain is optional ($10–12/year, needs
   approval).

## Next for the agent (no owner needed)
- After any traffic: read Search Console queries, adjust titles.
- If the owner reports that an upload to Garmin Connect or Strava succeeded, remove the "not tested" hedges.
- Keep the wild-file corpus growing: new forum threads with attachments are a free regression suite.

## Recent changes
- 2026-11-13: resync after mid-file damage (closes the one case where the free tools fail and the paid tool wins);
  header size trusted only with a valid checksum; strict-decoder-clean output; 3 new guides; batch tool + licence;
  IndexNow.
- 2026-11-12: initial build, deploy, docs.
