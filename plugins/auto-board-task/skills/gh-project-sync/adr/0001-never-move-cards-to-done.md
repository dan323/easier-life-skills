# ADR 0001 — `gh-project-sync` never moves cards to Done

- **Status**: Accepted
- **Date**: 2026-05-17 (requirement articulated in issue [#13](https://github.com/dan323/easier-life-skills/issues/13)); 2026-05-18 (implemented in `416f369`)
- **Anchor**: issue [#13](https://github.com/dan323/easier-life-skills/issues/13) (created 2026-05-17), implemented in `416f369` (2026-05-18, gh-project-sync 0.1.0)
- **Skill**: [`gh-project-sync`](../SKILL.md)

> This ADR is **not** referenced from `SKILL.md` and is **not** loaded
> by the skill at runtime. The build pipeline reads `SKILL.md` only;
> sibling folders like `adr/` are invisible to the marketplace index.

## Context

`gh-project-sync` is a reconciler between a GitHub Project (v2) board
and a `task-agent` unified `tasks.yml`. It computes a diff between
the two sides on every run and applies a small set of idempotent
rules:

| Source state                                  | Action                              |
|-----------------------------------------------|-------------------------------------|
| Todo card with no yml entry                   | Add to yml as `status: pending`     |
| Card moved to `Won't Do` or `Done`            | Drop the yml entry                  |
| yml `status: done` + `pr_url` + card not yet in {In Review, Done, Won't Do} | Move card to `In Review`, post the PR link |

The third rule is the one where the design choice matters. When
`task-agent` completes a task it sets `status: done` and writes a
`pr_url`. The natural-feeling forward-motion is: card → Done. A typical
"sync" tool would close the loop.

The PR isn't merged yet, though. `task-agent` *completes* a task by
opening the PR for human review. The merge decision — whether the work
is actually finished, whether to ship, whether to roll back — is a
human one. If `gh-project-sync` flipped the card to Done on PR
creation, the board would lie about the state of the work: closed PRs,
abandoned PRs, rolled-back PRs would all show as Done because the
sync ran before the human looked at the diff.

## Decision

**`gh-project-sync` never moves a card to `Done`.** The terminal state
the skill drives is **In Review** (with a configurable fallback to
**In Progress** for boards that don't have an In Review column). Once
the PR is merged (or closed without merging), a human moves the card
to its true terminal state. The next reconciler run sees the card in
`Done` (or `Won't Do`) and drops the yml entry — closing the loop on
the yml side without claiming completion on the board side.

The forward-motion rule is **permissive** about the *starting* column:
a human who pulled the card to `In Progress` to babysit the run still
gets the card moved to `In Review` once the PR opens. Only cards
already in `{In Review, Done, Won't Do}` are left alone — the skill
won't claw a card back to In Review if a human moved it forward.

Configurable column names via `todo_column=` / `in_review_column=` /
`done_column=` / `wont_do_column=` overrides; `in_review_column`
falls back through `In Review → In Progress` when no override is
given.

## Consequences

- The board's `Done` column means "human has reviewed and accepted
  the work" — a strong signal, not "automation has run".
- Boards that don't use an `In Review` column (the default GitHub
  template doesn't) still work, via the In Progress fallback. No
  setup-time configuration required for the common case.
- The yml-side drop on `Done`/`Won't Do` is one-directional: the yml
  is dropped, the card stays. This is intentional — the board is the
  long-term record; the yml is a short-lived work queue.
- The reconciler is idempotent: re-running converges to the same
  state regardless of how many times it runs or which side drifted.
  This lets the `auto-board-task` workflow safely call it twice in
  one pass (sync-in → run → sync-out) without special-casing.
- Legacy two-file `tasks.yml` setups are refused, not migrated. The
  passthrough metadata contract (see `task-agent`'s ADR-0001) is the
  load-bearing requirement, and it only exists in the unified mode.

## Notes

Six evals cover the rules. The two assertions worth knowing about:

- **"must NOT move to Done"** — the regression guard for this ADR.
  Any future PR that "rounds out" the sync semantics by completing
  the loop to Done should fail this assertion.
- **"fires from In Progress too"** — guards the permissive starting
  column. Without it, someone could tighten the rule to only fire
  from Todo and break the human-babysitting use case.

`Fixes #13`. The full sync-rules table is documented in
`references/github-projects.md` for the runtime agent.
