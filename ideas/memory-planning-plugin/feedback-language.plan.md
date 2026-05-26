# FeedScript v1 — Machine Language for `.feedback` Files

## Purpose

`.feedback` files are written by external tools or humans (via a tool) and read by
`memplan/inbox`. They express intent as a sequence of operations the agent applies
to the current plan state. The format must be writable by non-agent tools (including
plannotator, scripts, or a human with a text editor) and unambiguously parseable by
the agent in a single pass.

---

## Grammar

```
file       ::= line* EOF
line       ::= comment | operation | blank
comment    ::= "#" .* NEWLINE
blank      ::= NEWLINE
operation  ::= VERB (SP param)* NEWLINE

VERB       ::= [A-Z][A-Z0-9-]*
param      ::= key "=" value
key        ::= [a-z][a-z0-9-]*
value      ::= word | quoted
word       ::= [^ \t\n"=]+        # unquoted: no spaces, no quotes
quoted     ::= '"' [^"\n]* '"'    # double-quoted: no embedded quotes, no newlines
```

Params are order-independent within a line. If a param appears more than once the
last occurrence wins. VERB is case-sensitive and must be uppercase.

---

## Operations

### Plan step operations

```
APPROVE step=N
```
Mark step N as approved. Agent records in `decisions/log.mem`.

```
REJECT step=N [reason="TEXT"]
```
Mark step N as rejected. Agent appends to `questions.mem` for human resolution.

```
COMMENT step=N text="TEXT"
```
Attach a non-blocking annotation to step N. Agent writes to `decisions/log.mem`.

```
REWRITE step=N text="TEXT"
```
Replace the text of step N in `plan.mem` with TEXT.

```
INSERT after=N text="TEXT"
INSERT before=N text="TEXT"
```
Insert a new step after or before step N. All subsequent step numbers shift by 1.
`after=0` inserts before step 1.

```
DELETE step=N
```
Remove step N. Subsequent steps renumber.

```
REPLACE-PLAN text="FULL PLAN AS NUMBERED LIST"
```
Replace the entire plan content. TEXT must be a pipe-separated numbered list:
`"1=do-this|2=then-this|3=finally-this"`. Each item becomes one `+step:` line in
`plan.mem`. Existing steps are cleared first.

---

### Memory operations

```
FACT tag=TAG text="TEXT"
```
Append `+fact:tag=TAG,text=TEXT` to `facts.mem`. TAG must match `[a-z][a-z0-9-]*`.

```
ANSWER qid=ID text="TEXT"
```
Resolve open question with id ID. Agent appends `+question-answer:id=ID,text=TEXT` to
`questions.mem`. Does NOT remove the original question line — append-only semantics are
preserved. The question is treated as resolved once the answer line exists.
Also appends to `decisions/log.mem`: `~DATETIME +decision:from-question=ID,text=TEXT`.

```
CLEAR-STALE file=FILENAME
```
Mark a stale entry as resolved without running `memplan/review`. Agent appends
`~DATETIME +stale-resolved:file=FILENAME,session=~DATE` to `stale.mem`. Used when the
human has manually verified the file is up to date. FILENAME is relative to `.memplan/`.

```
SET file=FILENAME key=KEY value="VALUE"
```
Set a mutable key in any `.mem` file. FILENAME is relative to `.memplan/`
(e.g., `memory/persona.mem`). VALUE is written as a MemScript scalar.
Cannot target append-only keys — use FACT for that.

---

## Error handling

| Condition | Agent action |
|-----------|-------------|
| Unknown VERB | Append `~DATETIME +unknown-op:verb=VERB,line=N` to `questions.mem`; skip |
| Malformed line (parse error) | Append `~DATETIME +parse-error:line=N` to `questions.mem`; skip |
| Step N out of range | Append `~DATETIME +bad-step:op=VERB,step=N` to `questions.mem`; skip |
| Conflicting ops on same step | Apply in file order; log last applied to `decisions/log.mem` |
| SET targets unknown file | Append `~DATETIME +bad-file:file=FILENAME` to `questions.mem`; skip |
| SET targets `+` (append-only) key | Append `~DATETIME +bad-set:key=KEY` to `questions.mem`; skip |
| CLEAR-STALE targets file not in `stale.mem` | No-op; skip silently |
| ANSWER targets unknown qid | Append `~DATETIME +bad-answer:qid=ID` to `questions.mem`; skip |

Errors never abort processing. The agent finishes all lines, then deletes the `.feedback` file.

---

## Processing order

1. Files processed oldest-first (by file modification time).
2. Operations within a file applied top to bottom.
3. After all files: `plan.plan.md` regenerated from updated `plan.mem`; all affected `.plan.md` files regenerated and re-locked.
4. Each processed file deleted.
5. Summary appended to `decisions/log.mem`: `~DATETIME +inbox:tool=TOOLNAME,ops=#N,errors=#E`.

---

## Example: plannotator output

```
# plannotator feedback — 2026-05-25T15:30Z
APPROVE step=1
APPROVE step=2
COMMENT step=3 text="check if lock file exists before running"
REWRITE step=4 text="run migrations inside a transaction"
INSERT after=4 text="verify row counts match expected after migration"
APPROVE step=5
REJECT step=6 reason="too risky without a rollback plan"
FACT tag=constraint text="all schema migrations must be wrapped in transactions"
```

## Example: manual feedback file

```
# quick human note before session resumes
COMMENT step=1 text="already done yesterday — skip"
SET file=memory/persona.mem key=branch-intent value="add-feedback-protocol"
FACT tag=decision text="inbox protocol ships in phase-1"
```
