---
name: bootstrap
description: >
  Bootstrap a new .memplan/ workspace (directories, stub .mem files, locked .plan.md
  counterparts). Idempotent. Trigger: "init memplan", "set up memplan".
tools: Bash, Read
---

# memplan/bootstrap

Creates the full `.memplan/` workspace for the current project. Delegates all directory
creation and file writing to `memplan-cli.js init` — the agent adds only the
project-specific content that the CLI cannot infer (branch intent, initial persona entries).

**This skill is mutating.** It writes `.memplan/` and all its contents, then locks all
`.plan.md` counterparts.

---

## Phase 1: Check for existing workspace

Run:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" init .
```

If `.memplan/` already exists the CLI prints `Already initialised` and exits 0. In that
case, stop here and tell the user: "Already initialised — run `memplan/start` to orient."

If `.memplan/` was just created the CLI prints a success line. Proceed to Phase 2.

---

## Phase 2: Set project-specific content

Ask the user (or infer from context) for:

1. **Branch intent** — one-line description of the current branch goal.
2. **Initial persona entries** — style rules, constraints, or preferences the user has
   already mentioned in this session (e.g. "terse responses", "no mocks", "go=expert").

Write branch intent:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" set . branch-intent "<intent>"
```

For each persona entry (only those explicitly stated by the user — do not invent):

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" set . memory/persona.mem "<key>" "<value>"
```

Use MemScript v1 value encoding (see `references/memscript-v1.md`):
- Lists: `a|b|c`
- Maps: `k1=v1,k2=v2`
- Scalars: plain text

If the user has stated no preferences, skip persona writes — empty stubs are correct.

---

## Phase 3: Confirm

Print exactly:

```
memplan initialised.
  .memplan/ created with all stubs (Phase 1 + Phase 2).
  Run `memplan/plan` to define your steps, or `memplan/start` at the top of each session.
```

Do not print file lists, token counts, or implementation details.
