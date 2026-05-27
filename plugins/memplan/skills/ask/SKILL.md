---
name: ask
description: >
  Record an open question into .memplan/memory/questions.mem. Deduplicates: if an
  open question with the same text already exists it is skipped. Closed (answered)
  questions do not block a new ask. Trigger phrases: "ask question", "record question",
  "open question", "I have a question", "log this question", "add to questions".
tools: Bash, Read
---

# memplan/ask

Records one open question into `.memplan/memory/questions.mem` using an ISO8601 timestamp
as the unique ID. Deduplicates against open questions — never records the same question
twice while it is still open. Answered/closed questions are ignored for dedup purposes.

**This skill is mutating** (via CLI side-effect). The agent itself writes nothing.

---

## Phase 1: Read questions.mem for duplicate open questions

Check whether an open question with the same text is already recorded:

```bash
grep "status=open" .memplan/memory/questions.mem 2>/dev/null | grep -F "text=<QUESTION_TEXT>"
```

Replace `<QUESTION_TEXT>` with the exact question text the user provided.

- If the file does not exist or the grep returns no output: proceed to Phase 2.
- If a matching open question is found: stop here and print:
  `Already recorded (open): "<QUESTION_TEXT>"`
  Do not append a duplicate.

---

## Phase 2: Append the question

Generate a unique ID from the current UTC timestamp and append the question:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . memory/questions.mem question \
  "id=$(date -u +%Y-%m-%dT%H:%MZ),text=<QUESTION_TEXT>,status=open"
```

Replace `<QUESTION_TEXT>` with the exact question text. Ensure the text does not contain
unescaped `,` or `|` characters — reword slightly if needed, or escape structural chars
with `\,` / `\|`.

---

## Phase 3: Confirm

Print:
`Question recorded: "<QUESTION_TEXT>"`

Do not print the raw ID, file path, or CLI output.
