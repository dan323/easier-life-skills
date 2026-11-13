# ADR 0015 — The `readOnly` tag can be overridden, but only from `external-overrides.json`

- **Status**: Accepted
- **Date**: 2026-11-07
- **Scope**: `scripts/lib/frontmatter.ts`, `scripts/build-index.ts`, `.claude-plugin/external-overrides.json`

## Context

Skills, agents and commands carry a `readOnly` tag. It is set when none of the entity's `tools` (`allowed-tools` for commands) can write or edit files, locally or remotely (`isWriteTool`). Tagging by tool list cannot see everything: unscoped `Bash` can run `gh pr review`, and a skill that only delegates to a read-only agent looks like a writer. So the computed tag is sometimes wrong, and we want a way to correct it.

The obvious place for a correction is `SKILL.md` frontmatter. But frontmatter is written by the skill's author, and for external marketplaces that is a third party. A `read-only: true` field there would let any author badge their own skill as safe, and the badge is a trust signal shown in the web UI, the catalog and the installer.

## Decision

1. `readOnly` is never read from frontmatter. It is computed from `tools` only. An agent or command with no tool list inherits every tool, so it is never read-only.
2. A correction is an entry under `skills.<name>.readOnly`, `agents.<name>.readOnly` or `commands.<name>.readOnly` (boolean) in `.claude-plugin/external-overrides.json`, keyed by source repo as the category overrides are. The file is in this repo, so only maintainers can change it, through review.
3. The override is applied in `build-index.ts` after fetching, next to the category overrides, and wins over the computed value in both directions (it can also withdraw the tag).
4. Plugins are collections and carry no tag. Hooks and MCP servers are excluded: a hook runs an arbitrary command and an MCP server's tools are not in the repo, so neither can be judged reliably, and a hand-set badge would be a guess.

## Consequences

- Authors keep control of their skill's content but not of its trust badge.
- Overrides are keyed by entity name, like category overrides, so two same-named entities in one repo share an entry. Acceptable while collisions are rare.
- Every override is a manual claim that must be re-checked when the entity changes. Use it sparingly. First entries: `auto-board-task` (skill) and `pr-reviewer` (agent) are forced to `false` — their tool lists look read-only, but they open PRs, move board cards or post GitHub reviews.
