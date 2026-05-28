---
name: decide
description: >
  Record a non-obvious decision into .memplan/decisions/log.mem. Deduplicates: if
  a decision with the same choice and because already exists it is skipped. Trigger
  phrases: "record decision", "log decision", "memplan decide", "I decided", "document
  this choice", "why I chose".
tools: Bash, Read
---

# memplan/decide

Records one decision into `.memplan/decisions/log.mem` using a UTC timestamp as the
line prefix. Deduplicates — never records the same `choice + because` pair twice.
After appending, renders `decisions/log.plan.md`.

**This skill is mutating** (via CLI side-effect). The agent itself writes nothing.

---

## Phase 1: Check for duplicate

Before writing, grep for an existing entry with the same choice and because:

```bash
grep -F "+decision:choice=<CHOICE_TEXT>,because=<BECAUSE_TEXT>" .memplan/decisions/log.mem 2>/dev/null
```

Replace `<CHOICE_TEXT>` and `<BECAUSE_TEXT>` with the exact values you intend to write
in Phase 2 (after any escaping).

- If the file does not exist or the grep returns no output: proceed to Phase 2.
- If a matching entry is found: stop here and print:
  `Already recorded: "<CHOICE_TEXT>"`
  Do not append a duplicate.

---

## Phase 2: Append the decision

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . decisions/log.mem decision \
  "choice=<CHOICE_TEXT>,because=<BECAUSE_TEXT>"
```

Replace `<CHOICE_TEXT>` with a concise description of the choice made, and
`<BECAUSE_TEXT>` with the rationale. Ensure neither value contains unescaped `,` or `|`
characters — reword slightly if needed, or escape structural chars with `\,` / `\|`.

---

## Phase 3: Render decisions/log.plan.md

`decisions/log.mem` is not auto-rendered on append — trigger it explicitly:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" render . decisions/log.mem
```

---

## Phase 4: Confirm

Print:
`Decision recorded: "<CHOICE_TEXT>"`

Do not print the raw timestamp, file path, or CLI output.
