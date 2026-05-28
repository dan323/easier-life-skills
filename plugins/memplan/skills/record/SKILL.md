---
name: record
description: >
  End-of-session close: writes checkpoint.mem, per-session digest, hot.mem, budget.mem.
  Deletes risk files after a clean multi-file close. Appends session-discovered aliases
  and facts. Agent decides content; CLI handles file mechanics. Call at the end of every
  working session. Trigger phrases: "memplan record", "close session", "end session",
  "record session", "save session state".
tools: Bash, Read, Grep
---

# memplan/record

End-of-session close skill. Persists session state so the next `memplan/start` can
orient in ≤80 tokens without exploring the codebase.

**This skill is mutating.** All writes are via `memplan-cli.js`. `render-all` is NOT
called here — that is deferred to `memplan/review`.

---

## Phase 1: Gather session state

Before writing, determine:

1. **Last action** — the most recent step or task completed this session.
2. **Next action** — the next logical step (from `plan.mem` or the user's stated intent).
3. **Open questions** — any unresolved decisions or blockers surfaced this session.
4. **Files touched** — all files created or modified (from Phase 3 of `memplan/act` runs,
   or by reading the current session's tool history).
5. **Aliases and facts discovered** — any new abbreviations, domain terms, or invariants
   the user stated or that emerged from the code.

---

## Phase 2: Write checkpoint

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" set . checkpoint.mem last-action "<text>"
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" set . checkpoint.mem next-action "<text>"
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" set . checkpoint.mem open-questions "<text or 'none'>"
```

Use plain text values. For `open-questions`, list items separated with `;` if more than one.

---

## Phase 3: Write session digest

Create a per-session digest (≤10 bullets). Each bullet is a completed action, decision,
or fact worth remembering. Omit routine tool invocations.

```bash
# Set DATE to today's date in YYYY-MM-DD format
DATE=$(date -u +%Y-%m-%d)
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . "sessions/${DATE}.mem" "session" "date=~${DATE},summary=<10-word-summary>"
# For each bullet (max 10):
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . "sessions/${DATE}.mem" "bullet" "text=<bullet-text>"
```

---

## Phase 4: Update hot files

List the 5 most recently touched files from this session (use the files-touched list from
Phase 1, keeping the 5 most recently modified):

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" set . hot.mem hot-files "<file1>|<file2>|<file3>|<file4>|<file5>"
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" set . hot.mem last-updated "~$(date -u +%Y-%m-%d)"
```

Use a `|`-separated list. Omit if fewer than 5 files were touched — list what was touched.

---

## Phase 5: Update budget

Record the token cost for each `.mem` file loaded during this session's orient phase (from
`memplan/start`). For each file that was read (progress, checkpoint.mem, persona.mem, hot.mem,
plan.mem, slice.mem, etc.), append a load entry:

```bash
DATE=$(date -u +%Y-%m-%d)
# For each file loaded during orient:
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . budget.mem "load" "file=<filename>,tokens=<T>,date=~${DATE}"
```

Use these token-cost estimates if exact costs are unavailable:
- `progress`: ~10 tokens
- `checkpoint.mem`: ~50 tokens
- `persona.mem`: ~35 tokens
- `hot.mem`: ~20 tokens
- `plan.mem`: ~70 tokens
- `slice.mem`: ~30 tokens
- `risk.mem`: ~20 tokens

Only record files that were actually loaded this session. If a file was skipped or absent,
do not record it.

---

## Phase 6: Delete risk file (conditional)

If a risk file exists and the change completed cleanly this session (all steps in
`plan.mem` for the at-risk area are now complete, no failures recorded):

```bash
rm -f .memplan/risk.mem .memplan/risk.plan.md
```

Only delete if the risk is fully resolved. If any step is incomplete or a failure was
recorded, leave the risk file in place.

---

## Phase 7: Append aliases and facts

For each new alias or fact the user stated (or that emerged clearly from code):

**Aliases** — `set` replaces the existing key, so it is inherently dedup-safe. Write
unconditionally:

```bash
# Alias: short-form → full meaning (set replaces any existing value for <alias-key>)
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" set . memory/aliases.mem "<alias-key>" "<full-meaning>"
```

**Facts** — `append` does not dedup, so grep before writing. Skip the fact if the
identical tag+text pair already exists:

```bash
# Check: skip if this exact tag+text pair is already recorded
grep -Fq "+fact:tag=<tag>,text=<text>" .memplan/memory/facts.mem 2>/dev/null || \
  node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . memory/facts.mem "fact" "tag=<tag>,text=<text>"
```

Skip the entire phase if no new aliases or facts were discovered this session.

---

## Phase 8: Propagate staleness

For every file written this session, look up dependents in `deps-closure.mem` and mark
them stale:

```bash
cat .memplan/deps-closure.mem
```

For each dependent of `checkpoint.mem`, `hot.mem`, `budget.mem`, or any session file:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" stale-mark . "<dependent>" "<source>"
```

---

## Phase 9: Confirm

Print:
`Session recorded. Next: <next-action>.`

Do not print file lists or token tallies.
