---
name: auto-board-task
description: >
  Take the top Todo card on a GitHub Project (v2) board and carry it
  through: claim it, implement it with `task-agent` (opens a PR), move the
  card to In Review, then review and fix the PR until the review is clean.
  Use for "work on the next task", "do the next board task", "process the
  next card", "drain the top todo", or any request to take the next pending
  item from a GitHub Project board and implement it. Runs the bundled
  workflow via the `workflow` skill; arguments are forwarded to it.
tools: Bash
---

# Auto Board Task

Invoke the `workflow` skill **in the current conversation** on the
bundled
[`workflows/auto-board-task.yaml`](../../workflows/auto-board-task.yaml),
passing the resolved project coordinates as explicit `key=value` args.

## What to do

### Step 1 — Resolve project coordinates

The workflow requires `project_owner` and `project_number` (or
`project_url`). Extract them from the user's message and any
available context (the current repo's remote URL, prior conversation,
`gh` CLI output). The user will phrase this naturally:

| User says                                           | Extract                                                              |
|-----------------------------------------------------|----------------------------------------------------------------------|
| "github project 4 for dan323"                       | `project_owner=dan323 project_number=4`                              |
| "project https://github.com/users/alice/projects/7" | `project_url=https://github.com/users/alice/projects/7`              |
| "project 4" (no owner)                              | infer owner from `gh repo view --json owner`                         |
| No mention                                          | ask: "Which GitHub Project should I use? (owner and number, or URL)" |

Also resolve `default_repo` for draft cards that aren't linked to an
issue. Default: the current repo (`gh repo view --json nameWithOwner`).

### Step 2 — Build the absolute workflow path

```bash
WORKFLOW_PATH="<CLAUDE_PLUGIN_ROOT>/workflows/auto-board-task.yaml"
echo "$WORKFLOW_PATH"
```

Replace `<CLAUDE_PLUGIN_ROOT>` with the base directory shown at the
top of this skill file (the path before `/skills/auto-board-task`).

### Step 3 — Invoke the workflow skill

Use the **`Skill` tool — not the `Agent` tool**:

```
Skill(skill="workflow", args="<WORKFLOW_PATH> project_owner=<owner> project_number=<number> default_repo=<owner/repo>")
```

Or with a URL:

```
Skill(skill="workflow", args="<WORKFLOW_PATH> project_url=<url> default_repo=<owner/repo>")
```

Relay the workflow runner's per-step status block as-is once the
`Skill` invocation returns.

## Do not:

- Use the `Agent` tool to invoke the workflow. It looks like the
  natural choice but the sub-agent's tool list comes up wrong for
  the runner — `workflow` only works when it runs inline via `Skill`.
- Pass the user's raw natural-language message as args. The workflow
  runner expects `key=value` pairs; natural language produces a
  validation error. Always resolve to explicit key=value before
  calling the workflow skill.
- Call `gh-project-sync` or `task-agent` directly. The composition
  is the point — bypass defeats it.
- Modify the workflow YAML at runtime. Users who want a different
  pipeline should write their own YAML and invoke `workflow` directly.
