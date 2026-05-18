# ADR 0001 — Unified single-file `tasks.yml` with passthrough metadata

- **Status**: Accepted
- **Date**: 2026-05-17
- **Anchor commit**: `ba73813` (task-agent 1.1.0)
- **Skill**: [`task-agent`](../SKILL.md)
- **Supersedes**: the two-file `tasks.yml` + `tasks-state.yml` legacy mode (still detected and supported)

> This ADR is **not** referenced from `SKILL.md` and is **not** loaded
> by the skill at runtime. The build pipeline reads `SKILL.md` only;
> sibling folders like `adr/` are invisible to the marketplace index.

## Context

The original `task-agent` model split a task queue into two files:

- `tasks.yml` — declarative list of tasks the agent should pick up
  (description + optional metadata).
- `tasks-state.yml` — mutable run state (which tasks were completed,
  which failed, which were skipped).

Two-file state separation is conventional ("config vs. data") and made
sense when the file was first sketched. In practice it caused friction:

- **External sync tools couldn't round-trip metadata.** A sibling skill
  reading from a GitHub Project board (or an issue tracker, etc.)
  wants to attach a card ID, labels, an external ref — and have those
  fields survive a `task-agent` run. With state split off, the metadata
  on a "done" task was in one file; the completion state was in the
  other. Anything writing into `tasks.yml` had to also know about
  `tasks-state.yml`. Anything reading status had to merge the two.
- **Atomicity was an illusion.** Completing a task meant editing two
  files. A crash between the two writes left the queue in a
  contradictory state.
- **The auto-rewrite path was complex.** Phase 4 of the agent's run
  rewrote both files; the legacy code had two separate writers with
  near-duplicated logic.

The pivot: `task-agent` is the *only* writer of completion state. The
"config vs. data" split bought no isolation because nothing else was
writing the state file.

Two options:

1. **Keep the split, formalise the contract.** Document the
   atomicity gap, ship a transactional writer, write a merge helper
   for external tools.
2. **Merge into one file** with a `status:` field on each entry.
   Per-task `id`, `description`, `status` (`pending` / `done` /
   `failed` / `skipped`) in one place; completion flips status in
   place.

## Decision

**Unify into a single `tasks.yml`** with `id`, `description`, `status`
per entry. The skill auto-detects mode by the presence of a top-level
`status` field on any entry. Legacy two-file mode is kept working but
not new-feature-bearing.

Two additional invariants make external integration robust:

- **Passthrough metadata.** Unknown keys on an entry
  (`external_ref`, `labels`, anything an external tool added) are
  preserved *verbatim* across the agent's rewrites. The agent reads
  the entry, modifies only the fields it owns (`status`, `pr_url`),
  and writes the rest back unchanged. This is the contract that lets
  `gh-project-sync` (and future sync skills) attach board IDs.
- **Idempotent branch creation** (`git checkout -B`). A stale local
  branch from an interrupted prior run no longer wedges the next
  attempt.

Phase 1 and Phase 4 YAML I/O is extracted to
`plugins/task-agent/scripts/tasks_io.py` with a `self-test`
subcommand that exercises mode detection, id synthesis, passthrough
preservation, and both writeback paths. `references/format.md`
documents the schema and the passthrough contract.

`tasks=` and `state=` arguments allow custom filenames; the workdir
respects `tempfile.gettempdir()` plus a `TASK_AGENT_WORKDIR` override
(replacing the hard-coded `/tmp/multi-repo-tasks`).

## Consequences

- One file, one write per task completion. Atomicity is solved by
  YAML's write-and-rename semantics — no halfway state.
- The passthrough contract lets external tools own a slice of the
  schema without forking the skill. `gh-project-sync` depends on this
  (see its own ADR-0001 in `plugins/auto-board-task/skills/gh-project-sync/adr/`).
- Legacy two-file users keep working — auto-detection is the
  compatibility hinge. We can drop legacy mode in a future major bump,
  but only after a deprecation window and only if no external sync
  tool still depends on it.
- Phase 1/4 YAML I/O is testable in isolation via `tasks_io.py`'s
  self-test, without booting the full agent harness.
- `id` is synthesised when missing (kebab-cased from the description's
  first words) — a convenience for hand-written queues. External
  tools should always set `id` explicitly.

## Notes

The unified mode rolled together with the workdir cross-platform fix,
the idempotent branch creation, and the I/O extraction in one commit
because they share the rewrite. The deliberate scope was "fix the
external-integration contract"; the supporting changes were the
minimum needed to land it on a working foundation.

`references/format.md` is the authoritative schema reference, fed to
the agent at runtime via the references mechanism. This ADR captures
the *why*; the reference documents the *what*.
