---
name: record
description: >
  End-of-session close: write checkpoint, session digest, and hot files; record new
  aliases and facts. Trigger: "memplan record", "close session".
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

One call writes all three keys:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" checkpoint . "<last-action>" "<next-action>" "<open-questions or 'none'>"
```

Use plain text values. For open questions, separate items with `;` if more than one.

---

## Phase 3: Write session digest

Create a per-session digest (≤10 bullets). Each bullet is a completed action, decision,
or fact worth remembering. Omit routine tool invocations. One call, bullets on stdin:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" digest . "<10-word-summary>" << 'EOF'
<bullet 1>
<bullet 2>
EOF
```

---

## Phase 4: Update hot files

List the 5 most recently touched files from this session (use the files-touched list from
Phase 1, keeping the 5 most recently modified):

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" set . memory/hot.mem hot-files "<file1>|<file2>|<file3>|<file4>|<file5>"
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" set . memory/hot.mem last-updated "~$(date -u +%Y-%m-%d)"
```

Use a `|`-separated list. Omit if fewer than 5 files were touched — list what was touched.

---

## Phase 5: Delete risk file (conditional)

If a risk file exists and the change completed cleanly this session (all steps in
`plan.mem` for the at-risk area are now complete, no failures recorded):

```bash
rm -f .memplan/risk.mem .memplan/risk.plan.md
```

Only delete if the risk is fully resolved. If any step is incomplete or a failure was
recorded, leave the risk file in place.

---

## Phase 6: Append aliases and facts

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

Staleness propagation is automatic on every CLI write — no manual `stale-mark` calls.

---

## Phase 7: Confirm

Print:
`Session recorded. Next: <next-action>.`

Do not print file lists or token tallies.
