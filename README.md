# Trackmend (working name)

Browser-only tools for sports activity files: repair a damaged FIT file, join split activities,
convert FIT to GPX and GPX to FIT. Static site, no backend; files never leave the visitor's device.

- `src/lib/fit/` FIT reader, writer, repair and join. Written from the public protocol; no vendor SDK.
- `src/lib/gpx.ts` GPX reader/writer and conversions.
- `src/scripts/tool.ts` browser glue. `src/pages/` the site.
- `test/` unit tests, cross-checked with an independent MIT-licensed decoder. `e2e/` browser tests.

Start with `AGENTS.md`, then `ROADMAP.md`. Business context: `BUSINESS.md`, `OPPORTUNITIES.md`.
Deployment and owner steps: `OPERATIONS.md`.

```bash
npm install
npm test
npm run build
```
