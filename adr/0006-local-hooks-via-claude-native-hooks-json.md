# ADR 0006 — Local hooks declared via Claude's native `hooks.json`

- **Status**: Accepted
- **Date**: 2026-05-15 (planning), 2026-05-16 (migration committed)
- **Anchor commits**: `80be7f4` (plan), `6cd8f18` (convert), `bfbee74` (align discovery), `b79182c` (fix false positives), `6102a1e` (version bumps), `e3f2153` (docs)
- **Scope**: `plugins/cost-tracker/`, `plugins/site-audit/`, `scripts/lib/fetch-marketplace.ts` (hook discovery)
- **Supersedes**: the previous per-hook Markdown definitions under `plugins/<plugin>/hooks/*.md`

## Context

When this repo first shipped hooks (the `cost-tracker` and `site-audit`
plugins), they were declared as per-file Markdown documents under
`plugins/<plugin>/hooks/<event>.md` — one Markdown file per hook, with
YAML frontmatter for the event metadata and the body for documentation.

This shape predated Claude Code's standardisation of hooks. It worked
locally but had two compounding issues:

1. **Discovery was a heuristic.** The build pipeline scanned
   `plugins/<plugin>/hooks/` for `*.md` and parsed frontmatter. The
   problem: any `*.md` file in that path looked like a hook to the
   scanner, including README-style or notes-style Markdown that
   contributors might drop next to actual hooks. `b79182c` is the
   commit that explicitly stopped parsing markdown files as hook
   definitions — a clear "this heuristic misfires" signal.
2. **Claude Code expected `hooks.json`.** Claude Code's own hook
   contract is a JSON manifest at `hooks.json` declaring events,
   matchers, and the command/script to run. Custom-format hooks in
   this repo couldn't be wired into Claude Code's runtime
   directly — they were marketplace-listing-only.

## Decision

**Migrate every hook to the standard Claude Code `hooks.json` format**
and align the build pipeline's hook discovery to read `hooks.json`
exclusively. Markdown files in `hooks/` are no longer treated as hook
definitions.

Each plugin's `hooks/hooks.json` declares its hooks in Claude Code's
native shape, with `${CLAUDE_PLUGIN_ROOT}` for absolute paths to
bundled scripts so the hooks resolve correctly when installed under
`~/.claude/plugins/cache/...`.

`cost-tracker` (1.0.0 → 1.1.0) and `site-audit` (1.3.0 → 1.4.0) were
the two plugins that had hooks at the time and were bumped to reflect
the format change.

## Consequences

- Hooks are now directly executable by Claude Code at installation
  time. No translation layer; the manifest the marketplace catalogs
  is the same manifest the runtime consumes.
- The build pipeline's hook discovery is no longer a heuristic. It
  reads exactly one file (`hooks.json`) per plugin if it exists, and
  emits one entity record per declared hook. False positives are
  impossible by construction.
- Contributors writing new hooks follow Claude's documented format,
  which is searchable on the official docs and consistent across
  every plugin that ships hooks. The `docs/contributing.md` "Adding
  Hooks to a Plugin" section captures the local conventions
  (`${CLAUDE_PLUGIN_ROOT}` usage, rebuild requirement).
- Legacy Markdown files under `hooks/` are not auto-migrated — the
  migration was manual on `cost-tracker` and `site-audit`. Any
  future plugin author who follows the old pattern will find their
  hooks silently absent from the build. The contributing guide
  flags this prominently.
- Plugin version bumps after hook-format migrations are mandatory
  (the version bump rule was codified into `.claude/CLAUDE.md`'s
  Workflow Rules in the same migration stack).

## Notes

The migration stack includes four follow-up fixes (`bfbee74`,
`b79182c`, `7cf7920`, `6b7d2b8`) tightening discovery and addressing
review comments — the kind of churn that happens when aligning a
local format with an upstream contract. The end state is documented
in `docs/contributing.md` (sections under "Adding Hooks to a
Plugin").

`site-audit` later added a "skip hook logging when report hasn't
changed since last entry" optimisation (`6b7d2b8`) — that's a
behaviour tweak inside the new format, not a format change, so it
doesn't supersede this ADR.
