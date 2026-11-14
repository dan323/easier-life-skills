---
name: pr-reviewer-workflow
description: Workflow adapter for `pr-reviewer`: runs it with the step args and writes `findings`, `posted`, `already_raised`, `review_url` and `commit` to `$WORKFLOW_OUTPUT`, so a workflow can loop `until: ${{ steps.review.output.findings == 0 }}`. Use `pr-reviewer` directly outside workflows.
tools: Skill, Bash, Read
---

# pr-reviewer-workflow

Workflow adapter for the `pr-reviewer` skill. It holds no logic of its own: it passes the step's `args` to `pr-reviewer`, then copies that skill's `result` block into `$WORKFLOW_OUTPUT`. Reference it from a workflow step as `skill: pr-reviewer-workflow`; everyone else should use `pr-reviewer` directly.

**Arguments**: the same `key=value` arguments as `pr-reviewer` (`pr_url`, `repo`, `branch`, `checks`); pass them through unchanged.

**Output keys** (`steps.<id>.output.<key>`):
- `findings` (number) — open findings on the reviewed commit; `0` means clean
- `posted` (number), `already_raised` (number)
- `review_url` (string, empty when no review was posted)
- `commit` (string) — the reviewed head commit

## What to do

### Step 1 — Run the generic skill

Invoke `pr-reviewer` through the `Skill` tool with the arguments you received, unchanged. Run it inline; do not spawn another agent for this hop. If it fails or stops with an error, stop with the same error and write nothing to `$WORKFLOW_OUTPUT`, so the step fails.

### Step 2 — Read the result block

Take the last fenced `json` block that follows the `result:` label in the skill's report and parse it. If it is missing or is not valid JSON, stop and report that clearly; do not guess values from the prose.

### Step 3 — Write `$WORKFLOW_OUTPUT`

Write the result block's `findings`, `posted`, `already_raised`, `review_url` and `commit` keys, unchanged, as one JSON object:

```bash
printf '%s' "$RESULT_JSON" > "$WORKFLOW_OUTPUT"
```

Print the generic skill's report as your own, so the step's stdout stays useful. If `$WORKFLOW_OUTPUT` is unset, just print the report and write nothing.
