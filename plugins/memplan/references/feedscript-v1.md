# FeedScript v1 Reference

This is the runtime language reference for FeedScript v1 `.feedback` files consumed by:

```bash
memplan-cli.js apply <dir> <feedback-file>
```

## Grammar

```ebnf
file         ::= line* EOF
line         ::= comment | operation | blank
comment      ::= "#" text? NEWLINE
blank        ::= NEWLINE

operation    ::= verb (SP param)* NEWLINE
verb         ::= "SET"
              | "FACT"
              | "APPROVE"
              | "CLEAR-STALE"
              | "ANSWER"
              | "COMMENT"
              | "REWRITE"
              | "DELETE"
              | "INSERT"
              | "REPLACE-PLAN"

param        ::= key "=" value
key          ::= [a-z][a-z0-9-]*
value        ::= word | quoted
word         ::= [^ \t\n"=]+
quoted       ::= '"' [^"\n]* '"'
text         ::= [^\n]*
```

Rules:

- `verb` is case-sensitive and must be uppercase.
- Params are order-independent.
- If the same param is repeated, the **last** occurrence wins.
- Unknown params are ignored unless they cause a required-param check to fail.

## Operation forms

```text
SET file=FILENAME key=KEY value="VALUE"
FACT tag=TAG text="TEXT"
APPROVE step=N
CLEAR-STALE file=FILENAME
ANSWER qid=ID text="TEXT"
COMMENT step=N text="TEXT"
REWRITE step=N text="TEXT"
DELETE step=N
INSERT after=N text="TEXT"
INSERT before=N text="TEXT"
REPLACE-PLAN text="1=step-one|2=step-two|3=step-three"
```

Validation rules:

- `N` is a positive integer, except `INSERT after=0` which inserts before step 1.
- `INSERT` must specify exactly one of `after` or `before`.
- `FACT tag` must match `^[a-z][a-z0-9-]*$`.
- `SET file` is relative to `.memplan/` (example: `memory/persona.mem`).
- `REPLACE-PLAN text` must be a pipe-separated numbered list: `1=...|2=...|...`.

## Semantics

- `SET`: set/replace mutable key in target `.mem` file.
- `FACT`: append `+fact:tag=TAG,text=TEXT` to `memory/facts.mem`.
- `APPROVE`: record step approval in `decisions/log.mem`.
- `CLEAR-STALE`: append stale resolution for `file` to `stale.mem`.
- `ANSWER`: append question-answer entry to `memory/questions.mem` and decision log.
- `COMMENT`: append non-blocking step annotation to `decisions/log.mem`.
- `REWRITE`: replace text of existing step `N` in `plan.mem`.
- `DELETE`: remove step `N` from `plan.mem`; renumber following steps.
- `INSERT`: insert new step before/after target step; renumber following steps.
- `REPLACE-PLAN`: clear existing plan steps and rebuild from numbered list.

## Error handling

Errors never abort file processing. Parsing and execution continue line-by-line.

| Condition | Action |
|---|---|
| Unknown verb | Append `~DATETIME +unknown-op:verb=VERB,line=N` to `questions.mem`; skip line |
| Malformed line / parse error | Append `~DATETIME +parse-error:line=N` to `questions.mem`; skip line |
| Missing required params for verb | Append `~DATETIME +parse-error:line=N` to `questions.mem`; skip line |
| Invalid step reference (`step`, `after`, `before`) | Append `~DATETIME +bad-step:op=VERB,step=N` to `questions.mem`; skip line |
| Step out of range for `APPROVE`/`COMMENT`/`REWRITE`/`DELETE`/`INSERT` | Append `~DATETIME +bad-step:op=VERB,step=N` to `questions.mem`; skip line |
| `SET` targets unknown file | Append `~DATETIME +bad-file:file=FILENAME` to `questions.mem`; skip line |
| `SET` targets append-only (`+`) key | Append `~DATETIME +bad-set:key=KEY` to `questions.mem`; skip line |
| `ANSWER` targets unknown `qid` | Append `~DATETIME +bad-answer:qid=ID` to `questions.mem`; skip line |
| `CLEAR-STALE` for file not currently stale | No-op (silent) |
| Multiple ops touch same step | Apply in file order; last state wins |

After the file is processed:

1. Regenerate affected `.plan.md` files.
2. Append summary entry to `decisions/log.mem`: `~DATETIME +inbox:tool=TOOLNAME,ops=#N,errors=#E`.
3. Delete the processed `.feedback` file.
