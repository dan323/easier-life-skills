---
name: pr-reviewer
description: Reviews a pull request (correctness, tests, repo conventions, safety), verifies the repo's own checks in a throwaway worktree, and posts one GitHub review with inline comments (it may create or fetch a local clone and a temporary worktree, but never edits the PR branch or the clone's working files). Thin skill wrapper around the `pr-reviewer` sub-agent — callable as a workflow step, and the stand-in for Copilot review.
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

Validate the target before touching any clone:

```bash
case "$PR_URL" in "https://github.com/$OWNER/$REPO_NAME/pull/"*) ;; *) echo "pr_url does not belong to $repo"; exit 1;; esac
gh pr view "$PR_NUMBER" --repo "$repo" --json headRefName,headRepositoryOwner,headRepository,state
```


### Step 2 — Prepare the local clone

Reuse the `task-agent` workdir convention so the clone is shared with a preceding `task-agent` step in the same workflow:

```bash
WORKDIR="${TASK_AGENT_WORKDIR:-$(python3 -c 'import os,tempfile;print(os.path.join(tempfile.gettempdir(),"task-agent"))')}"
LOCAL_PATH="$WORKDIR/$REPO_NAME"
if [ ! -d "$LOCAL_PATH/.git" ]; then
  mkdir -p "$WORKDIR"
  git clone "https://github.com/$OWNER/$REPO_NAME.git" "$LOCAL_PATH"
fi
git -C "$LOCAL_PATH" fetch origin
```

Verify the reused clone is this repository before using it (clones of different owners can share a name). A GitHub `origin` for a different `owner/repo` is an error; non-GitHub origins (local mirrors) are accepted:

```bash
ORIGIN=$(git -C "$LOCAL_PATH" remote get-url origin)
case "$ORIGIN" in
  *github.com[:/]*) SLUG=$(printf '%s' "$ORIGIN" | sed -E 's#.*github.com[:/]##; s#\.git$##')
    [ "$(printf '%s' "$SLUG" | tr A-Z a-z)" = "$(printf '%s' "$repo" | tr A-Z a-z)" ] || { echo "$LOCAL_PATH is a clone of $SLUG, not $repo"; exit 1; } ;;
esac
```

The reviewer never checks out, resets or otherwise modifies `LOCAL_PATH`: the sub-agent fetches the PR head (`refs/pull/PR_NUMBER/head`, which also works for fork PRs) and reviews a detached worktree at the exact `headRefOid`, so uncommitted work in a reused clone is safe and `branch` is informational.

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

### Step 5 — Emit workflow output

If the `$WORKFLOW_OUTPUT` environment variable is set (this skill is running as a workflow step), write a JSON object so a later step, or a loop's `until:`, can act on the result — for example "review, fix, repeat until `steps.review.output.findings == 0`":

```bash
if [ -n "$WORKFLOW_OUTPUT" ]; then
  printf '{"findings":%s,"posted":%s,"already_raised":%s,"review_url":"%s","commit":"%s"}' \
    "$FINDINGS" "$POSTED" "$ALREADY_RAISED" "$REVIEW_URL" "$HEAD_OID" > "$WORKFLOW_OUTPUT"
fi
```

- `posted` is `N` from the report's `Posted (N)`; `already_raised` is `N` from `Already raised (N)`.
- `findings` is `posted + already_raised`: findings the reviewer still considers open on this commit, whether it just posted them or they were raised earlier and not yet resolved. `0` means the review was clean.
- `review_url` is the posted review's URL, or empty when no review was posted; `commit` is the reviewed `headRefOid`.

Skip this step when `$WORKFLOW_OUTPUT` is unset (standalone invocation). Take the counts from the agent's report relayed in Step 4. If the review could not be posted because of an error, stop as in Step 4 and write nothing, so the step fails instead of looking clean.
