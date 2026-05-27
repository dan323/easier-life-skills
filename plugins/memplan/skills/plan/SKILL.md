---
name: plan
description: >
  Create or update the implementation plan: writes plan.mem + plan.plan.md (≤20 numbered
  steps) and slice.mem + slice.plan.md (next ≤5 atomic steps). Checks prior failures,
  risks, entities, and decisions. Infers step dependencies. Initialises progress. Writes
  risk files when needed. Sub-agents launched in plan mode. Trigger phrases: "plan this",
  "create a plan", "memplan plan", "define steps", "what are the steps for", "write a plan for".
tools: Bash, Read, Grep, TaskCreate, TaskUpdate, EnterPlanMode, ExitPlanMode
---

# memplan/plan

Creates or updates `plan.mem` + `plan.plan.md` and `slice.mem` + `slice.plan.md` for the
current task. Checks accumulated context before writing. Infers step dependencies to surface
parallelisable frontiers.

**This skill is mutating.** All writes are via `memplan-cli.js`. Sub-agents must be
in plan mode (see Phase 2 note).

---

## Phase 1: Read accumulated context

Read each file before drafting the plan. Use the findings to avoid repeating past failures
and to anchor steps to known entities.

```bash
cat .memplan/memory/failures.mem 2>/dev/null
cat .memplan/risk.mem 2>/dev/null
cat .memplan/memory/entities.mem 2>/dev/null
cat .memplan/decisions/log.mem 2>/dev/null
```

Note any relevant failures, open risks, known entities, and prior decisions. These constrain
the plan — do not write steps that repeat a known failure without a changed approach.

> **Sub-agent rule**: any agent spawned to help analyse the task or draft steps must be
> launched in plan mode via `EnterPlanMode`. This prevents a planning sub-agent from
> writing files while the outer skill is still deciding.

---

## Phase 2: Draft the plan

Produce a numbered list of steps for the task. Rules:

- Maximum 20 steps. If more are needed, group related steps or defer to a follow-on plan.
- Each step has a short `text` (kebab-case description, no spaces) and an optional `deps`
  list of step IDs it cannot start until complete (pipe-separated, e.g. `deps=2|3`).
- Steps with no predecessor get no `deps` field.
- Two steps executable in parallel after a shared predecessor get no `deps` on each other.
- Identify `atomic=true` steps (touch ≤2 files, one verb clause, single verifiable done-condition).

Also draft `slice`: the ≤5 steps on the ready frontier (steps whose `deps` are all
complete, or steps with no deps). These are the first actions to take.

**Risk check**: If the task touches ≥3 files or any irreversible operation (delete, drop,
force-push, migrate), set `needs-risk=true` and draft risk content:
- `what-could-break` — one line
- `irreversible` — one line (or "none")
- `verify-first` — one line

---

## Phase 3: Write plan files

Write each step to `plan.mem`:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" set . plan.mem title "<task-title>"
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" set . plan.mem step-count "#<N>"
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" set . plan.mem status not-started
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . plan.mem step "id=1,text=<text>,atomic=true"
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . plan.mem step "id=2,text=<text>,deps=1,atomic=true"
# ... repeat for each step
```

Initialise progress:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" progress . 0 <N> "not started"
```

Write slice:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" set . slice.mem title "next-steps"
# For each ready step:
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . slice.mem step "id=<ID>,text=<text>"
```

Write risk files if `needs-risk=true`:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" set . risk.mem what-could-break "<text>"
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" set . risk.mem irreversible "<text>"
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" set . risk.mem verify-first "<text>"
```

Halt and report error if any CLI command exits non-zero.

---

## Phase 4: Propagate staleness

For every file written in Phase 3, look up its dependents in `deps-closure.mem` and
mark them stale:

```bash
cat .memplan/deps-closure.mem
```

For each dependent of `plan.mem`, `slice.mem`, `progress`, or `risk.mem` that was written:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" stale-mark . "<dependent>" "<source>"
```

---

## Phase 5: Confirm

Print:

```
Plan written: <N> steps, <K> on ready frontier.
```

If risk was written, append: `Risk file written — review before executing irreversible steps.`

Do not print the full step list unless the user asks.
