# ADR 0002 — Disambiguated bundle and skill refs via `(source, pluginName, name)` triplet

- **Status**: Accepted
- **Date**: 2026-05-15
- **Anchor commits**: `7f86554` (v1.25.2), `03ca2ca` (bundles converted to object form)
- **Scope**: Build pipeline (`scripts/lib/bundle-resolve.ts`), web UI (`assets/src/bundle-resolve.ts`), `.claude-plugin/bundles.json`

## Context

Skills are not globally unique by `name`. Two plugins can ship a skill
with the same name — both intra-repo (one repo, two different plugins
each declaring `skills/changelog/`) and cross-marketplace (`changelog`
appears in this repo's `docs` plugin and could appear in someone else's
marketplace). The natural-feeling identifier — a bare skill name — is
ambiguous.

Before v1.25.2, several lookups across the codebase keyed on `name`
alone:

- Bundle membership tagging at build time (`scripts/build-index.ts`'s
  bundle resolver attached the bundle to *every* skill with the named
  identifier).
- The `bundles.json` skill list used bare strings — the first matching
  skill won.
- The web UI's `PluginPanel` related-entity scoping resolved related
  skills by name within the panel's marketplace.
- Preact card `key={skill.name}` in `Grid` and `PluginPanel` collided
  when two plugins shipped a same-named skill.
- The auto-`mixed` plugin-category logic (assigning `category: mixed`
  when a plugin's skills span more than one category) keyed on name
  when looking up the per-skill category.

Symptom: bundle membership was "smeared" across all plugins sharing the
skill name, panel lookups returned the wrong sub-entity, and the
React/Preact reconciler complained about duplicate keys.

Two ways to fix it:

1. **Globally rename**: forbid same-named skills across the indexed
   marketplaces. Brittle (we don't control upstream names), surfaces
   churn into external repos, and doesn't address intra-repo collisions
   inside bundle plugins like `docs`.
2. **Identify by triplet**: switch every lookup to
   `(source.owner, source.repo, pluginName, name)` (four fields
   together act as a triplet — the source is a pair, pluginName
   distinguishes intra-repo, and name distinguishes intra-plugin).

## Decision

**Identify every skill/agent/MCP/command/hook by the tuple
`(source.owner, source.repo, pluginName, name)`.** Five spots
concentrate the change:

- Catalog bundle rendering (`scripts/lib/catalog.ts`)
- Build-index bundle tagging (`scripts/build-index.ts`)
- Auto-`mixed` plugin-category logic
- Web UI's `PluginPanel` related-entity scoping
- Preact card keys in `Grid` and `PluginPanel`

The resolver itself is centralised in
`scripts/lib/bundle-resolve.ts` (build-time) and
`assets/src/bundle-resolve.ts` (runtime), so build-time tagging and
the web UI agree on what a ref expands to.

`bundles.json` skill refs accept two forms:

- **Bare string** — matches every skill with that name across all
  marketplaces. Kept for legacy bundles where the name is unambiguous
  and the bundle genuinely wants every occurrence.
- **Object** `{ name, source?, pluginName? }` — narrows by source repo
  and/or plugin. The natural form when two plugins ship a same-named
  skill and the bundle wants exactly one of them.

Per `03ca2ca`, every entry in the in-repo `bundles.json` was converted
to the object form even where bare strings would have worked, so the
file's intent is unambiguous at a glance.

Web entity TypeScript types (`Skill`, `Agent`, `McpServer`, `Command`,
`Hook`) now **require** `pluginName`, matching what
`scripts/lib/fetch-marketplace.ts` emits. The compiler enforces the
contract.

## Consequences

- Bundle membership is precise. A bundle that names `changelog` from
  `dan323/easier-life-skills`'s `docs` plugin no longer accidentally
  tags `mattpocock/skills`'s `changelog`.
- Panel lookups, card keys, and category aggregation are correct for
  same-named skills across plugins.
- `bundles.json` is more verbose (object form is ~3× the characters of
  a bare string) — accepted as the cost of correctness.
- New contributors writing bundles can use bare strings when the name
  is unambiguous; the linter / runtime will not punish them, and the
  in-repo convention to prefer object form is documented in
  `.claude/CLAUDE.md`'s Bundle Format section.
- The `pluginName` requirement on web types is a load-bearing
  invariant — any future entity source that emits records without
  `pluginName` will not type-check.

## Notes

A `skill-name-collision.test.ts` regression suite covers four
representative scenarios: cross-repo same-name, intra-repo same-name
(two plugins in this repo), panel scoping correctness, and object-form
bundle attachment. Treat that file as the canary if anyone touches the
resolver.

`docs/architecture.md` step 6 of the build pipeline describes the
resolver mechanically. This ADR captures the *why* the architecture
doesn't.
