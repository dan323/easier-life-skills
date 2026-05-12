---
name: index-audit
description: >
  Audit database indexes
  TODO: expand this paragraph with the user phrases that should trigger the
  skill (e.g. "find unused code", "audit my logs"). The description is the
  primary matching signal Claude uses, so make it specific.
tools: Bash, Read, Grep, TaskCreate, TaskUpdate
---

# Index Audit

TODO: one-paragraph summary of what this skill does and the value it
delivers. Be concrete — name the artefact it produces or the change it makes.

**This skill is TODO: read-only / mutating.** TODO: describe what it touches.

---

## Task Tracking

Before doing any work, call `TaskCreate` for each phase below. Call
`TaskUpdate` (status `in_progress`) when you begin a phase and `TaskUpdate`
(status `completed`) when you finish it.

- TODO: Phase 1 short name
- TODO: Phase 2 short name
- TODO: Phase 3 short name

---

## Phase 1: TODO

TODO: replace with the first investigation step. Include the bash commands
the agent should run — don't ask it to guess.

```bash
# TODO: example data-gathering command
```

---

## Phase 2: TODO

TODO: replace with the implementation step.

---

## Phase 3: TODO

TODO: replace with the verification / report step. Define the output format
explicitly — show a concrete example below.

### Output format

```
TODO: concrete example of what the report or file should look like.
```
