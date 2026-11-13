# AGENTS.md

How work is divided on this project. Keep this file current; it is the first thing a new session should read.

## Roles and models

| Role | Model tier | Used for |
|---|---|---|
| Orchestrator | Premium (session model) | Opportunity selection, architecture, security/financial review, launch/pivot decisions, hard bugs |
| Research | Mid/low-cost subagent (`sonnet`, `haiku` for simple lookups) | Market evidence, competitor checks, affiliate terms, fact verification |
| Development | Mid-cost subagent (`sonnet`) | Bounded implementation tasks with a written spec and tests |
| Content / QA | Low-cost subagent (`haiku`/`sonnet`) | Link checks, copy review, fact re-verification |

Delegation is done with the Claude Code `Agent` tool and its `model` override. That is the only delegation
mechanism verified to work in this environment (first used 2026-11-12 for three parallel research briefs).

## Delegation rules

1. Delegate only bounded, independent tasks with a stated deliverable, word limit, and stopping condition.
2. Briefs reference file paths; never paste the repository into a brief.
3. Research must separate VERIFIED (with URL) from ESTIMATE. Unsourced numbers are not recorded as facts.
4. Reuse `RESEARCH.md` before searching again.
5. The orchestrator reviews every delegated result before it is committed. Subagent output is a draft.
6. No agent may spend money, create accounts, or publish externally. Those go through the owner (see `OPERATIONS.md`).

## Quality standards (apply to every change)

- Every calculation has a unit test with a hand-checked or independently sourced expected value.
- No fabricated testimonials, statistics, reviews, author credentials, or "personally tested" claims.
- No placeholder content ships. No decorative charts with invented data.
- Every factual claim on the site that a reader could act on has a source or is derivable from stated formulas.
- Pages work without JavaScript errors at 360px width and with keyboard-only navigation.
- Affiliate links carry a visible disclosure and `rel="sponsored nofollow"`.
- No credentials, customer data, or employer material in the repository.

## Environment facts (audited 2026-11-12)

- Cloud session container: Node 22, npm/pnpm, Python 3.13, git, Chromium + Playwright preinstalled.
- No Cloudflare credentials in the container; `gh` token invalid. Pushing to `gklier/trackmend` works through the
  session's git proxy and deploys automatically via Cloudflare Pages.
- Garmin forum attachments (`forums.garmin.com/cfs-file/...`) download without login: a free corpus of real corrupt
  files. Keep them out of the repository.
- `support.garmin.com` returns 403 to fetches; use Strava's help pages and Garmin's developer site instead.
