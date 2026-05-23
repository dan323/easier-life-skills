---
name: task-agent
description: >
  Reads a list of tasks in a yaml to be done in certain github repos. Agents clone the repo, do the task,
  commit the changes and create a PR. Not to be called automatically by Claude by any means.
tools: Bash, PowerShell, Read, Write, Edit, Glob, Grep, Agent, TaskCreate, TaskUpdate, mcp__github__search_repositories, mcp__github__create_pull_request
model: opus
---

# Task Agent

Each invocation does **exactly one task**: the next pending item from the tasks file.
The same file (or a sibling state file, in legacy mode) tracks completion, so reruns
always pick up where the previous run left off.

**Arguments** (all optional, `key=value` form):
- `tasks=<path>` — path to the tasks file. Default: `agent-tasks.yml` or `agent-tasks.yaml` in cwd.
- `state=<path>` — path to a separate state file. Forces legacy mode. Default: auto-derived (`<stem>-state.yml`) and only used if the tasks file is in legacy format.

**Two file formats are supported:**
- **Unified** (preferred): one file holds tasks *and* their completion status. Each task has an `id`, a `description`, and a `status` (`pending` | `done` | `failed` | `skipped`). On completion the same entry gains `branch`, `pr_url`, `date`. Unknown keys (e.g. `external_ref`, `labels`, `priority`) are preserved verbatim across rewrites so external sync tools can attach metadata.
- **Legacy**: two files — a tasks file with bare-string tasks and a separate `*-state.yml` listing completed entries. Auto-detected when the tasks file has no `status:` field. Existing setups keep working unchanged.

See [`../../references/format.md`](../../references/format.md) for the full schema, the status enum, and the passthrough-metadata contract.

**Prereqs:** `python3`, `git`.

---

## Task Tracking

Before doing any work, call `TaskCreate` for each phase below. Call `TaskUpdate` (status `in_progress`) when you begin a phase and `TaskUpdate` (status `completed`) when you finish it.

- Load config and state
- Prepare repository
- Execute task and open PR
- Update state and report

---

## Phase 1 — Load config and state

### 1.1 Resolve file paths from arguments

Parse `tasks=<path>` and `state=<path>` from the invocation arguments. If `tasks=` is not
given, search the current directory for `agent-tasks.yml` then `agent-tasks.yaml`. Stop and
show the expected format if no file is found.

### 1.2 Parse the tasks file and auto-detect the mode

All YAML reading and writing goes through the helper script
`${CLAUDE_PLUGIN_ROOT}/scripts/tasks_io.py`, which guarantees that unknown keys on task
entries (e.g. `external_ref`, `labels`) survive every round-trip. The script's contract:

- **Unified mode** — auto-detected when any task in the file is an object carrying a
  `status:` field. The tasks file is the single source of truth; no state file is read.
- **Legacy mode** — every other shape (bare strings, dicts without `status`). The script
  reads the state file from the explicit `state=<path>` argument if given, else from
  `<tasks-stem>-state.yml` next to the tasks file. A missing state file is treated as empty.
- **Normalization** — every task is returned as `{repo, id, description, status, ...}`.
  Missing ids are synthesized as `md5(repo + "\n" + description)[:6]`; missing statuses
  default to `done` (legacy task whose `(repo, description)` is in `state.completed`) or
  `pending`.

Invoke it and capture the JSON:

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/tasks_io.py" load "$TASKS_PATH" \
  ${STATE_PATH:+--state "$STATE_PATH"}
```

Remember the `mode` field from the output — Phase 4 needs it to write back in the same
format.

### 1.3 Pick the next pending task

Walk the normalized list in order and pick the first task whose `status == 'pending'`.
Tasks with `status` of `done`, `failed`, or `skipped` are passed over silently (failures
and skips were intentional outcomes of earlier runs).

If nothing is pending, tell the user — all done, nothing left to do.

Print the chosen task clearly before proceeding:
```
Today's task:
  Repo:  owner/repo-name
  ID:    abc123
  Task:  "Add unit tests for the authentication module"
```

---

## Phase 2 — Prepare the repo

Only clone the **one repo** containing today's task if not already cloned locally.
Each repo lives under a `task-agent` directory in the OS temp dir (so the local clone
is reused across runs and Windows/Linux/macOS all work). The exact base directory is:

```bash
WORKDIR="${TASK_AGENT_WORKDIR:-$(python3 -c 'import os,tempfile;print(os.path.join(tempfile.gettempdir(),"task-agent"))')}"
```

Override with the `TASK_AGENT_WORKDIR` env var if you need a different location (e.g. a
persistent disk on a build agent).

Spawn a new agent to do this phase.

### 2.1 Determine the default branch

Call `mcp__github__search_repositories` with `query: "repo:OWNER/REPO_NAME"` and
`minimal_output: false`. Read the `default_branch` field from the returned repository object.

### 2.2 Clone or update the repo locally

```bash
LOCAL_PATH="$WORKDIR/REPO_NAME"

if [ -d "$LOCAL_PATH/.git" ]; then
  git -C "$LOCAL_PATH" fetch origin
  git -C "$LOCAL_PATH" checkout DEFAULT_BRANCH
  git -C "$LOCAL_PATH" reset --hard origin/DEFAULT_BRANCH
else
  mkdir -p "$WORKDIR"
  git clone "https://github.com/OWNER/REPO_NAME.git" "$LOCAL_PATH"
