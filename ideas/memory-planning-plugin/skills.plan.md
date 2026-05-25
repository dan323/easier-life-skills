# memplan — Skills Reference

## `memplan/start` — orient at session start

Triggered manually or by a PreToolUse hook on the first tool call of a session.

1. **Process inbox first** — if `.memplan/inbox/` contains any `.feedback` files, call `memplan/inbox` before anything else
2. Read `progress` (1 line) → know where we are
3. Read `checkpoint.mem` → last action, next action, open questions
4. Read `persona.mem` → style rules and constraints
5. Read `hot.mem` (5 lines) → which files are likely relevant
6. Grep `aliases.mem` for any terms in the user's first message
7. Print a 3-line summary: current step / next step / active constraints (note any inbox feedback applied)

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

Writes `risk.plan.md` + `risk.mem` if the task touches ≥3 files or any irreversible operation.

---

## `memplan/act` — step execution wrapper

Wraps a single plan step:
1. Read `progress` to confirm correct step
2. Execute the step
3. Update `progress` in-place
4. Append to `code-map.plan.md` + `code-map.mem` for any files touched
5. Append to `entities.plan.md` + `entities.mem` for any new concepts discovered
6. If step fails: append to `failures.plan.md` + `failures.mem`; flag in `questions.plan.md` + `questions.mem` if cause unknown

---

## `memplan/record` — end-of-session close

1. Write `checkpoint.plan.md` + `checkpoint.mem` (last action / next action / open questions)
2. Write `sessions/YYYY-MM-DD.plan.md` + `sessions/YYYY-MM-DD.mem` digest (≤10 bullets)
3. Update `hot.plan.md` + `hot.mem` with files touched this session
4. Update `budget.plan.md` + `budget.mem` with observed load costs
5. Delete `risk.plan.md` + `risk.mem` if the multi-file change completed cleanly
6. Append any new aliases or facts discovered during the session (both forms)

---

## `memplan/decide` — record a decision

One-shot: appends a row to `decisions/log.plan.md` + `decisions/log.mem`:
`~DATETIME +decision:choice=TEXT,because=TEXT`

Called by the agent whenever it makes a non-obvious choice.

---

## `memplan/ask` — record an open question

Appends to `questions.plan.md` + `questions.mem`:
`~DATETIME +question:id=ID,text=TEXT`

Called when the agent hits an unknown it cannot resolve. The human answers via an
`ANSWER qid=ID text="..."` operation in a `.feedback` file. Prevents the same
question from being asked twice.

---

## `memplan/review` — weekly memory hygiene

Human-initiated, not automatic.

1. Read all append-only `.mem` files (authoritative)
2. Remove duplicate lines and entries superseded by later ones
3. Compact `entities.mem` and `facts.mem` to remove noise
4. Regenerate all corresponding `.plan.md` files from the cleaned `.mem` data (re-lock after each)
5. Produce a one-paragraph human-readable summary of what was learned in the period

`memplan/review` is the only skill that bulk-rewrites `.plan.md` files. All other skills
append or replace individual keys.
