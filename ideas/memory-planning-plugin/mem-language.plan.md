# MemScript v1 — Machine Language for `.mem` Files

## Purpose

`.mem` files are agent-only. They are never read by humans. Every byte spent on
prose, formatting, or whitespace is a wasted token. MemScript v1 is a line-oriented
format designed for minimum token cost and unambiguous single-pass parsing.

---

## Grammar

```
file       ::= line* EOF
line       ::= comment | statement | blank
comment    ::= "#" .* NEWLINE          # debug only; agent ignores
blank      ::=  NEWLINE                # tolerated; ignored
statement  ::= [timestamp SP] ["+" ] key ":" value NEWLINE

timestamp  ::= "~" ISO8601             # e.g. ~2026-05-25T14:30Z
key        ::= [a-z][a-z0-9-]*
value      ::= scalar | list | map | ""

scalar     ::= text                    # any printable UTF-8 except NEWLINE, "|", when no "=" present
list       ::= item ("|" item)+        # "|" is the list separator
item       ::= text                    # any printable UTF-8 except NEWLINE and "|"
map        ::= entry ("," entry)+      # "," separates entries
entry      ::= key "=" text            # "=" separates map key from value; text has no "," or "|"
```

`text` is any sequence of printable UTF-8 characters excluding the structural
characters listed in the enclosing rule. Whitespace within text is preserved but
leading/trailing whitespace on a statement line is stripped.

---

## Mutability

| Prefix | Behaviour | When to use |
|--------|-----------|-------------|
| *(none)* | **Mutable** — last occurrence of `key` wins; agent replaces all prior lines with same key on write | Single current value: `progress`, `step`, `style` |
| `+` | **Append-only** — all occurrences kept; agent only ever adds new lines, never removes | Log entries: `+failure`, `+fact`, `+decision` |

On every write the agent:
1. For mutable keys: opens the file, removes all existing lines matching `^key:`, appends the new line, re-locks.
2. For append-only keys: appends the new line to the end of the file without reading first.

---

## Timestamps

Prepend `~ISO8601 ` (with a trailing space) to any statement to record when it was written.
Required on all `+` (append-only) statements. Optional on mutable statements.

```
~2026-05-25T14:30Z +failure:cmd=git-push,reason=auth-failed
~2026-05-25T09:00Z +decision:use-postgres,because=team-standard
```

---

## Null / clear

An empty value explicitly clears a mutable key:

```
risk:
```

The agent deletes all lines for that key and writes one `key:` line.
Append-only keys cannot be cleared (use `memplan/review` to compact).

---

## Value encoding reference

| Kind | Syntax | Example |
|------|--------|---------|
| Scalar | `key:text` | `style:terse` |
| Multi-word scalar | `key:words with spaces` | `branch-intent:add inbox protocol` |
| Integer | `key:#N` | `step-count:#12` |
| Boolean | `key:true` or `key:false` | `risk-open:false` |
| Date | `key:~YYYY-MM-DD` | `last-session:~2026-05-25` |
| Datetime | `key:~YYYY-MM-DDTHH:MMZ` | `locked-at:~2026-05-25T14:30Z` |
| List | `key:a|b|c` | `hot-files:src/api.ts|tests/unit.ts|src/main.ts` |
| Inline map | `key:k1=v1,k2=v2` | `session:date=~2026-05-25,steps=#3,done=#2` |
| Null | `key:` | `risk:` |
| Append scalar | `+key:text` | `+fact:no-force-push-to-main` |
| Append map | `+key:k1=v1,k2=v2` | `+failure:cmd=npm-test,reason=missing-env` |
| Timestamped append | `~DATETIME +key:value` | `~2026-05-25T10:00Z +fact:postgres-only` |

---

## Structural constraints

- Key chars: `[a-z][a-z0-9-]*` — lowercase, hyphens only, no underscores
- Max line length: 200 chars
- Max lines per file: enforced per-file cap (see token-budget.plan.md)
- Encoding: UTF-8, LF line endings, one trailing newline, no BOM
- `|` `,` `=` are structural — escape as `\|` `\,` `\=` only if they appear in a text value that would otherwise be misread; prefer rewording to avoid

---

## Parse algorithm (pseudocode for agent)

```
for each line in file:
  if line starts with "#" or is blank: skip
  strip leading/trailing whitespace
  if line starts with "~":
    extract timestamp = token before first space
    remainder = rest of line
  else:
    timestamp = null; remainder = line
  if remainder starts with "+":
    append_only = true; remainder = remainder[1:]
  else:
    append_only = false
  key, _, raw_value = remainder.partition(":")
  if "|" in raw_value:
    value = raw_value.split("|")          # list
  elif "=" in raw_value and "," in raw_value:
    value = dict(e.split("=",1) for e in raw_value.split(","))  # map
  elif "=" in raw_value:
    value = dict([raw_value.split("=",1)])  # single-entry map
  else:
    value = raw_value                      # scalar (may be empty)
  emit(timestamp, append_only, key, value)
```

---

## Example: `persona.mem`

```
style:terse;no-trailing-summaries
test-policy:real-db;no-mocks
test-reason:mock-prod-divergence-~2024-Q3
commit-format:conventional;atomic
lang:go=expert,react=novice
~2026-05-25T09:00Z +fact:user-prefers-single-bundled-pr-over-splits
```

## Example: `failures.mem`

```
~2026-05-23T11:20Z +failure:cmd=git-push,reason=no-upstream,fix=set-tracking-branch
~2026-05-24T16:05Z +failure:cmd=npm-test,reason=missing-env-var,fix=add-DATABASE_URL
```

## Example: `plan.mem`

```
title:add inbox protocol to memplan
step-count:#6
current:#3
~2026-05-25T09:00Z +step:1=design-feedback-format
~2026-05-25T09:05Z +step:2=add-inbox-dir-to-layout
~2026-05-25T09:10Z +step:3=write-memplan-inbox-skill
+step:4=update-start-skill-to-process-inbox
+step:5=write-language-specs
+step:6=update-token-budget
status:in-progress
```
