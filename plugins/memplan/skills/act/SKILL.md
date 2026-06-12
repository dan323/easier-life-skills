---
name: act
description: >
  Execute one plan step (or a refined step's sub-steps) with pre-flight dependency
  and staleness checks via the CLI status snapshot, then update progress and memory.
  Trigger: "memplan act", "do the next step", "run step N".
tools: Bash, Read, Grep, Edit, Write, TaskCreate, TaskUpdate
---

# memplan/act

Executes a single plan step with pre-flight safety checks. Supports both **atomic
steps** (executed directly) and **refined steps** (parent step with sub-steps that
are executed in order). The agent provides reasoning; the CLI handles all file
mechanics, including automatic staleness propagation on every write.

**This skill is mutating.** It writes progress, code-map, entities, failures, and
staleness entries. All file operations go through `memplan-cli.js`.

---

## Phase 1: Pre-flight checks (hard halts)

Get the full snapshot in one call — progress, all plan steps (with `deps`, `atomic`,
`refined` fields), checkpoint, and unresolved stale entries as compact JSON:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" status .
```

Run these checks against the JSON. Any failure halts the skill immediately.

**Check 1 — plan exists:** If `plan` is null or `plan.steps` is empty: halt and output:
`⚠ Cannot act — .memplan/plan.mem is absent. Run memplan/plan first.`

**Check 2 — execution mode:** Find the target step in `plan.steps`. If it has
`refined: "true"`, execution mode is **refined** (sub-steps id=N.1, N.2, … will be
executed in order, not the parent). Otherwise mode is **atomic**.

**Check 3 — deps satisfied (atomic steps only):** Use `progress` (format `M/N | <text>`)
to determine completed step IDs. For each `deps` entry of the target step not yet
complete: halt and output:
`⚠ Step <N> cannot start — deps [<X>, <Y>] not complete.`

Skip for refined steps (deps are verified per sub-step).

**Check 3b — sub-steps exist (refined steps only):** There must be at least one step
with id `N.1` in `plan.steps`. If not: halt and output:
`⚠ Refined step <N> has no sub-steps (no N.1, N.2, etc. found). Run memplan/refine first.`

**Check 4 — no stale reads:** If any entry in `stale` affects a file this step will
read: halt and output:
`⚠ <file> is stale — resolve inline (below) or via memplan/review before proceeding.`

To resolve inline: read the stale file and all its sources from `deps.mem`, update the
file if needed, then:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" stale-resolve . "<file>"
```

Resume once resolved.

---

## Phase 2: Execute the step

**For atomic steps (atomic=true or no refined field):**

Use the step text from the Phase 1 `status` JSON. Confirm the step number matches
what the user intends.

Execute the step. Use the standard project tools (Edit, Write, Bash, etc.) as required
by the step content. Do not modify any `.memplan/` files manually during execution —
use the CLI in Phase 3 for all `.memplan/` writes.

If the step fails (command exits non-zero, tool returns error, or the expected outcome
is not reached): record the failure in Phase 3 and stop execution.

**For refined steps (refined=true):**

Do **not** execute the parent step directly. Instead (reusing the Phase 1 `status`
JSON — no extra reads needed):

1. Find all sub-steps with id=N.1, N.2, N.3, etc. in `plan.steps`, where N is the parent step ID.

2. Use `progress` to determine the last completed step. The progress format is `M/N | <last-step-text>`. Parse `<last-step-text>` to extract the last completed step ID (e.g., if text is "sub-step 3.2 text", then step 3.2 is complete). Compare against the sub-step list to find the first incomplete sub-step.

   **Resume logic:** If the progress text matches a sub-step text (e.g., contains "3.1" or matches the sub-step 3.1 text verbatim), that sub-step and all preceding sub-steps are complete. Start from the next sub-step.

3. For each incomplete sub-step in order (N.1, then N.2, then N.3, etc.):

   a. Check if the sub-step has dependencies via `deps=` field. If so, verify all deps are complete before proceeding (by checking if their step text appears in progress or if M >= their step number).

   b. Execute the sub-step using standard project tools (Edit, Write, Bash, etc.) as required by the sub-step text.

   c. If the sub-step fails: record the failure in Phase 3 and halt. Do not proceed to the next sub-step.

   d. If the sub-step succeeds: proceed to Phase 3 to update progress for this specific sub-step, then continue to the next sub-step.

4. After all sub-steps are complete, update progress one final time to mark the parent step as complete (see Phase 3).

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

After all sub-steps of a refined parent are complete, update progress to mark the parent itself as complete. Use the parent step text (not a sub-step text) to signal completion:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" progress . <M> <N> "<parent-step-text>"
```

Where `<parent-step-text>` is the text of the parent step (id=N, not N.1/N.2/etc.). This marks the parent as complete and provides a durable completion signal.

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

Staleness propagation is automatic — every `set`/`append`/`progress` CLI write
marks its dependents stale. No manual `stale-mark` calls are needed.

---

## Phase 4: Confirm

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
