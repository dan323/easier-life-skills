# MemScript v1 — Language Specification

This is the **authoritative reference** for MemScript v1, the line-oriented machine format used by `.mem` files. Skills that read or write `.mem` files must implement this spec exactly.

`.mem` files are **agent-only** — they are never read by humans. Every byte spent on prose, formatting, or whitespace is a wasted token. MemScript v1 is designed for minimum token cost and unambiguous single-pass parsing.

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

`text` is any sequence of printable UTF-8 characters excluding the structural characters listed in the enclosing rule. Whitespace within text is preserved but leading/trailing whitespace on a statement line is stripped.

---

## Mutability

| Prefix | Behaviour | When to use |
|--------|-----------|-------------|
| *(none)* | **Mutable** — last occurrence of `key` wins; agent replaces all prior lines with same key on write | Single current value: `progress`, `step`, `style` |
| `+` | **Append-only** — all occurrences kept; agent only ever adds new lines, never removes | Log entries: `+failure`, `+fact`, `+decision` |

On every write the agent:
1. For mutable keys: opens the file, removes all existing lines matching `^key:`, appends the new line, re-locks.
2. For append-only keys: appends the new line to the end of the file **without reading first**.

The no-read guarantee for `+` keys is not an optimisation — it is a **correctness property**. Append-only files grow monotonically: no existing line is ever removed between compactions. Because there are no read–modify–write cycles, concurrent hook-triggered writes (e.g. a PostToolUse hook calling `memplan/act` while `memplan/record` is running) cannot produce torn reads or lost updates. The only operation that breaks monotonicity is `memplan/review` compaction — and that skill is human-initiated, never automatic.

---

## Timestamps

Prepend `~ISO8601 ` (with a trailing space) to any statement to record when it was written. **Required** on all `+` (append-only) statements. Optional on mutable statements.

```
~2026-05-25T14:30Z +failure:cmd=git-push,reason=auth-failed
~2026-05-25T09:00Z +decision:use-postgres,because=team-standard
```

Format: `~YYYY-MM-DDTHH:MMZ` (UTC, no seconds or milliseconds). The `~` prefix distinguishes timestamps from other data.

---

## Null / Clear

An empty value explicitly clears a mutable key:

```
risk:
```

The agent deletes all lines for that key and writes one `key:` line. Append-only keys cannot be cleared (use `memplan/review` to compact).

---

## Value Encoding Reference

| Kind | Syntax | Example |
|------|--------|---------|
| Scalar | `key:text` | `style:terse` |
| Multi-word scalar | `key:words with spaces` | `branch-intent:add inbox protocol` |
| Integer | `key:#N` | `step-count:#12` |
| Boolean | `key:true` or `key:false` | `risk-open:false` |
| Date | `key:~YYYY-MM-DD` | `last-session:~2026-05-25` |
| Datetime | `key:~YYYY-MM-DDTHH:MMZ` | `locked-at:~2026-05-25T14:30Z` |
| List | `key:a\|b\|c` | `hot-files:src/api.ts\|tests/unit.ts\|src/main.ts` |
| Inline map | `key:k1=v1,k2=v2` | `session:date=~2026-05-25,steps=#3,done=#2` |
| Step deps | `+step:id=N,deps=A\|B` | `+step:id=4,deps=2\|3` — step 4 cannot start until steps 2 and 3 are complete |
| Null | `key:` | `risk:` |
| Append scalar | `+key:text` | `+fact:no-force-push-to-main` |
| Append map | `+key:k1=v1,k2=v2` | `+failure:cmd=npm-test,reason=missing-env` |
| Timestamped append | `~DATETIME +key:value` | `~2026-05-25T10:00Z +fact:postgres-only` |

---

## Structural Constraints

- **Key chars**: `[a-z][a-z0-9-]*` — lowercase, hyphens only, no underscores
- **Max line length**: 200 chars
- **Max lines per file**: enforced per-file cap (see token-budget.plan.md)
- **Encoding**: UTF-8, LF line endings, one trailing newline, no BOM
- `|` `,` `=` are structural — escape as `\|` `\,` `\=` only if they appear in a text value that would otherwise be misread; prefer rewording to avoid

---

## Parse Algorithm

Pseudocode for agent implementation:

```python
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

Steps 4 and 5 both depend on 3 but not on each other — they form a parallelisable frontier once step 3 is done. `memplan/slice` reads `deps` to surface this: instead of always picking `current+1`, it selects all steps whose `deps` are fully complete and which are not yet started.

---

## Write Operations

### Mutable key write

```python
def write_mutable(file_path, key, value):
  lines = read_lines(file_path)
  # Remove all existing lines with this key
  filtered = [line for line in lines if not line.strip().partition(":")[0] == key]
  # Append new line
  filtered.append(f"{key}:{value}")
  write_lines(file_path, filtered)
```

### Append-only write

```python
def write_append_only(file_path, key, value, timestamp=None):
  prefix = f"~{timestamp} " if timestamp else ""
  line = f"{prefix}+{key}:{value}\n"
  # Append without reading
  with open(file_path, "a") as f:
    f.write(line)
```

---

## Read Operations

### Read mutable key (last value wins)

```python
def read_mutable(file_path, key):
  value = None
  for line in read_lines(file_path):
    parsed_key, _, parsed_value = parse_line(line)
    if parsed_key == key:
      value = parsed_value
  return value
```

### Read all append-only entries

```python
def read_append_only(file_path, key):
  entries = []
  for line in read_lines(file_path):
    timestamp, append_only, parsed_key, parsed_value = parse_line(line)
    if append_only and parsed_key == key:
      entries.append((timestamp, parsed_value))
  return entries
```

---

## Canonical Encoding Rules

When writing values:

1. **Scalars**: Write as-is. No quoting, no escaping, unless the value contains structural chars.
2. **Lists**: Join with `|`. Example: `["a", "b", "c"]` → `a|b|c`
3. **Maps**: Join with `,`, keys with `=`. Example: `{"x": "1", "y": "2"}` → `x=1,y=2`
4. **Integers**: Prefix with `#`. Example: `42` → `#42`
5. **Booleans**: Write as `true` or `false` (lowercase).
6. **Dates**: Prefix with `~`, format as `YYYY-MM-DD`. Example: `~2026-05-25`
7. **Datetimes**: Prefix with `~`, format as `YYYY-MM-DDTHH:MMZ`. Example: `~2026-05-25T14:30Z`

When reading values:

1. If the value contains `|`, split on `|` → list
2. If the value contains both `,` and `=`, split on `,` then `=` → map
3. If the value contains `=` but no `,`, single-entry map
4. Otherwise, scalar (may be empty string)

---

## Error Handling

When encountering malformed lines:

1. **Missing colon**: Skip the line and log a warning.
2. **Invalid key format** (contains uppercase, underscores, or starts with a digit): Skip the line.
3. **Malformed timestamp** (doesn't match `~YYYY-MM-DDTHH:MMZ`): Skip the line.
4. **Line exceeds 200 chars**: Truncate and log a warning.

The parser is **permissive by design** — it never crashes on bad input, but it may drop malformed entries. This ensures that partial corruption does not prevent the entire file from being read.

---

## Versioning

This is **MemScript v1**. If a breaking change is needed (e.g., changing the timestamp format or the list separator), the new format will be **MemScript v2** and will use a different file extension or header marker. v1 files must be parseable indefinitely.