fi
```

---

## Phase 3 — Execute the task

Spawn a new agent to do this phase.

### 3.1 Create a branch name

Slugify the task text and append a short hash for uniqueness:

```bash
TASK="<today's task text>"
SLUG=$(echo "$TASK" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/-\+/-/g' | sed 's/^-\|-$//g' | cut -c1-45)
HASH=$(echo "$TASK" | python3 -c "import sys,hashlib; print(hashlib.md5(sys.stdin.read().encode()).hexdigest()[:6])")
BRANCH="task/${SLUG}-${HASH}"
```

### 3.2 Create the branch

```bash
git -C "$LOCAL_PATH" checkout DEFAULT_BRANCH
# -B is idempotent: creates the branch, or resets it to the current commit if a stale
# copy was left behind by an interrupted prior run.
git -C "$LOCAL_PATH" checkout -B "$BRANCH"
```

### 3.3 Spawn a new subagent to implement the task

```
You are working on a git repository located at: LOCAL_PATH
Repository: OWNER/REPO_NAME
Current branch: BRANCH_NAME

Your task:
TASK_DESCRIPTION

Instructions:
1. Read the codebase to understand its structure and conventions.
2. Implement the task — be focused, do only what is asked.
3. Stage your changes: git -C LOCAL_PATH add -A
4. Commit with a clear message: git -C LOCAL_PATH commit -m "YOUR_MESSAGE"
   If nothing needed to change (task already done), say so explicitly instead.
5. Do NOT push — the caller handles that.

Return a short paragraph summarising what you changed and why.
```

### 3.4 Push the branch

```bash
git -C "$LOCAL_PATH" push origin "$BRANCH" --force-with-lease
```

If there are no commits to push, mark the task as "nothing to commit" and skip to Phase 4
(still update state so we don't retry it tomorrow).

### 3.5 Open the PR

Call `mcp__github__create_pull_request` with:
- `owner`: OWNER
- `repo`: REPO_NAME
- `title`: TASK_DESCRIPTION
- `head`: BRANCH
- `base`: DEFAULT_BRANCH
- `body`:
  ```
  ## Summary

  AGENT_SUMMARY

  ---
  *Opened by multi-repo-tasks via Claude Code.*
  ```

Capture the `html_url` field from the response as the PR URL.
Extract the PR number from the URL (last path segment).

Immediately after the PR is open, **spawn Phase 5 in the background** (run_in_background: true),
passing it: OWNER, REPO_NAME, PR_NUMBER, BRANCH, LOCAL_PATH, DEFAULT_BRANCH.
Then continue to Phase 4 without waiting for Phase 5 to finish.

---

## Phase 4 — Update state and report

The write path branches on the mode detected in Phase 1. Both branches must preserve every
key the user (or an external sync tool) put on the task — never drop unknown fields.

### 4.1 Determine the outcome status

Pick one of:
- `done` — the agent committed changes and a PR was opened (or the task was already done
  and there was nothing to commit). Always sets `branch`, `date`. Sets `pr_url` when a PR
  was opened.
- `failed` — the agent could not complete the task. Sets `error: "<short reason>"`.
- `skipped` — the task is no longer applicable (e.g. repo gone). Sets `reason: "<why>"`.

### 4.2 Write back via tasks_io.py

The same helper script does the writeback, picking the right strategy based on the mode
detected in Phase 1:

- **Unified mode** — the task entry's `status` flips in place and the completion keys
  (`branch`, `pr_url`, `date`, or `error` / `reason`) are merged onto it. Unknown keys on
  the entry are preserved.
- **Legacy mode** — the task is removed from the tasks file (the project is dropped if its
  task list becomes empty) and a new entry with the same metadata is appended under
  `completed:` in the state file.

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/tasks_io.py" record "$TASKS_PATH" \
  --mode "$MODE" \
  --task-id "$TASK_ID" \
  --repo "$REPO" \
  --description "$TASK_DESCRIPTION" \
  --status "$NEW_STATUS" \
  ${STATE_PATH:+--state "$STATE_PATH"} \
  --completion-json "$COMPLETION_JSON"
```

`COMPLETION_JSON` is a JSON object — for `status=done` use
`{"branch": "...", "pr_url": "...", "date": "YYYY-MM-DD"}`; for `failed` use
`{"error": "<short reason>"}`; for `skipped` use `{"reason": "<why>"}`.

### 4.3 Print the summary

```
## Task — Done

✅  owner/repo-name
    Task:   "Add unit tests for the authentication module"
    Branch: task/add-unit-tests-abc123
    PR:     https://github.com/owner/repo-name/pull/42

Progress: 1 of 5 tasks completed across 2 repos.
Next up:  "Fix the typo in README.md" (owner/repo-name)
```

- Show **progress** as completed/total across all projects.
- Show **next up** so the user knows what the next run will do.
- If this was the last task, congratulate the user — all done.


---

## Phase 5 — Remove all temporary files

After all tasks are done, spawn an agent to clean up the local clones in `$WORKDIR` to
free up disk space:

```bash
rm -rf "$WORKDIR"
```

---

## Rules
- There are 2 mcps for GitHub. One is `github` and the other is `github2`. Use `github2` only to create and manage PRs into repos that are not owned by me.
- In /references there are more context to read. These files relate to programming languages, package manager, etc. Read only those that make sense for the task at hand.