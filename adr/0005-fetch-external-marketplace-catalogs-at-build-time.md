# ADR 0005 — Fetch external marketplace catalogs at build time

- **Status**: Accepted
- **Date**: 2026-04-25
- **Anchor commit**: `8293189`
- **Scope**: `scripts/lib/fetch-marketplace.ts`, `scripts/build-index.ts`, the marketplace browser

## Context

This repo isn't a single-marketplace browser — it aggregates skills
across multiple upstream sources (`anthropics/skills`, `obra/superpowers`,
`mattpocock/skills`, `DustyWalker/claude-code-marketplace`,
`marcusabu/claude-code-docs-plugin`, plus the local plugins). For the
catalog to actually catalog *those* skills, the build pipeline has to
read their `marketplace.json` (or their plugin folders for plugin-only
sources — see ADR-0001) somehow.

Three architectures were viable:

1. **Runtime fetch in the browser.** `assets/src/app.tsx` calls the
   GitHub Contents API for each marketplace on page load, merges
   client-side. Always fresh, but every page view consumes API
   quota; unauthenticated browsers hit 60 req/hour limits quickly;
   requires CORS-safe access; visibly slow on cold loads.
2. **Committed snapshots.** Pull each upstream's catalog into a
   versioned snapshot under `vendor/` (or similar), update via a
   periodic script. Fast and offline-capable, but stale by design —
   a new upstream skill doesn't appear until someone re-snapshots
   and commits.
3. **Build-time fetch in CI.** `scripts/build-index.ts` calls the
   GitHub API during `npm run build` (which CI runs before each
   Pages deploy — see ADR-0004) and merges externals into
   `skills_index.json`. The browser then loads the merged static
   JSON.

## Decision

**Fetch external catalogs at build time** (option 3). On every CI
build, `scripts/lib/fetch-marketplace.ts` walks each repo declared in
`marketplaces.json`, pulls the relevant manifests via the GitHub API
(authenticated with `GITHUB_TOKEN` so CI gets the higher rate limit),
and emits a merged `skills_index.json`. The browser loads a single
flat JSON — no API calls from end-user devices.

The build is **fail-soft on external errors**: a missing repo, a
network failure, or a private repo that 403s logs a warning and the
build continues without that source. The deploy never blocks because
an upstream took its repo private.

Each skill card surfaces a *source badge* identifying which
marketplace it came from, so users can tell at a glance whether a
result is local or external. `style.css` defines a `.badge-marketplace`
class for this.

## Consequences

- Browser load is one HTTP request for the index, served from
  GitHub Pages CDN. No API quota consumed at view time, no CORS
  concerns, no auth flow.
- Updates are as fresh as the last CI build. Pushing any change to
  `master` triggers a rebuild and pulls the latest upstream state —
  far better than committed snapshots, slightly behind runtime fetch.
- The CI build can fail (slow API, 5xx) and we still want a deploy.
  The fail-soft contract is load-bearing — if it ever changes,
  upstream outages will block our own deploys.
- A tree cache (`.cache/trees/`) keyed on `hashFiles('marketplaces.json')`
  reduces redundant API calls across runs. The CI workflow restores
  this cache on each build.
- New upstream marketplaces require only adding an entry to
  `marketplaces.json` plus an optional `external-overrides.json`
  entry for categorisation — no schema migration, no per-source
  loader code (though ADR-0001's shim path applies for plugin-only
  sources).

## Notes

The fetch loop respects upstream conventions: it looks for
`.claude-plugin/marketplace.json`, falls back to treating the repo
as a single plugin if none exists (the `mattpocock/skills` case),
and applies `external-overrides.json` last for categorisation
corrections (ADR-0008 covers the auto-categorisation that fills the
gap).

`GITHUB_TOKEN` is explicitly passed to the build step in
`pages.yml`. Without it the build still works for public repos but
hits the 60 req/hour anonymous limit and can fail mid-build if the
tree cache is cold.
