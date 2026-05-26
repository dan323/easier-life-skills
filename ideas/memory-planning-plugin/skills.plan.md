# memplan — Skills Reference

## `memplan/start` — orient at session start

Triggered manually or by a PreToolUse hook on the first tool call of a session.

1. **Process inbox** — if `.memplan/inbox/` contains any `.feedback` files, call `memplan/inbox` before anything else
2. Read `progress` (1 line) → know where we are
3. Read `checkpoint.mem` → last action, next action, open questions
4. Read `persona.mem` → style rules and constraints
5. Read `hot.mem` (5 lines) → which files are likely relevant
6. Grep `aliases.mem` for any terms in the user's first message
7. Print a 3-line summary: current step / next step / active constraints (note any inbox feedback applied)
8. **If `steps.mem` is absent**: append a one-line warning to the summary — "⚠ No steps.mem found — implementation cannot start until steps are defined." Orient completes normally; no halt.
9. **Check `stale.mem`**: for each entry, append a warning line — "⚠ FILE may be stale (SOURCE changed on DATE) — review before acting." Orient completes normally; no halt.

Agent reads only `.mem` files. Total token cost: ~50–80 tokens (+ ~30 if inbox had entries).

---

## `memplan/inbox` — process pending feedback

Called automatically by `memplan/start` when `.memplan/inbox/` is non-empty.
Can also be called manually to flush the inbox mid-session.

For each `.feedback` file (sorted by modification time, oldest first):
1. Parse FeedScript v1 operations line by line (see `feedback-language.plan.md`)
2. Temporarily unlock affected `.mem` files
3. Apply each operation to the relevant `.mem` file(s) in order
4. For ambiguous or conflicting operations: append to `questions.mem`, skip
5. Regenerate all affected `.plan.md` files from updated `.mem`; re-lock
6. Delete the processed `.feedback` file
7. Append summary to `decisions/log.mem`: `~DATETIME +inbox:tool=NAME,ops=#N,errors=#E`

---

## `memplan/plan` — create or update the plan

Takes a task description and produces `plan.plan.md` + `plan.mem` (numbered checklist, ≤20 steps)
and `slice.plan.md` + `slice.mem` (the next ≤5 atomic steps, ready to act on immediately).

Before writing, checks:
- `failures.mem` — anything similar that failed before?
- `risk.mem` — any open risks for this area?
- `entities.mem` — known domain concepts in the task description?
- `decisions/log.mem` — prior decisions that constrain this task?

For each step, the agent infers `deps` from the task description and any explicit ordering cues:
- Steps with no predecessor get no `deps` field (immediately executable).
- Steps blocked on one or more prior steps get `deps=A|B|…` (pipe-separated step IDs).
- Two steps that are independently executable get no `deps` on each other even if they follow a common predecessor — they form a parallelisable frontier once their shared dependency completes.
- `memplan/slice` uses `deps` to build the ready frontier: the set of not-yet-started steps whose every listed dependency is complete. It surfaces this set rather than always picking `current+1`.

After writing `plan.mem`, writes `progress` → `0/N | not started` where N is the step count.
This ensures `memplan/start` can read a valid `progress` on the very first orient after planning.

Writes `risk.plan.md` + `risk.mem` if the task touches ≥3 files or any irreversible operation.

---

## `memplan/act` — step execution wrapper

Wraps a single plan step.

**Pre-flight (hard halts — in order)**:
1. If `steps.mem` is absent: halt. Never execute work without defined steps.
2. Check `deps` on the target step. If any listed dep step is not yet complete: halt and output "⚠ Step N cannot start — deps [X, Y] not complete."
3. Check `stale.mem` for any file this step will read. If a dependency is stale: halt and output "⚠ FILE is stale — resolve via inbox or `memplan/review` before proceeding."

**Execution**:
1. Read `progress` to confirm correct step
2. Execute the step
3. Update `progress` in-place
4. Append to `code-map.plan.md` + `code-map.mem` for any files touched
5. Append to `entities.plan.md` + `entities.mem` for any new concepts discovered
6. If step fails: append to `failures.plan.md` + `failures.mem`; flag in `questions.plan.md` + `questions.mem` if cause unknown

**Post-write staleness propagation**:
7. For every `.mem` file written this step, look up `deps.mem` for files that list it as a source
8. For each dependent found: append `~DATETIME +stale:file=DEPENDENT,because=SOURCE,session=~DATE` to `stale.mem`

