# ADR 0010 — External multi-skill plugins indexed as individual skills + a bundle ref

- **Status**: Accepted
- **Date**: 2026-04-25
- **Anchor commits**: `79ef37b` (expand sub-skills), `c4508d2` (treat as bundles), `46e8d02` (final dual representation)
- **Scope**: `scripts/lib/fetch-marketplace.ts`, `.claude-plugin/marketplace.json` shape, web UI

## Context

Upstream marketplaces like `anthropics/skills` use a *nested* plugin
shape: a single `plugin.json` declares a `skills:` array that
references multiple sub-skill folders, each with its own `SKILL.md`.
From the upstream's perspective the plugin is *one installable* with
many sub-skills inside it; from a discoverability perspective each
sub-skill is independently useful and has its own name (`changelog`,
`docx`, `pdf`, …) that users want to find by.

Three indexing strategies are coherent:

1. **Expand to individual skills only** (`79ef37b`). Fetch every
   sub-skill's `SKILL.md` and emit one index entry per sub-skill;
   ignore the parent plugin entirely. Pros: each skill is searchable
   on its own. Cons: the install command for a sub-skill has to be
   the *parent* `plugin install` — the user sees an individual
   "changelog" card but installing it actually pulls the whole
   `docs` bundle. The asymmetry is confusing.
2. **Treat as a bundle only** (`c4508d2`). Emit one bundle entry per
   external plugin, listing the sub-skill names but not creating
   individual cards. Pros: install commands match reality (the
   bundle is the install unit). Cons: users can't search for
   "changelog" and find it directly; they have to know it's inside
   a bundle named `docs`.
3. **Both: individual skill entries AND a bundle ref** (`46e8d02`).
   Each sub-skill gets its own card so search and category filters
   work; the parent plugin appears as a bundle in the bundles section
   so users who want the whole set see it grouped. Skill cards link
   back to their parent bundle's install command.

## Decision

**Index each external sub-skill as an individual skill entry, and
*also* emit the parent plugin as a bundle that references those
sub-skill names.** The web UI and catalog show both surfaces.

In `skills_index.json` the skill list and the bundles list both
contain references to the same underlying SKILL.md content — they're
two views of the same data, not duplicated content.

Resolution rules:

- A sub-skill's "install" action points at the parent plugin's
  install command. The sub-skill is not separately installable;
  installing it installs the whole parent.
- The bundle entry links the parent plugin's `plugin.json` and
  surfaces the source marketplace badge for external bundles, so
  users can tell a bundle from a local single-purpose plugin.
- Bundle membership is computed via the
  `(source.owner, source.repo, pluginName, name)` triplet (ADR-0002)
  so sub-skills with names that collide with local plugins don't
  smear membership.

## Consequences

- Search hits both surfaces. A user typing "changelog" sees the
  individual skill card; a user browsing bundles sees `docs` listed
  in the bundle section.
- Install commands are honest. Clicking a sub-skill card displays
  the parent's `plugin install` command — no fake "install just
  this sub-skill" UX that doesn't work.
- The skill count grows a lot when we add an external marketplace
  (`anthropics/skills` brought 17 sub-skills in via this rule). The
  category filters and search become more useful as the catalog
  scales; the bundle list stays small enough to scan.
- The dual representation is a maintenance contract: any change to
  how skills are emitted has to update bundles too, and vice versa.
  ADR-0002's centralised resolver (`scripts/lib/bundle-resolve.ts`
  + `assets/src/bundle-resolve.ts`) is what keeps these two paths
  in sync.
- Local multi-skill plugins (`docs`, `code-audit`, `auto-board-task`)
  follow the same dual shape — they appear in both the skill list
  and the bundle list. The convention is uniform regardless of
  whether the source is local or external.

## Notes

The decision evolved across three same-morning commits on 2026-04-25:
`79ef37b` first expanded sub-skills into the index, `c4508d2` then
overcorrected by treating external multi-skill plugins as
bundles-only, and `46e8d02` settled on the dual representation that's
still in effect. Reading the three commit messages together is the
clearest single artefact of the design's evolution.

The same-day churn is why this ADR exists — the rationale for
"both surfaces" only makes sense in light of the two intermediate
attempts.
