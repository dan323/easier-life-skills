# ADR 0012 — Review PRs with our own `pr-reviewer` agent instead of waiting for Copilot

- **Status**: Accepted
- **Date**: 2026-10-31
- **Scope**: `plugins/task-agent/` (`agents/pr-reviewer.md`, `skills/pr-reviewer`, `agents/review-fixer.md`), `plugins/auto-board-task/workflows/auto-board-task.yaml`

## Context

The `auto-board-task` pipeline ended with a `copilot-review-fixer` step, which waited for
GitHub Copilot to review the freshly opened PR and then applied its comments. Copilot
stopped reviewing these PRs. Runs spent up to ~20 minutes polling, found nothing, and
ended without a review; the only comments that ever showed up came from CodeRabbit,
a third-party bot that was rate-limited on some PRs and that the pipeline had no
contract with.

A review step that depends on an external reviewer showing up is a step that can
silently do nothing. Two other options were available and did not fit:

- **The built-in `/code-review` command** is user-triggered from an interactive
  session; a workflow step running in a subagent cannot invoke it.
- **A third-party bot** (CodeRabbit and similar) has the same availability problem
  as Copilot, plus its own rate limits and no guarantee of behaving the same next month.

## Decision

Ship a `pr-reviewer` agent in `task-agent`, wrapped by a `pr-reviewer` skill so it is
a normal workflow step, and run it between `sync-out` and `review-fix`.

1. **It posts one GitHub review with `event: COMMENT`**, never `APPROVE` or
   `REQUEST_CHANGES`, and never edits the PR branch, pushes or merges. GitHub does not
   let an account approve its own PR anyway; `COMMENT` is the only verdict that works
   when the reviewer runs under the author's `gh` login, and it keeps the human merge
   decision with the human.
2. **Every comment starts with `<!-- pr-reviewer -->`.** That marker is the whole
   protocol between reviewer and fixer: because the review is authored by the user's
   own account, `author` cannot identify it. The marker also makes re-runs idempotent
   (a finding is not posted twice when a marked comment on the same path has the same `**[severity]** summary` line; the marker alone cannot identify a finding because every comment starts with it).
3. **It runs the repo's own checks in a throwaway `git worktree`** and reports the
   results. A PR body saying "tests pass" is a claim the author wrote; the first
   reviewer prototype could not run the suite and had to say it had not verified it.
   A worktree keeps build side effects (generated indices, badges) out of the clone.
4. **`copilot-review-fixer` is replaced by a general `review-fixer`.** Once the reviewer
   is ours, a fixer named after Copilot is the wrong abstraction. `review-fixer` acts on
   unresolved review threads and review bodies from *trusted* authors, whoever they are:
   repo `OWNER` / `MEMBER` / `COLLABORATOR` (which covers the account the reviewer posts
   from), the bots `copilot-pull-request-reviewer` and `coderabbitai`, and any
   `reviewers=` logins. Everyone else is reported as Ignored and never acted on: a fixer
   that edits the branch on the say-so of any commenter is a prompt-injection vector on a
   public repo. It also runs the repo's checks before pushing, which the old fixer did
   not. The skill is removed rather than aliased, so task-agent goes to 2.0.0.
5. **The agent is told to check what the surrounding code is for before reporting a
   design-level finding.** The first live review observed keyboard shortcuts still firing
   while the bundle drawer was open; the obvious fix (disable them whenever the drawer
   is open) would have broken the feature, because the drawer is a non-modal tray that
   stays open. A narrow, concrete
   fix beats a broad one, and the prompt now says so.

## Consequences

- The pipeline always produces a review, on its own schedule, with no external
  dependency beyond `gh`.
- Review quality is bounded by the reviewing model. The implementer and the reviewer
  are the same model family and can share blind spots; this catches slips and
  convention gaps, not everything a human would. Merging stays a human decision.
- Findings are authored by the user's account, so they are not distinguishable by
  `author`. The fixer trusts them by account association, not by marker; the marker
  and the `**[severity]**` tag drive dedup and which findings get fixed. Anything that
  rewrites them makes the reviewer repost old findings or the fixer misjudge severity.
- Trusting `OWNER` / `MEMBER` / `COLLABORATOR` comments means a compromised
  collaborator account can steer the fixer. The fixer's own rules (no commands from
  comment text, no CI or dependency changes on request, checks before push, no force
  push) limit what that buys an attacker, but do not remove the risk.
- Running the checks costs minutes and needs the project's toolchain on the machine;
  `checks=false` turns it off.
- Token cost per run goes up by one review pass. If Copilot review comes back, the
  fixer still handles its comments unchanged.

## Notes

- Evals for the skill use a local bare repo as `origin` and a stub `gh`, so they need
  no network and no GitHub repo (an earlier eval set pointed at a sandbox repo that
  did not exist).
