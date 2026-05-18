# ADR 0004 — Build the marketplace index in CI, don't commit it

- **Status**: Accepted
- **Date**: 2026-04-25
- **Anchor commits**: `f2d9b09` (run build-index in CI before Pages deploy), `df6226e` (stop tracking `skills_index.json` and `CATALOG.md`)
- **Scope**: `.github/workflows/pages.yml`, `.gitignore`, `scripts/build-index.ts`

## Context

The marketplace browser (`index.html` + `assets/`) and the static
catalog (`CATALOG.md`, `catalog.html`) are driven by a single
generated artifact: `skills_index.json`. The build pipeline walks
`plugins/`, parses each `SKILL.md`'s frontmatter, fetches external
marketplace catalogs, applies overrides, and emits the index plus
the markdown/HTML catalog pages.

Two paths are conventional:

1. **Commit the generated files.** `skills_index.json`, `CATALOG.md`,
   and `catalog.html` live in git; contributors run `npm run build`
   locally and check the regenerated diff in with their plugin
   change. Pros: anyone browsing the repo sees the current state
   without running anything; the Pages deploy is a static publish of
   what's already in git.
2. **Generate in CI, gitignore the outputs.** Contributors don't
   commit them; the CI workflow regenerates on push and the Pages
   deploy serves what CI produces.

Choice (1) is the common shape for marketplace-style repos because
it makes browsing offline trivial and makes the deploy a pure copy.
But it has friction:

- Every plugin change requires regenerating and committing two
  large generated files. PRs grow noisier; merge conflicts on those
  files are routine when two PRs land near each other.
- The committed index drifts from upstream marketplaces between
  builds. We re-fetch `anthropics/skills`, `obra/superpowers`, etc.
  at build time — if those upstreams add a skill, the committed
  index lies until someone reruns the build.
- Contributors must remember to run the build. CI catches the diff
  via a separate check, but a missed-build PR becomes a back-and-forth.

## Decision

**Generate `skills_index.json`, `CATALOG.md`, and `catalog.html` in
CI before each Pages deploy, and `.gitignore` them.** The CI workflow
(`.github/workflows/pages.yml`) runs `npm run build` ahead of the
Pages upload step; the deploy artifact is whatever CI just produced.

The marketplace itself — `.claude-plugin/marketplace.json` — *is*
committed. It's a small, install-relevant manifest that downstream
installers can fetch via `raw.githubusercontent.com`. Only the larger
generated artifacts are excluded.

## Consequences

- PRs are clean — they touch only the plugin files the contributor
  actually changed. No "regenerate and recommit" step.
- The deployed index always reflects the moment of deploy, including
  the latest pull from external marketplaces. A new skill landing in
  `anthropics/skills` shows up on our next push to `master` without
  any work in this repo.
- Anyone browsing the repo *won't* see the rendered index from
  GitHub. They have to either visit the Pages site or run
  `npm run build` locally. The README and `docs/` link to the Pages
  URL prominently to make this clear.
- The installer (`@dan323/easier-life-skills`) fetches the deployed
  index via HTTP, not via git — so the no-commit policy doesn't
  affect end users. ADR-0009 covers the installer delivery contract.
- A failing CI build blocks the deploy. We accept that as the cost
  of always-fresh outputs — broken builds are visible immediately
  rather than masked by a stale committed copy.

## Notes

The two commits land within minutes of each other on 2026-04-25:
`f2d9b09` adds the build step to CI, `df6226e` removes the tracked
files. Order matters — adding the build before removing the tracked
files means the deploy never has a window where the index is missing.

Local development still runs `npm run build` (or `npm run dev`)
exactly as before. The change is purely about what gets committed.
