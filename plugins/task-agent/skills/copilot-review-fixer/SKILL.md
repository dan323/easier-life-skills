---
name: copilot-review-fixer
description: Reads unresolved Copilot review comments on a pull request and applies code fixes for actionable ones. Thin skill wrapper around the `copilot-review-fixer` sub-agent — callable as a workflow step.
tools: Bash, PowerShell, Read, Edit, Glob, Grep, Agent, mcp__github__pull_request_read
---

# Copilot Review Fixer

Wraps the `task-agent:copilot-review-fixer` sub-agent so it can be invoked as a workflow step.

**Arguments** (key=value form):
- `pr_url=<url>` — full GitHub PR URL (e.g. `https://github.com/owner/repo/pull/42`). Required.
- `repo=<owner/repo>` — repository in `owner/repo` format. Required.
- `branch=<branch>` — branch name the PR is on. Required.

## What to do

### Step 1 — Parse arguments

Parse `pr_url`, `repo`, and `branch` from the invocation arguments.

Derive:
- `OWNER` and `REPO_NAME` from `repo` (split on `/`)
- `PR_NUMBER` from the last path segment of `pr_url`

If any required argument is missing or cannot be parsed, stop and report the error clearly.

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

Spawn the `copilot-review-fixer` sub-agent via the `Agent` tool
(`subagent_type: task-agent:copilot-review-fixer`), passing all resolved values in the
prompt so the agent can substitute them for `OWNER`, `REPO_NAME`, `PR_NUMBER`, `BRANCH`,
`LOCAL_PATH`, and `DEFAULT_BRANCH`.