**Stale resolution (without `memplan/review`)**:
When the pre-flight halts on a stale file, the agent may resolve it inline:
1. Read the stale file and all its sources from `deps.mem`
2. Update the stale file if needed
3. Append `~DATETIME +stale-resolved:file=FILE,session=~DATE` to `stale.mem`
   (entries with a matching `stale-resolved` are treated as cleared by `memplan/start` and `memplan/act`)
4. Resume execution

---

## `memplan/record` — end-of-session close

1. Write `checkpoint.plan.md` + `checkpoint.mem` (last action / next action / open questions)
2. Write `sessions/YYYY-MM-DD.plan.md` + `sessions/YYYY-MM-DD.mem` digest (≤10 bullets)
3. Update `hot.plan.md` + `hot.mem` with files touched this session
4. Update `budget.plan.md` + `budget.mem` with observed load costs
5. Delete `risk.plan.md` + `risk.mem` if the multi-file change completed cleanly
6. Append any new aliases or facts discovered during the session (both forms)

---

## `memplan/refine` — divide-and-conquer step decomposition (optional)

Decomposes one or more steps that are too large or ambiguous into smaller, atomic
sub-steps. Optional — only run when the agent or human judges a step too coarse to
act on directly.

### Invocation

```
memplan/refine              # refine all steps not yet marked atomic
memplan/refine step=N       # refine a single step
memplan/refine step=N depth=D  # refine recursively up to depth D (default: 2)
```

### Atomicity criterion

A step is considered non-atomic if any of the following are true:
- It touches or mentions more than 2 distinct files
- It contains more than one independent verb clause (e.g. "write X and update Y and verify Z")
- The agent cannot express a single, verifiable done-condition for it

If a step passes all three checks it is marked `atomic=true` and skipped.

### Sub-step numbering

Step `N` decomposes into `N.1`, `N.2`, … `N.K`. Each sub-step can itself decompose
to `N.M.1`, `N.M.2`, … up to the depth limit. The original step N is kept in
`steps.mem` as a summary header, marked `refined=true`:

```
+step:id=3,text=implement dual-file write helper,refined=true
+step:id=3.1,text=write references/dual-file-write.md with unlock/write/re-lock procedure,atomic=true
+step:id=3.2,text=add generated-file header template to references/dual-file-write.md,deps=3.1,atomic=true
+step:id=3.3,text=verify helper invoked correctly in memplan/plan SKILL.md,deps=3.1|3.2,atomic=true
```

Sub-step `deps` use the same pipe-separated format as top-level step deps. The scope is
local: `deps=3.1` means sub-step 3.1 of the same parent, not top-level step 3.1.

### Execution

1. Read `steps.mem` — collect target steps (one or all non-atomic)
2. For each target step, in order:
   a. Read the step text and any context from `plan.mem` and `checkpoint.mem`
   b. Check atomicity criteria — if atomic, mark `atomic=true` and skip
   c. Generate sub-steps; verify each sub-step is independently executable and verifiable
   d. Append sub-step lines to `steps.mem`; update original step with `refined=true`
   e. If `depth > 1`: recursively apply to any sub-step that fails atomicity check
3. Update `progress` denominator: **N = number of leaf steps** (steps that are `atomic=true`
   or have no sub-steps). Refined parent steps (`refined=true`) contribute 0 to N.
   M = number of leaf steps whose status is complete.
   This makes `progress` a stable fraction even after repeated refinements — adding
   sub-steps changes the denominator precisely, not approximately.
4. Regenerate `steps.plan.md` from updated `steps.mem`; re-lock
5. Append to `decisions/log.mem`: `~DATETIME +decision:refined=N,sub-steps=K`

### `memplan/act` behaviour for refined steps

When `memplan/act` encounters a step marked `refined=true`, it does not execute it
directly. Instead it reads the sub-steps (`id=N.1`, `N.2`, …) and executes each in
order, updating `progress` at the sub-step level. The parent step is marked complete
only when all sub-steps are complete.

### Idempotency

Re-running `memplan/refine` on an already-refined step is a no-op — steps already
marked `refined=true` or `atomic=true` are skipped unless `force=true` is passed.

---

## `memplan/decide` — record a decision

One-shot: appends a row to `decisions/log.plan.md` + `decisions/log.mem`:
`~DATETIME +decision:choice=TEXT,because=TEXT`

Called by the agent whenever it makes a non-obvious choice.

