---
name: auto-board-task
description: >
  Process the top Todo card on a GitHub Project (v2) board end-to-end:
  pull the board into a task-agent `tasks.yml`, run `task-agent` to
  open a PR for the top pending task, then sync the PR back to the
  card. Use when the user says "work on the next task", "do the next
  board task", "pick up the next GitHub project item", "process the
  next card", "work on the next item in github project", "run the
  next board task", "drain the top todo", "process the top board
  todo", "auto-process the next card", or any phrasing that means
  "take the next pending item from a GitHub Project board and
  implement it". Composes `gh-project-sync` → `task-agent` →
  `gh-project-sync` via the `workflow` skill against the fixed YAML
  at `${CLAUDE_PLUGIN_ROOT}/workflows/auto-board-task.yaml`. All
  arguments are forwarded verbatim to the workflow runner;
  validation happens there and inside the composed sub-skills.
tools: Bash
---

# Auto Board Task

Invoke the `workflow` skill **in the current conversation** on the
bundled
[`workflows/auto-board-task.yaml`](../../workflows/auto-board-task.yaml),
forwarding the user's `key=value` arguments verbatim.

The workflow chains:

1. `gh-project-sync` — reconcile the board into `tasks.yml`.
2. `task-agent` — open a PR for the top pending task.
3. `gh-project-sync` — sync the PR back to its card.

This SKILL does no parsing and no validation of its own. The workflow
runner validates against the YAML's `inputs:` declarations and the
composed sub-skills validate their own argument grammar.

## What to do

Expand `${CLAUDE_PLUGIN_ROOT}` to an absolute path for the workflow
YAML (relative paths won't survive the move into the workflow runner's
working directory):

```bash
WORKFLOW_PATH="${CLAUDE_PLUGIN_ROOT}/workflows/auto-board-task.yaml"
echo "$WORKFLOW_PATH"
```

Then invoke the `workflow` skill with the **`Skill` tool — not the
`Agent` tool**:

```
Skill(skill="workflow", args="<absolute WORKFLOW_PATH> <user args verbatim>")
```

The workflow runner prints its own per-step status block — relay it
as-is once the `Skill` invocation returns.

## Do not:

- Use the `Agent` tool to invoke the workflow. It looks like the
  natural choice but the sub-agent's tool list comes up wrong for
  the runner — `workflow` only works when it runs inline via `Skill`.
- Reparse or re-validate the user's arguments here. The workflow
  runner and the composed sub-skills (`gh-project-sync`,
  `task-agent`) own validation; duplicating it drifts.
- Call `gh-project-sync` or `task-agent` directly. The composition
  is the point — bypass defeats it.
- Modify the workflow YAML at runtime. Users who want a different
  pipeline should write their own YAML and invoke `workflow` directly.
