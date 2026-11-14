---
name: review-fixer-workflow
description: Workflow adapter for `review-fixer`: runs it with the step args and writes `fixed`, `resolved`, `skipped`, `ignored`, `pushed` and `commit` to `$WORKFLOW_OUTPUT`. Use `review-fixer` directly outside workflows.
tools: Skill, Bash, Read
---

# review-fixer-workflow

Workflow adapter for the `review-fixer` skill. It holds no logic of its own: it passes the step's `args` to `review-fixer`, then copies that skill's `result` block into `$WORKFLOW_OUTPUT`. Reference it from a workflow step as `skill: review-fixer-workflow`; everyone else should use `review-fixer` directly.

**Arguments**: the same `key=value` arguments as `review-fixer` (`pr_url`, `repo`, `branch`, `reviewers`, `poll`); pass them through unchanged.

**Output keys** (`steps.<id>.output.<key>`):
- `fixed`, `resolved`, `skipped`, `ignored` (numbers)
- `pushed` (boolean) — whether a commit was pushed
- `commit` (string, empty when nothing was pushed)

## What to do

### Step 1 — Run the generic skill

Invoke `review-fixer` through the `Skill` tool with the arguments you received, unchanged. Run it inline; do not spawn another agent for this hop. If it fails or stops with an error, stop with the same error and write nothing to `$WORKFLOW_OUTPUT`, so the step fails.

### Step 2 — Read the result block

Take the last fenced `json` block that follows the `result:` label in the skill's report and parse it. If it is missing or is not valid JSON, stop and report that clearly; do not guess values from the prose.

### Step 3 — Write `$WORKFLOW_OUTPUT`

Write the result block's `fixed`, `resolved`, `skipped`, `ignored`, `pushed` and `commit` keys, unchanged, as one JSON object:

```bash
printf '%s' "$RESULT_JSON" > "$WORKFLOW_OUTPUT"
```

Print the generic skill's report as your own, so the step's stdout stays useful. If `$WORKFLOW_OUTPUT` is unset, just print the report and write nothing.
