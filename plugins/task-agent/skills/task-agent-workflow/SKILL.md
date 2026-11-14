---
name: task-agent-workflow
description: Workflow adapter for `task-agent`: runs it with the step args and writes `pr_url`, `repo` and `branch` (plus `status`) to `$WORKFLOW_OUTPUT` so later steps can review or sync the PR. Use `task-agent` directly outside workflows.
tools: Skill, Bash, Read
---

# task-agent-workflow

Workflow adapter for the `task-agent` skill. It holds no logic of its own: it passes the step's `args` to `task-agent`, then copies that skill's `result` block into `$WORKFLOW_OUTPUT`. Reference it from a workflow step as `skill: task-agent-workflow`; everyone else should use `task-agent` directly.

**Arguments**: the same `key=value` arguments as `task-agent` (`tasks`, `run`, and any others `task-agent` accepts); pass them through unchanged.

**Output keys** (`steps.<id>.output.<key>`):
- `status` (string) — `done` or `skipped`
- `pr_url`, `repo` (`owner/repo`), `branch` — only when `status` is `done`, so `if: ${{ steps.<id>.output.pr_url }}` skips downstream steps when no PR was opened

## What to do

### Step 1 — Run the generic skill

Invoke `task-agent` through the `Skill` tool with the arguments you received, unchanged. Run it inline; do not spawn another agent for this hop. If it fails or stops with an error, stop with the same error and write nothing to `$WORKFLOW_OUTPUT`, so the step fails.

### Step 2 — Read the result block

Take the last fenced `json` block that follows the `result:` label in the skill's report and parse it. If it is missing or is not valid JSON, stop and report that clearly; do not guess values from the prose.

### Step 3 — Write `$WORKFLOW_OUTPUT`

Write `status` and, when `status` is `done`, `pr_url`, `repo` and `branch` from the result block as one JSON object. For `skipped` write `status` and `reason`. For `failed`, stop with the block's `error` and write nothing.

```bash
printf '%s' "$RESULT_JSON" > "$WORKFLOW_OUTPUT"
```

Print the generic skill's report as your own, so the step's stdout stays useful. If `$WORKFLOW_OUTPUT` is unset, just print the report and write nothing.
