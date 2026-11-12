# OPERATIONS.md

## Owner actions (one-time, about 15 minutes)

1. **Create an empty GitHub repository** (private is fine) and make it available to Claude Code sessions,
   or push this folder yourself. Do not reuse an employer-related repository.
2. **Cloudflare Pages** (not Workers; this site relies on Pages' `_headers` file): Workers & Pages -> Create -> Pages -> Connect to Git -> pick `gklier/trackmend`.
   - Build command: `npm run build`
   - Output directory: `dist`
   - Environment variables: `NODE_VERSION=22`, `SITE_URL=https://<project>.pages.dev` (or the custom domain).
     Changing a variable only takes effect on a new build: push a commit (or run a new deployment) after changing it.
3. **Optional**: enable Web Analytics on the Pages project and set `PUBLIC_CF_ANALYTICS_TOKEN`;
   set `PUBLIC_CONTACT_EMAIL`. Use an address that is not your employer's.
4. **Decide the name.** "Trackmend" is a placeholder and has not been checked against trademarks or domains.
   The name lives in `src/config.ts` and the GPX `creator` default in `src/lib/gpx.ts`.

Current production: https://trackmend.pages.dev (project `trackmend`). After step 2 every push to `main` deploys automatically. No secrets are stored in the repository.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Local development server |
| `npm run check` | Type check |
| `npm test` | Unit tests (set `SAMPLES_DIR` to a folder of real .fit files for the extended suite) |
| `npm run build` | Production build into `dist/` |
| `npm run e2e` | Browser tests against the build (needs Playwright + Chromium available) |

Run check, test, build and e2e before every deploy. CI runs the first three plus `npm audit`.

## Monitoring

- Nothing runs server-side, so there is no uptime surface beyond Cloudflare's.
- No scheduled reports are configured. A weekly report has nothing to read until analytics exists; set one up
  after deployment.
- Dependabot or `npm audit` in CI covers dependency alerts. Runtime dependencies: none (all are build-time).

## Backups and recovery

The repository is the only state. To recover: redeploy any commit from Cloudflare Pages' deployment list.

## Security practices

- `public/_headers` sets a Content-Security-Policy that limits connections to the site itself and Cloudflare's
  analytics endpoint. If ads are added later this policy must be widened, and the privacy page updated first.
- User files are never transmitted. Do not add any feature that changes this without rewriting the site's claims.
- Never commit `.env`. Third-party sample recordings stay out of the repository (`samples/` is ignored).

## Escalate to the owner

Security incident, a report that a repaired file lost data it should have kept, any spending, any legal notice.
