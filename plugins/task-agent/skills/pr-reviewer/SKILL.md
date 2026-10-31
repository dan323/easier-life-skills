---
name: pr-reviewer
description: Reviews a pull request (correctness, tests, repo conventions, safety), verifies the repo's own checks in a throwaway worktree, and posts one read-only GitHub review with inline comments. Thin skill wrapper around the `pr-reviewer` sub-agent — callable as a workflow step, and the stand-in for Copilot review.
tools: Bash, PowerShell, Read, Glob, Grep, Agent
---

# PR Reviewer

Wraps the `task-agent:pr-reviewer` sub-agent so it can be invoked as a workflow step. The agent only ever posts a `COMMENT` review — it never approves, requests changes, pushes or merges.

**Arguments** (key=value form):
- `pr_url=<url>` — full GitHub PR URL (e.g. `https://github.com/owner/repo/pull/42`). Required.
- `repo=<owner/repo>` — repository in `owner/repo` format. Required.
- `branch=<branch>` — branch name the PR is on. Required.
- `checks=<true|false>` — whether the agent runs the repo's build / type-check / tests in a throwaway worktree. Optional, default `true`.

## What to do

### Step 1 — Parse arguments

Parse `pr_url`, `repo`, `branch` and `checks` from the invocation arguments.

Derive:
- `OWNER` and `REPO_NAME` from `repo` (split on `/`)
- `PR_NUMBER` from the last path segment of `pr_url`

If any required argument is missing or cannot be parsed, stop and report the error clearly. If `checks` is anything other than `true` or `false`, stop and report it.

### Step 2 — Prepare the local clone

Reuse the `task-agent` workdir convention so the clone is shared with a preceding `task-agent` step in the same workflow:

```bash
WORKDIR="${TASK_AGENT_WORKDIR:-$(python3 -c 'import os,tempfile;print(os.path.join(tempfile.gettempdir(),"task-agent"))')}"
LOCAL_PATH="$WORKDIR/$REPO_NAME"
if [ -d "$LOCAL_PATH/.git" ]; then
  git -C "$LOCAL_PATH" fetch origin
  git -C "$LOCAL_PATH" checkout "$BRANCH"
  git -C "$LOCAL_PATH" reset --hard "origin/$BRANCH"
else
  mkdir -p "$WORKDIR"
  git clone "https://github.com/$OWNER/$REPO_NAME.git" "$LOCAL_PATH"
  git -C "$LOCAL_PATH" checkout "$BRANCH"
fi
```

Detect the default branch:

```bash
DEFAULT_BRANCH=$(git -C "$LOCAL_PATH" symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||')
DEFAULT_BRANCH="${DEFAULT_BRANCH:-main}"
```

### Step 3 — Spawn the sub-agent

Spawn the `pr-reviewer` sub-agent via the `Agent` tool
(`subagent_type: task-agent:pr-reviewer`), passing all resolved values in the prompt so the agent can substitute them for `OWNER`, `REPO_NAME`, `PR_NUMBER`, `BRANCH`, `LOCAL_PATH`, `DEFAULT_BRANCH` and `RUN_CHECKS`.

### Step 4 — Relay the report

Print the agent's report verbatim. The review comments it posts are marked `<!-- pr-reviewer -->`, which is how `review-fixer` finds them in the next workflow step.

If the agent could not post (for example `gh` is not authenticated), surface that error and stop — do not retry with a different mechanism.
