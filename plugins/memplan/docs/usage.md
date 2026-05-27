# memplan — Usage Guide

memplan gives Claude Code persistent, low-token working memory and structured planning.
Each session picks up exactly where the last one left off. Token overhead stays flat
regardless of project size.

---

## The loop

```
init → plan → act → record → start → plan → act → record → …
```

| Skill | When to call |
|-------|-------------|
| `memplan/init` | Once, on a new project |
| `memplan/start` | At the top of every session |
| `memplan/plan` | When starting a new task |
| `memplan/act` | To execute each plan step |
| `memplan/update-mem` | Any time new information or a plan change comes up mid-session |
| `memplan/inbox` | Automatically by `start`; or manually to flush feedback |
| `memplan/record` | At the end of every session |
| `memplan/gaps` | On demand, to audit the plan for issues |

---

## Quick start

### 1. Initialise the workspace

Run once in the project root:

```
/init
```

or type: **"initialise memplan for this project"**

This creates `.memplan/` with all required files. If you already have a branch goal and
style preferences, say them now — the skill writes them into `branch-intent` and
`persona.mem` so they are available from the first session.

### 2. Start every session

At the beginning of any working session:

```
/start
```

or: **"orient me"**, **"where were we"**

The skill prints a 3-line summary in ≤80 tokens:

```
Step: 3/12 | implement-feedscript-parse-loop
Next: write the render command
Constraints: terse; no mocks; conventional commits
```

Any feedback waiting in the inbox is applied first, automatically.

### 3. Create a plan

When beginning a new task:

```
/plan
```

or: **"plan this task: …"**, **"create a plan for …"**

The skill writes a numbered step list (`plan.mem`) and a ready-to-act slice (`slice.mem`),
infers step dependencies, initialises progress, and (when needed) writes a risk file.

### 4. Execute steps

For each step:

```
/act
```

or: **"execute step 2"**, **"do the next step"**

The skill runs three pre-flight checks before executing — it will hard-halt if:
- `steps.mem` is absent
- A dependency of the target step is not yet complete
- A file this step reads is marked stale

After a successful step, progress and code-map are updated automatically.

### 5. Record the session

At the end of every session:

```
/record
```

or: **"close session"**, **"record session"**

Writes checkpoint (last/next action), a session digest, hot files, and budget.
Deletes the risk file if the current multi-file change completed cleanly.

---

## Audit the plan

At any point, run:

```
/gaps
```

or: **"check the plan for gaps"**, **"audit the plan"**

Outputs a numbered list of actionable issues across 8 categories (circular deps,
contradictions, missing behaviours, uncovered error paths, etc.). No files are written.

---

## Updating the plan or recording new information

Just say it. The `memplan/update-mem` skill triggers on any prompt that contains
new information worth persisting:

**Plan changes:**
> "Add a step to write the OpenAPI spec after step 5."
> "Remove step 4, it's no longer needed."
> "Replan — the approach changed, here's the new task: …"

**New entities, facts, aliases, preferences:**
> "We discovered that PluginManager is responsible for loading all plugins."
> "Never use singletons in this codebase."
> "mp is short for memplan."
> "From now on always use snake_case for database column names."

The skill classifies what was said, writes it to the right `.mem` file, and
propagates staleness to any dependent files automatically:

| What you say | Where it goes |
|---|---|
| Plan step change | `plan.mem` + `slice.mem` rebuilt |
| Named concept, module, symbol | `memory/entities.mem` |
| Invariant or constraint | `memory/facts.mem` |
| Short-form → full meaning | `memory/aliases.mem` |
| Style or workflow preference | `memory/persona.mem` |
| Unanswered question | `memory/questions.mem` |

Duplicates are silently skipped — the same entity or fact is never recorded twice.

---

## External tool integration (inbox)

The inbox is **not** the human feedback path — it is the integration point for external
tools and plugins that cannot talk to the agent directly.

Any external tool becomes a memplan plugin by writing a FeedScript v1 `.feedback` file
to `.memplan/inbox/<tool-name>.feedback`. No registration or manifest required. The agent
applies it automatically on the next `memplan/start` and then deletes the file.

[Plannotator](https://github.com/backnotprop/plannotator) is a ready-made example:
it renders `plan.plan.md` as a visual annotation UI, writes the result as a `.feedback`
file, and the agent picks it up on next session start.

See `references/feedscript-v1.md` for the FeedScript v1 language reference.

---

## File layout

```
.memplan/
  progress                    # "3/12 | current-step" — loaded by start
  branch-intent               # one-line branch goal — loaded by start
  checkpoint.mem              # last/next action, open questions
  plan.mem                    # full plan, ≤20 steps
  slice.mem                   # next ≤5 ready-to-act steps
  steps.mem                   # ordered implementation steps (required by act)
  risk.mem                    # what could break / irreversible / verify-first
  budget.mem                  # per-session token load costs

  memory/
    persona.mem               # style rules, constraints, preferences
    hot.mem                   # 5 most recently touched files
    aliases.mem               # domain abbreviations
    entities.mem              # known symbols, modules, concepts
    facts.mem                 # tagged invariants and constraints
    failures.mem              # failed commands and reasons
    questions.mem             # open questions for the human

  deps.mem                    # dependency graph for staleness tracking
  stale.mem                   # files that may be out of date
  sessions/YYYY-MM-DD.mem     # per-session digests

  decisions/
    log.mem                   # append-only micro-ADRs

  inbox/
    *.feedback                # pending FeedScript v1 feedback (deleted after apply)
```

Every `.mem` file has a paired `.plan.md` counterpart that is human-readable and
read-only on disk. The agent reads `.mem`; you read `.plan.md`.

---

## Token cost

A full session orient reads 6 small `.mem` files:

| File | Typical cost |
|------|-------------|
| `progress` | ~10 tokens |
| `checkpoint.mem` | ~50 tokens |
| `persona.mem` | ~35 tokens |
| `hot.mem` | ~20 tokens |
| `plan.mem` | ~70 tokens |
| `slice.mem` | ~30 tokens |
| **Total orient** | **~215–260 tokens** |

Append-only files (`failures.mem`, `facts.mem`, `entities.mem`, `decisions/log.mem`)
are never loaded at session start — they are grepped on demand.

Compare to loading `CLAUDE.md` + README + a schema: typically 3,000–8,000 tokens.

---

## Automatic hooks (optional)

memplan works manually without any hooks. For full automation, configure two hooks:

**PreToolUse** — calls `memplan/start` on the first tool call of every session, so
orientation always happens before any work begins.

**PostToolUse (Write/Edit)** — calls `memplan/act` after every file change, keeping
`code-map.mem`, `hot.mem`, and `progress` in sync automatically.

---

## External tool integration

Any external tool becomes a memplan plugin by writing a valid `.feedback` file to
`.memplan/inbox/<tool-name>.feedback`. No registration or manifest required.

[Plannotator](https://github.com/backnotprop/plannotator) is a ready-made example:
it renders `plan.plan.md` as a visual annotation UI, then writes the result as a
`.feedback` file — the agent picks it up on next session start.
