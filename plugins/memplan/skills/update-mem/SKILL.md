---
name: update-mem
description: >
  Apply any mid-session learning or plan change to the right .mem file(s), then
  propagate staleness to dependents. Triggered whenever a prompt contains new
  information that should be persisted: a plan step change, a new entity, a fact,
  a constraint, an alias, a persona preference, or an open question. Trigger phrases:
  "add X to the plan", "remove step N", "note that", "remember that", "we discovered",
  "X is short for Y", "from now on", "the entity X is", "there's a new concept",
  "update the plan to", "add a fact", "add an alias", "I prefer", "add a question".
tools: Bash, Read, Grep
---

# memplan/update-mem

Routes mid-session information to the correct `.mem` file and propagates staleness
to any dependent files. The agent classifies the update, writes via the CLI, then
runs `stale-mark` for every dependent in `deps-closure.mem`.

**This skill is mutating.** All writes go through `memplan-cli.js`.

---

## Phase 1: Classify the update

Determine which `.mem` file(s) the information belongs in. One prompt may produce
multiple updates — handle each in turn.

| What the user said | Target file | CLI operation |
|--------------------|-------------|---------------|
| Add / remove / reorder plan steps | `plan.mem` + `slice.mem` | `append` / `set` / `clear` |
| New named concept, module, or symbol | `memory/entities.mem` | `append … entity` |
| Invariant, constraint, or non-obvious fact | `memory/facts.mem` | `append … fact` |
| Short-form → full meaning | `memory/aliases.mem` | `set` |
| Style rule, tool preference, workflow constraint | `memory/persona.mem` | `set` |
| Unanswered question for the human | `memory/questions.mem` | `append … question` |
| Known failure or dead end | `memory/failures.mem` | `append … failure` |

If the update does not fit any category, skip it and tell the user what was not
persisted and why.

**Deduplication check before writing:**

- Aliases: `grep "^<key>:" .memplan/memory/aliases.mem` — skip if key already exists with same value.
- Facts: `grep "<tag>" .memplan/memory/facts.mem` — skip if a fact with matching tag already exists.
- Entities: `grep "name=<name>" .memplan/memory/entities.mem` — skip if already recorded.
- Questions: `grep "<text>" .memplan/memory/questions.mem` — skip if an open question with matching text exists.

---

## Phase 2: Write the update

Use the appropriate CLI command for each classified update.

**Plan step changes:**

```bash
# Append a new step
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . plan.mem step "id=<N>,text=<text>,deps=<deps>"

# Rewrite an existing step's text
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" set . plan.mem step-<N>-text "<new-text>"

# Remove a step (set to empty to nullify, then update step-count)
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" clear . plan.mem step-<N>

# Update step count after structural changes
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" set . plan.mem step-count "#<N>"
```

After any plan change, also rebuild `slice.mem` to reflect the new ready frontier:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" clear . slice.mem title
# Re-append ready steps (those with no unmet deps)
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . slice.mem step "id=<ID>,text=<text>"
```

**Entity:**

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . memory/entities.mem entity \
  "name=<name>,type=<type>,desc=<description>"
```

Types: `file`, `function`, `class`, `module`, `config`, `concept`.

**Fact:**

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . memory/facts.mem fact \
  "tag=<tag>,text=<text>"
```

**Alias:**

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" set . memory/aliases.mem "<key>" "<full-meaning>"
```

**Persona preference:**

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" set . memory/persona.mem "<key>" "<value>"
```

**Question:**

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . memory/questions.mem question \
  "id=$(date -u +%Y-%m-%dT%H:%MZ),text=<text>,status=open"
```

**Failure:**

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . memory/failures.mem failure \
  "cmd=<cmd>,reason=<reason>"
```

Halt and report if any CLI command exits non-zero.

---

## Phase 3: Propagate staleness

For every file written in Phase 2, look up its dependents in `deps-closure.mem`:

```bash
cat .memplan/deps-closure.mem
```

For each dependent of a file that was written:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" stale-mark . "<dependent>" "<source>"
```

Skip propagation only if no file tracked in `deps.mem` was touched.

---

## Phase 4: Confirm

Print a one-line summary per update applied:

```
+ entity: PluginManager (module) — added to entities.mem
+ fact: tag=no-force-push — added to facts.mem
+ plan: step 6 added (write-openapi-spec, deps=5)
~ stale: slice.mem marked stale (plan.mem changed)
```

Use `+` for new writes, `~` for staleness marks, `=` for skipped duplicates.
