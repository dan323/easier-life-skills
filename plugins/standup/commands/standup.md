---
description: Summarise today's git commits and open PRs into a standup-ready paragraph (wraps git log --since=midnight and gh pr list)
argument-hint: [--since <git date>] [--all-authors] [--repo owner/name]
allowed-tools: Bash(git:*), Bash(gh:*)
category: productivity
---

# /standup

Produce a short, standup-ready update from the current repository's recent activity.
This command is read-only: it never commits, pushes, or edits PRs.

Arguments passed by the user: `$ARGUMENTS`

- `--since <date>` overrides the window start (any `git log --since` value, e.g. `yesterday`, `"last friday"`). Default: `midnight`.
- `--all-authors` includes everyone's commits and PRs; by default only the current git user's.
- `--repo owner/name` queries that repository's PRs instead of the current one (commits always come from the local checkout).

Shell-quote every value you substitute with single quotes, escaping an embedded single quote as `'''`.

## 1. Gather commits

```bash
git rev-parse --is-inside-work-tree
git log --since='midnight' --author="$(git config user.email)" --no-merges --date=short --pretty='format:%h %s' --all
```

- Not inside a git repo → say so and stop (PR data can still be fetched when `--repo` is given).
- Replace `midnight` with the `--since` value when given; drop `--author` with `--all-authors`.
- No commits in the window → report that plainly; do not pad.

## 2. Gather PRs

```bash
gh pr list ${REPO:+--repo "$REPO"} --author '@me' --state open --json number,title,url,isDraft,reviewDecision
gh pr list ${REPO:+--repo "$REPO"} --author '@me' --state merged --search "merged:>=$(date +%F)" --json number,title,url
```

- Drop `--author '@me'` with `--all-authors`. Use the `--since` date for the `merged:` filter when given.
- `gh` missing or not authenticated → skip PRs, say so, and still report commits.

## 3. Write the update

Group related commits (same feature/fix, same PR) into single items; do not list every commit. Output:

- **Done** — one short paragraph: what was completed in the window, mentioning merged PRs as `#123`.
- **In progress** — open PRs with their state (draft, awaiting review, changes requested, approved) and uncommitted work only if `git status --short` shows it.
- **Blockers** — only if the data shows one (changes requested, failing review). Otherwise omit the line; never invent blockers.

Keep it to what the data supports and under ~120 words. Do not copy secrets or credentials that appear in commit messages.
