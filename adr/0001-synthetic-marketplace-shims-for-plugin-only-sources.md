# ADR 0001 — Synthetic marketplace shims for plugin-only sources

- **Status**: Accepted
- **Date**: 2026-05-14
- **Anchor commit**: `ac23cb4` (v1.23.0)
- **Scope**: Installer (`installer/src/`), build pipeline (`scripts/lib/fetch-marketplace.ts`)

> This ADR is reconstructed from `ac23cb4`'s commit message and the
> installer's behaviour. It captures the rationale behind the existing
> design so future maintainers don't have to dig.

## Context

The installer's job is to land every install in Claude Code's normal
plugin registry — the same place `claude plugin list / update / uninstall`
sees — without forcing the user to learn a parallel install path or
keep a separate clone tree under `~/.claude/skills/`.

Most marketplace sources (`anthropics/skills`, `obra/superpowers`,
`DustyWalker/claude-code-marketplace`, this repo) ship a
`.claude-plugin/marketplace.json` at their root. For those, the install
is a uniform two-step:

```
claude plugin marketplace add <owner>/<repo>
claude plugin install <pluginName>@<repo>
```

But some upstream sources are **plugin-only** — they ship `SKILL.md`,
optional `agents/`, etc., but no `marketplace.json` (the canonical case
is `mattpocock/skills`). Three options were on the table:

1. **Require all sources to ship `marketplace.json`.** Forces every
   upstream to adopt the marketplace contract, which we don't own and
   can't dictate.
2. **Maintain a parallel install path** — clone the repo into
   `~/.claude/skills/<plugin>/` ourselves and have Claude Code load it.
   Splits the install graph: `claude plugin list` doesn't see the
   plugin-only installs, and `update` / `uninstall` need bespoke
   handling. Also adds a `git` dependency to the installer.
3. **Synthesise a marketplace shim per plugin** and route the install
   through the normal `claude plugin install` path against the shim.

## Decision

**Synthesise a per-plugin shim marketplace** at
`~/.config/easier-life-skills/shims/<pluginName>/.claude-plugin/marketplace.json`,
whose single plugin entry uses `source: { source: "url", url: "https://github.com/<owner>/<repo>" }`.
The installer then runs:

```
claude plugin marketplace add <shim-path>
claude plugin install <pluginName>@<pluginName>
```

Claude Code resolves the URL source on install — no `git` binary
required on the user's machine. From the user's perspective, plugin-only
installs are indistinguishable from marketplace-sourced installs:
`claude plugin list / update / uninstall` see them like any other entry.

The split between the two paths is driven by
`skills_index.json`'s `meta.sources[<owner/repo>].isMarketplace` flag,
populated by `scripts/lib/fetch-marketplace.ts` based on whether the
upstream actually ships a `marketplace.json`.

## Consequences

- One uniform install model. Users never need to think about whether
  the upstream is marketplace-shaped.
- The installer has no `git` dependency.
- Shims are per-plugin, not per-marketplace — two plugins from the same
  plugin-only repo get two shims under
  `~/.config/easier-life-skills/shims/`. This is intentional: it
  keeps each install independently uninstallable.
- The shim cache lives outside `~/.claude/` so it's not confused with
  Claude Code's own state. Cleanup is the installer's responsibility.
- If a plugin-only upstream later adds `marketplace.json`, the
  `isMarketplace` flag flips and we route via the standard path on the
  next install — the shim becomes orphaned but harmless until the next
  cleanup pass.

## Notes

The shim approach was packaged in v1.23.0 along with cross-marketplace
bundles (bundles that span source repos). The two changes were
intertwined: cross-marketplace bundles need every source to install via
the same uniform path, which only works once plugin-only sources are
shimmed. Decoupling them is possible but wasn't necessary.

See `installer/src/lib/shim.ts` for the shim-generation code and the
`installer/tests/` fixtures for the round-trip coverage.
