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

Observe the session's approximate token load cost (visible from `/cost` or session metadata):

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . budget.mem "session" "date=~$(date -u +%Y-%m-%d),files=<N>,tokens=<T>"
```

If token cost is unavailable, write `tokens=unknown`.

---

## Phase 6: Delete risk file (conditional)

If a multi-file change was completed cleanly this session (all steps in `plan.mem` for
the at-risk area are now complete, no failures recorded):

```bash
rm -f .memplan/risk.mem .memplan/risk.plan.md
```

Only delete if the risk is fully resolved. If any step is incomplete or a failure was
recorded, leave the risk file in place.

---

## Phase 7: Append aliases and facts

For each new alias or fact the user stated (or that emerged clearly from code):

```bash
# Alias: short-form → full meaning
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" set . memory/aliases.mem "<alias-key>" "<full-meaning>"

# Fact: tagged invariant or constraint
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . memory/facts.mem "fact" "tag=<tag>,text=<text>"
```

Skip if no new aliases or facts were discovered. Do not duplicate existing entries — grep
`aliases.mem` and `facts.mem` first:

```bash
grep "^<alias-key>:" .memplan/memory/aliases.mem 2>/dev/null
grep "<tag>" .memplan/memory/facts.mem 2>/dev/null
```

---

## Phase 8: Confirm

Print:
`Session recorded. Next: <next-action>.`

Do not print file lists or token tallies.
