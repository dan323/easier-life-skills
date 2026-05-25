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
2. For append-only keys: appends the new line to the end of the file **without reading first**.

The no-read guarantee for `+` keys is not an optimisation — it is a correctness property.
Append-only files grow monotonically: no existing line is ever removed between compactions.
Because there are no read–modify–write cycles, concurrent hook-triggered writes (e.g. a
PostToolUse hook calling `memplan/act` while `memplan/record` is running) cannot produce
torn reads or lost updates. The only operation that breaks monotonicity is `memplan/review`
compaction — and that skill is human-initiated, never automatic.

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
| Step deps | `+step:id=N,deps=A\|B` | `+step:id=4,deps=2\|3` — step 4 cannot start until steps 2 and 3 are complete |
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
style:terse|no-trailing-summaries
test-policy:real-db|no-mocks
test-reason:mock-prod-divergence-~2024-Q3
commit-format:conventional|atomic
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
~2026-05-25T09:00Z +step:id=1,text=design-feedback-format,atomic=true
~2026-05-25T09:05Z +step:id=2,text=add-inbox-dir-to-layout,atomic=true
~2026-05-25T09:10Z +step:id=3,text=write-memplan-inbox-skill,deps=1|2,refined=true
+step:id=3.1,text=write-inbox-skill-header-and-invocation,atomic=true
+step:id=3.2,text=implement-feedscript-parse-loop,atomic=true
+step:id=3.3,text=implement-file-unlock-write-relock,atomic=true
+step:id=4,text=update-start-skill-to-process-inbox,deps=3
+step:id=5,text=write-language-specs,deps=3
+step:id=6,text=update-token-budget,deps=4|5
status:in-progress
```

Steps 4 and 5 both depend on 3 but not on each other — they form a parallelisable
frontier once step 3 is done. `memplan/slice` reads `deps` to surface this: instead
of always picking `current+1`, it selects all steps whose `deps` are fully complete
and which are not yet started.
