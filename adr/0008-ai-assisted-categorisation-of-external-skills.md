# ADR 0008 — AI-assisted categorisation of external skills via GitHub Models

- **Status**: Accepted
- **Date**: 2026-04-25
- **Anchor commits**: `6e01cb5` (introduce Copilot categorisation), supporting commits `20df21b`, `4ed3899`, `c85f12d`, `0b0cf27`
- **Scope**: `scripts/build-index.ts`, `.claude-plugin/external-overrides.json`, `.github/workflows/pages.yml`

## Context

Local plugins declare their category in `plugin.json` (or per-entity
frontmatter). External marketplaces don't — `anthropics/skills`,
`obra/superpowers`, and friends ship their own `plugin.json` files
without category fields aligned to our taxonomy. Our web UI groups
the catalog by category, so uncategorised external skills end up in
an "Uncategorized" bucket that's both ugly and unhelpful for
discovery.

Three options:

1. **Leave uncategorised externals in "Uncategorized".** Honest but
   bad UX — most of the catalog ends up there because the externals
   outnumber the locals.
2. **Manually categorise everything in `external-overrides.json`.**
   Accurate but unscalable — every time an upstream adds a skill,
   someone has to notice, classify it, and PR. The override file
   becomes a maintenance burden.
3. **Auto-categorise with an LLM at build time**, with manual
   overrides as the override path. The model handles the bulk; humans
   correct mistakes via `external-overrides.json`.

## Decision

**Use the GitHub Models API (gpt-4o-mini) to auto-categorise
uncategorised external skills during the CI build.** All
uncategorised skills are sent in a single batch request, the model
returns a category per skill from our fixed vocabulary, and the
result is merged into the build's per-skill records.

The categorisation has explicit precedence rules:

1. Local plugin's `plugin.json` category (or per-entity frontmatter).
2. Entry in `external-overrides.json` for the skill — manual
   override always wins.
3. AI-assigned category from the GitHub Models call.
4. `null` ("Uncategorized" in the UI) if all three are absent or the
   model call fails.

`external-overrides.json` was cleared of bulk category entries when
this shipped — the file is now for *corrections only*, not for
bootstrapping the taxonomy. If the model picks badly for a specific
skill, add an override; otherwise let the model decide.

The CI workflow passes `GITHUB_TOKEN` to the build step so the
GitHub Models call authenticates correctly. Without the token the
build falls back to "no category" for the affected skills — the
gracefully-degraded path.

## Consequences

- The catalog is well-bucketed out of the box for every external
  marketplace, with no per-PR manual classification load.
- `external-overrides.json` is small and high-signal — only the
  corrections live there. Reviewing the file is reviewing decisions,
  not transcribing data.
- The model's choices are non-deterministic across builds. We accept
  this — small variation in category assignment is harmless, and the
  override path exists for cases where stability matters.
- The CI build now has a soft dependency on GitHub Models being
  reachable. If the API is down, those skills land uncategorised
  for that deploy and self-heal on the next build. We do not block
  the deploy on model availability — same fail-soft principle as
  ADR-0005's external-fetch handling.
- Each deploy potentially calls the GitHub Models API. The single
  batch request keeps the cost negligible (one call per build, ~17
  skills today).
- The fixed category vocabulary is in `.claude/CLAUDE.md`'s "Plugin
  Manifest Format" table. The model's prompt references that
  vocabulary so its outputs match the UI's filter buttons.

## Notes

The categorisation call was tested via two preparatory commits
(`4ed3899` adding a small external marketplace specifically for
testing the call, `c85f12d` triggering CI to verify token handling)
before the production rollout in `6e01cb5`. The model identity
(`gpt-4o-mini`) is part of the build script's request body; switching
to a newer model is a one-line change.

`models: read` permission on the Pages workflow (`20df21b`) is the
GitHub Actions permission scope required to call GitHub Models with
`GITHUB_TOKEN`. Removing this scope silently disables auto-
categorisation.
