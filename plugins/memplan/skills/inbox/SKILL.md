---
name: inbox
description: >
  Process all pending .feedback files in .memplan/inbox/ by delegating to memplan-cli.js
  inbox. Reports ops applied and any errors. Called automatically by memplan/start when
  inbox is non-empty; can also be called manually mid-session to flush feedback.
  Trigger phrases: "memplan inbox", "process feedback", "flush inbox", "apply feedback".
tools: Bash
---

# memplan/inbox

Thin wrapper skill: delegates all FeedScript v1 processing to the CLI. The agent is
not involved in parsing, file manipulation, or error recovery — that is all handled
by `memplan-cli.js inbox`.

**This skill is mutating** (via CLI side-effects). The agent itself writes nothing.

---

## Phase 1: Run inbox

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" inbox .
```

The CLI:
1. Finds all `*.feedback` files in `.memplan/inbox/`, sorted oldest-first by mtime.
2. For each file: parses FeedScript v1 ops, applies them to the relevant `.mem` files,
   regenerates affected `.plan.md` files, deletes the `.feedback` file.
3. Appends a summary to `.memplan/decisions/log.mem`:
   `~DATETIME +inbox:tool=<name>,ops=#N,errors=#E`
4. Errors never abort processing — unknown ops and parse failures are appended to
   `questions.mem` and skipped.

---

## Phase 2: Report

Read the last inbox summary from `.memplan/decisions/log.mem`:

```bash
grep "+inbox:" .memplan/decisions/log.mem | tail -1
```

Report to the user:

- If ops > 0: `Inbox: <N> ops applied from <K> feedback file(s). <E> errors.`
- If ops == 0: `Inbox: empty — no pending feedback.`
- If errors > 0: `<E> ops had errors — check .memplan/memory/questions.mem for details.`

Do not show file contents, individual op details, or the raw log line.
