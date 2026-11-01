# ADR 0014 — `pr-reviewer` always posts a review, even when clean

- **Status**: Accepted
- **Date**: 2026-11-01
- **Scope**: `plugins/task-agent/agents/pr-reviewer.md`, `plugins/task-agent/agents/review-fixer.md`, `plugins/task-agent/skills/pr-reviewer/evals/evals.json`
- **Notes**: Reverses one detail of [ADR 0012](0012-own-pr-reviewer-instead-of-waiting-for-copilot.md) (post nothing when there is nothing to say). ADR 0012 is immutable and is not edited; its other decisions stand.

## Context

ADR 0012 introduced `pr-reviewer` as idempotent and silent when clean: no new findings, no review. On PR #130 that left no record at all. Nobody could tell a clean review from a reviewer that never ran, checks were never visibly captured, and the first version skipped the build and piped the test run through `tail`, with nothing on the PR to expose it. A reviewer that can silently do nothing is the failure mode ADR 0012 set out to remove.

## Decision

1. `pr-reviewer` always posts one `COMMENT` review for the head commit, with an empty `comments` array and a body listing the checks run (command and exit code) when there are no new findings. This also covers the case where every finding is already raised.
2. It posts nothing only when a review already covers this commit: a body starting with `<!-- pr-reviewer -->`, `commit_id` equal to `headRefOid`, authored by the account running the reviewer or a trusted author (OWNER, MEMBER, COLLABORATOR). A marker review from anyone else never suppresses it.
3. A check skipped by instruction (`RUN_CHECKS=false`, no sandbox) is `skipped (<reason>)` and not a finding; a check that should have run but could not be captured is a **medium** "not verified" finding. Findings with no diff line live in the review body and are deduplicated by their `**[severity]** summary` line.

## Consequences

- Every reviewed commit carries a visible record of what was run. The cost is one extra, possibly body-only, review per new head commit.
- `review-fixer` polls for trusted unresolved threads or trusted review bodies. A clean record review is a trusted review body, so it ends the wait immediately instead of letting it time out. The fixer then has nothing to fix unless the body reports a failing or unverified check or an "Outside the diff" finding. This is the intended outcome: "reviewed and clean" and "not reviewed yet" are now distinguishable.
- The Step 5 report must say which of the four outcomes happened: posted with comments, posted body-only, not posted because the commit was already reviewed, not posted because all findings were already raised.
- Evals: eval 0 now expects a record review rather than no POST.
