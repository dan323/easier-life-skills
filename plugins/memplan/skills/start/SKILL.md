---
name: start
description: >
  Orient at session start: process pending inbox feedback, read
  progress/checkpoint/persona/hot files, print a 3-line summary. Trigger:
  "memplan start", "where were we", "process feedback".
tools: Bash, Read, Grep
---

# memplan/start

Orient skill. Reads `.memplan/` state and prints a compact 3-line summary so the
session can begin with full context at minimum token cost.

**This skill writes one file:** `.memplan/.session` — a session marker read by
`memplan/update-mem` to confirm orientation happened before any writes. All other
writes are CLI side-effects of inbox processing (Phase 1).

---

## Phase 1: Process inbox (conditional)

Check whether `.memplan/inbox/` contains any `.feedback` files:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" inbox .
```

The CLI processes all pending `.feedback` files (oldest first) and prints a one-line
summary: `inbox: N ops applied, E errors`. If it prints `inbox: 0 ops applied` the inbox
was empty — that is fine, continue.

---

## Phase 2: Read orientation data

Read the following files in order. Each read costs a small number of tokens — stop
as soon as the file is absent or empty rather than erroring.

1. Read `.memplan/progress` — current step fraction and step text (1 line).
2. Read `.memplan/checkpoint.mem` — last action, next action, open questions.
3. Read `.memplan/memory/persona.mem` — style rules and constraints.
4. Read `.memplan/memory/hot.mem` — 5 most recently touched files.

Grep for aliases relevant to the user's first message (if any):

```bash
grep -i "<term>" .memplan/memory/aliases.mem 2>/dev/null
```

Run one grep per meaningful term in the user's message. Skip if `aliases.mem` is absent.

---

## Phase 3: Check warnings

**Missing plan.mem**: If `.memplan/plan.mem` does not exist, prepare a warning line:
`⚠ No plan.mem found — implementation cannot start until steps are defined.`

**Stale files**: Run:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" stale-list .
```

For each unresolved entry in the JSON output, prepare a warning line:
`⚠ <file> may be stale (<because> changed on <session>) — review before acting.`

---

## Phase 4: Print summary

Print the 3-line orient summary followed by any warnings:

```
Step: <progress value from .memplan/progress>
Next: <next-action from checkpoint.mem, or "(none recorded)" if absent>
Constraints: <style + test-policy from persona.mem joined with "; ", or "(none)" if absent>
```

If inbox had entries (Phase 1 applied ops > 0), append:
`Inbox: <N> ops applied from feedback.`

Append any warning lines from Phase 3 (one per line, prefixed `⚠`).

Total output must fit in 200 tokens or less, warnings included — the 3-line summary
alone should land around 40–80. Do not add prose, greetings, or summaries beyond the
format above.

---

## Phase 5: Write session marker

Write `.memplan/.session` with the current UTC timestamp. This is the signal that
`memplan/update-mem` checks before allowing any writes.

```bash
date -u +%Y-%m-%dT%H:%MZ > .memplan/.session
```