---

## `memplan/ask` — record an open question

Appends to `questions.plan.md` + `questions.mem`:
`~DATETIME +question:id=ID,text=TEXT,status=open`

ID is the ISO8601 timestamp of the question (e.g. `2026-05-25T14:30Z`) — always unique,
no counter state required.

When the `ANSWER qid=ID` FeedScript op is processed by `memplan/inbox`, it does NOT
remove the original question line (preserving append-only semantics). Instead it appends:
`~DATETIME +question-answer:id=ID,text=TEXT`

A question is considered resolved when a `question-answer` line exists with a matching ID.
`memplan/start` and `memplan/act` treat any question with a matching answer as closed.
`memplan/review` compacts question + answer pairs into a single `+decision` line and
removes both originals.

This prevents the same question from being asked twice: before appending, the agent greps
`questions.mem` for an open question with matching text (no answer line) and skips if found.

---

## `memplan/init` — bootstrap a new project

Run once when `.memplan/` does not exist. Creates the full directory structure with
empty/default files, sets permissions, and writes the initial `deps.mem`.

1. Create `.memplan/` and all subdirectories (`memory/`, `decisions/`, `inbox/`, `sessions/`)
2. Write `progress` → `0/0 | not started`
3. Write `branch-intent` → `(not set)`
4. Write `deps.mem` from the fixed template embedded in the plugin (from `dependencies.plan.md`); write `deps-closure.mem` (transitive closure) immediately after
5. Create empty stubs for all Phase 1 `.mem` files: `checkpoint.mem`, `persona.mem`, `hot.mem`, `plan.mem`, `questions.mem`, `decisions/log.mem`, `stale.mem`
6. Generate `.plan.md` counterparts for all stubbed files; lock all `.plan.md` files
7. Print: "memplan initialised. Run `memplan/plan` to define your steps."

If `.memplan/` already exists, `memplan/init` does nothing and prints: "Already initialised — run `memplan/start` to orient."

---

## `memplan/gaps` — find gaps in the plan

Reads all plan files and checks for contradictions, missing definitions, and uncovered
scenarios. Human-initiated. Output is a numbered gap list — no files are written.

Checks performed:
1. **Undefined references** — every file, skill, and key name referenced in any plan file exists somewhere in the plan
2. **Contradictions** — any rule stated in one file that conflicts with a rule in another (e.g. "append-only" vs "remove line")
3. **Missing behaviours** — skills that reference a condition with no defined outcome (e.g. "if X, then ?" left blank)
4. **Phase ordering violations** — any skill referenced in Phase N that is not defined until Phase M > N
5. **Uncovered error paths** — operations or states with no defined error handling
6. **Format inconsistencies** — examples that use syntax not defined in the grammar (e.g. undeclared separators)
7. **Circular dependencies** — cycles in `deps.mem` that would cause infinite staleness propagation
8. **Missing documentation step** — if the plan touches ≥1 file matching `README*`, `CHANGELOG*`, `SKILL.md`, `*.plan.md`, or any file that exports a public interface (detected by filename pattern or step text containing words like `api`, `export`, `command`, `skill`, `agent`, `endpoint`), AND no step's `text` contains `doc`, `readme`, `changelog`, or `spec` — flag as a gap. Suggested fix: add a documentation step with `deps` pointing to the last implementation step that settles the public shape, or note explicitly that a separate doc skill will be run post-completion.

Output format: numbered list, one gap per item, each with: file where gap was found, description, suggested fix direction. No prose padding.

---

## `memplan/review` — weekly memory hygiene

Human-initiated, not automatic.

1. Read `stale.mem` — collect unresolved entries (those without a matching `+stale-resolved:` line); process each: read file and sources, update if out of date
2. Rewrite `stale.mem` retaining only entries that remain unresolved after step 1
3. Read all append-only `.mem` files (authoritative)
4. In `questions.mem`: compact each `+question` / `+question-answer` pair into a single `+decision` line; remove both originals
5. Remove duplicate lines and entries superseded by later ones across all files
6. Compact `entities.mem` and `facts.mem` to remove noise; enforce line caps
7. Regenerate all corresponding `.plan.md` files from the cleaned `.mem` data (re-lock after each)
8. Produce a one-paragraph human-readable summary of what was learned in the period

`memplan/review` is the only skill that bulk-rewrites `.plan.md` files and resolves `stale.mem` entries.
All other skills append or replace individual keys.
