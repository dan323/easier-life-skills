---
name: act
description: >
  Execute a single plan step or refined step with sub-steps: pre-flight checks (missing steps,
  unmet deps, stale reads), run atomic steps directly or iterate through sub-steps for refined
  steps, update progress, record entities/code-map, record failures, propagate staleness to
  dependents. All I/O via memplan-cli.js. Hard-halts on pre-flight failures. Trigger phrases:
  "memplan act", "execute next step", "run step N", "do the next step", "act on step".
tools: Bash, Read, Grep, Edit, Write, TaskCreate, TaskUpdate
---

# memplan/act

Executes a single plan step with pre-flight safety checks and post-write staleness
propagation. Supports both **atomic steps** (executed directly) and **refined steps**
(parent step with sub-steps that are executed in order). The agent provides reasoning;
the CLI handles all file mechanics.

**This skill is mutating.** It writes progress, code-map, entities, failures, and
staleness entries. All file operations go through `memplan-cli.js`.

---

## Phase 1: Pre-flight checks (hard halts)

Run these checks in order. Any failure halts the skill immediately — do not execute
the step until all three pass.

**Check 1 — steps.mem exists:**

```bash
test -f .memplan/steps.mem || echo "MISSING"
```

If `MISSING`: halt and output:
`⚠ Cannot act — .memplan/steps.mem is absent. Run memplan/plan first.`

**Check 2 — determine execution mode (refined vs atomic):**

Read the target step from `.memplan/steps.mem`. Check if it has `refined=true`:

```bash
cat .memplan/steps.mem
```

If the step has `refined=true`:
- Set execution mode to **refined**
- The step will not be executed directly; instead, sub-steps (id=N.1, N.2, etc.) will be executed in order
- Skip to Phase 2 (sub-step execution)

If the step has `atomic=true` or no `refined` field:
- Set execution mode to **atomic**
- Continue with remaining pre-flight checks below

**Check 3 — deps satisfied:**

For atomic steps: If the step has a `deps=` field, verify each listed dep ID is complete by reading `.memplan/progress`:

```bash
cat .memplan/progress
```

For refined steps: Check that all sub-steps exist. For a parent step with id=N and `refined=true`, there must be at least one sub-step with id=N.1, N.2, etc.

For each dep that is not yet complete: halt and output:
`⚠ Step <N> cannot start — deps [<X>, <Y>] not complete.`

**Check 4 — no stale reads:**

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" stale-list .
```

If any unresolved stale entry affects a file this step will read: halt and output:
`⚠ <file> is stale — resolve via memplan/inbox or memplan/review before proceeding.`

To resolve inline: read the stale file and all its sources from `deps.mem`, update the
file if needed, then:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" stale-resolve . "<file>"
```

Resume once resolved.

---

## Phase 2: Execute the step

**For atomic steps (atomic=true or no refined field):**

Read the current step text from `.memplan/steps.mem` and `.memplan/progress`. Confirm
the step number matches what the user intends.

Execute the step. Use the standard project tools (Edit, Write, Bash, etc.) as required
by the step content. Do not modify any `.memplan/` files manually during execution —
use the CLI in Phase 3 for all `.memplan/` writes.

If the step fails (command exits non-zero, tool returns error, or the expected outcome
is not reached): record the failure in Phase 3 and stop execution.

**For refined steps (refined=true):**

Do **not** execute the parent step directly. Instead:

1. Read `.memplan/steps.mem` to find all sub-steps with id=N.1, N.2, N.3, etc., where N is the parent step ID.

2. Read `.memplan/progress` to determine which sub-steps are already complete.

3. For each incomplete sub-step in order (N.1, then N.2, then N.3, etc.):

   a. Check if the sub-step has dependencies via `deps=` field. If so, verify all deps are complete before proceeding.

   b. Execute the sub-step using standard project tools (Edit, Write, Bash, etc.) as required by the sub-step text.

   c. If the sub-step fails: record the failure in Phase 3 and halt. Do not proceed to the next sub-step.

   d. If the sub-step succeeds: proceed to Phase 3 to update progress for this specific sub-step, then continue to the next sub-step.

4. After all sub-steps are complete, mark the parent step (id=N) as complete in Phase 3.

**Important:** Progress tracking for refined steps counts sub-steps, not the parent. If step 3 has sub-steps 3.1, 3.2, 3.3, then completing 3.1 advances progress by 1, completing 3.2 advances by 1, and completing 3.3 advances by 1 and also marks step 3 itself as complete.

---

## Phase 3: Update memplan state

**Update progress:**

For atomic steps:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" progress . <M> <N> "<step-text>"
```

Where `<M>` is the completed step count and `<N>` is the total.

For sub-steps (when executing a refined step):

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" progress . <M> <N> "<sub-step-text>"
```

Where `<M>` is the completed sub-step count (including all previously completed steps and sub-steps) and `<N>` is the total count of all atomic steps and sub-steps.

For the parent refined step (after all sub-steps complete):

Mark the parent step as complete without incrementing the progress counter (sub-steps already counted):

```bash
# Parent step completion is implicit when all sub-steps are done
# No separate progress update needed for the parent itself
```

**Record files touched in code-map:**

For each file created or modified during the step (or sub-step):

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . memory/code-map.mem "file" "path=<path>,purpose=<one-word-purpose>,touched=~<DATE>"
```

**Record new entities discovered:**

For each new concept, symbol, or module encountered during the step, check whether it is
already recorded before appending. Skip if already present:

```bash
if ! grep -qF "name=<name>," .memplan/memory/entities.mem 2>/dev/null; then
  node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . memory/entities.mem "entity" "name=<name>,type=<type>,desc=<description>"
fi
```

Types: `file`, `function`, `class`, `module`, `config`, `concept`.

The `-F` flag ensures fixed-string matching (no regex), and the trailing comma after
`name=<name>,` prevents false matches (e.g., `name=Router,` will not match `name=Router2,`).

Do **not** append an entity whose `name=` value already appears in `entities.mem` — even
if the description differs. This prevents duplicate entries across re-runs.

**Record failure (if step failed):**

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . memory/failures.mem "failure" "cmd=<command>,reason=<reason>"
```

If the cause is unknown, also record an open question:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . memory/questions.mem "question" "id=$(date -u +%Y-%m-%dT%H:%MZ),text=<question>,status=open"
```

Halt on non-zero CLI exit.

---

## Phase 4: Post-write staleness propagation

For every `.memplan/` file written or affected this step, look up dependents in
`deps-closure.mem` and mark them stale:

```bash
cat .memplan/deps-closure.mem
```

For each dependent file whose source was modified:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" stale-mark . "<dependent-file>" "<source-file>"
```

Skip staleness propagation if the step made no changes to files tracked in `deps.mem`.

---

## Phase 5: Confirm

**For atomic steps:**

If the step succeeded, print:
`Step <N> complete. Progress: <M>/<total>.`

If the step failed, print:
`Step <N> failed — failure recorded. Resolve before retrying.`

**For refined steps:**

After each sub-step succeeds, print:
`Sub-step <N.K> complete. Progress: <M>/<total>.`

After all sub-steps complete (parent step complete), print:
`Step <N> complete (all sub-steps done). Progress: <M>/<total>.`

If any sub-step fails, print:
`Sub-step <N.K> failed — failure recorded. Resolve before continuing with remaining sub-steps.`
