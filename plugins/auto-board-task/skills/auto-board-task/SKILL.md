---
name: auto-board-task
description: >
  Process the top Todo card on a GitHub Project (v2) board end-to-end:
  pull the board into a task-agent `tasks.yml`, run `task-agent` to
  open a PR for the top pending task, then sync the PR back to the
  card. Use when the user says "process the top board todo", "run
  the next board task", "drain the top todo", or "auto-process the
  next card". Composes `gh-project-sync` → `task-agent` →
  `gh-project-sync` via the `workflow` skill against the fixed YAML
  at `${CLAUDE_PLUGIN_ROOT}/workflows/auto-board-task.yaml`. All
  arguments are forwarded verbatim to the workflow runner; validation
  happens there and inside the composed sub-skills.
tools: Bash, Agent
---

# Auto Board Task

Spawn one sub-agent that runs the `workflow` skill against the YAML
at [`workflows/auto-board-task.yaml`](../../workflows/auto-board-task.yaml),
forwarding the user's `key=value` arguments unchanged.

This SKILL does no parsing and no validation of its own. The workflow
runner validates against the YAML's `inputs:` declarations and the
composed sub-skills validate their own argument grammar.

## What to do

Spawn exactly one sub-agent via the `Agent` tool
(`subagent_type=claude`) with a prompt that triggers the `workflow`
skill on that path and appends the user's `key=value` arguments:

```text
Run the workflow at the file auto-board-task.yaml with these inputs: <user args verbatim>
```

Surface the sub-agent's report. The `workflow` runner already prints
a per-step status block — relay it as-is.

## Do not:

- Reparse or re-validate the user's arguments here. The workflow
  runner and the composed sub-skills (`gh-project-sync`, `task-agent`)
  own validation; duplicating it drifts.
- Call `gh-project-sync` or `task-agent` directly. The composition
  is the point — bypass defeats it.
- Modify the workflow YAML at runtime. Users who want a different
  pipeline should write their own YAML and invoke `workflow` directly.
