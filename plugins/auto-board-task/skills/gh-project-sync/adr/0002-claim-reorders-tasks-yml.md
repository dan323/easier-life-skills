# ADR 0002 - `claim=true` reorders `tasks.yml` instead of passing a task id

- **Status**: Accepted
- **Date**: 2026-11-01
- **Skill**: [`gh-project-sync`](../SKILL.md)

> This ADR is **not** referenced from `SKILL.md` and is **not** loaded
> by the skill at runtime.

## Context

`auto-board-task` never moved a card to In Progress while its task was
being implemented. The card stayed in Todo until the PR opened, so a
dead run left no trace on the board and a second run could pick the
same card.

Fixing that needs a "claim" step. The hard part is that the claimed card
must be the task that is actually implemented. `task-agent` takes no
task id: it implements the first `status: pending` entry in `tasks.yml`
file order. File order is the order entries were added over time, and
need not match the board, so "top Todo card" and "first pending entry"
can be different tasks.

## Decision

Add `claim=true` to `gh-project-sync` and a `claim` step to the workflow
between the first sync and `task-agent`. The claim picks the top Todo
card in board order that has a pending entry, moves the card to In
Progress, and moves its entry to the front of `tasks.yml` (project
and task level). `task-agent` is unchanged.

## Consequences

- The claimed card is the implemented one without changing `task-agent`'s
  contract or adding an id argument to it.
- `tasks.yml` order is now meaningful and is rewritten by the claim.
- A claim is not idempotent: it consumes one Todo card per call.
- If a run dies after the claim, the card sits in In Progress with a
  pending entry. Later claims only look at Todo, so it is not retried
  automatically; a human moves it back to Todo to retry.
- Alternative rejected: add a `task_id` argument to `task-agent`. It is
  cleaner, but it widens another plugin's interface and needs a
  coordinated release.
