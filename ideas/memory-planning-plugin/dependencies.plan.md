# memplan — Dependency Graph & Staleness Tracking

## Concept

Some `.mem` files are derived from others. When a source file changes, its dependents
may be out of date. Rather than recomputing eagerly (expensive), memplan tracks a
staleness flag per file and reviews dependents lazily — before they are next read or
acted upon.

This applies at two levels:
- **Runtime**: `.memplan/` files within a project (managed by the plugin)
- **Plan-time**: the `ideas/memory-planning-plugin/` plan files in this repo (managed by the human; the same graph concept applies)

---

## Structural dependency map (`memory/deps.json`)

`deps.json` is the human-curated map of **codebase modules** and how they depend on
each other. It gives the agent structural awareness without scanning or parsing the
code. The agent combines it with `memory/code-map.mem` (file purpose + last touched)
to reason about impact and navigation.

Location: `.memplan/memory/deps.json`.

**Format (JSON):**

```
{
  "version": 1,
  "modules": {
    "src/api": ["src/db", "src/shared"],
    "src/db": ["src/config"]
  }
}
```

Rules:
- `modules` keys are **module identifiers** (prefer repo-relative paths to a file or
  directory, or a stable logical name that also appears in `code-map.mem`).
- Values are **direct dependencies** (one hop). Order is irrelevant.
- Keep it sparse and stable: only add entries for meaningful boundaries (modules,
  subsystems, packages).

**When it is read**
- **On demand** during `memplan/plan`, `memplan/act`, or `memplan/update-mem` when
  the agent needs architecture context or impact analysis.
- **Not** read during `memplan/start` orient (keeps token cost flat).

**How it differs from `deps.mem`**
| File | Scope | Format | Who updates | Used by |
|---|---|---|---|---|
| `memory/deps.json` | Codebase modules (files/dirs/packages) | JSON | Human/tool curated | Planning + impact reasoning |
| `deps.mem` | `.memplan/` files only | MemScript v1 (`dep:`) | Agent/skills | Staleness propagation |

---

## Runtime dependency graph (`.memplan/` files)

Defined in `.memplan/deps.mem` (MemScript v1, `dep:` keys are lists).

```
dep:steps.mem=plan.mem|overview.mem
dep:slice.mem=steps.mem|progress
dep:checkpoint.mem=progress|plan.mem
dep:risk.mem=failures.mem|plan.mem
dep:budget.mem=hot.mem
```

Reading: `steps.mem` depends on `plan.mem` and `overview.mem` — if either changes,
`steps.mem` should be reviewed for consistency.

`deps.mem` starts from a fixed template written by `memplan/init` (the predefined file
relationships are part of the plugin's design and do not vary between projects). It then
grows dynamically: whenever a skill creates a new `.mem` file at user request, it appends
the new file's dependencies to `deps.mem` and incrementally updates `deps-closure.mem`
(see section below). The human never edits `deps.mem` directly — it is structural metadata
with no `.plan.md` counterpart.

---

## Creating a new user-requested file

When the user asks for a new `.mem` file to be created (e.g. "track X in a new file"),
the executing skill must:

1. Create the dual files: `X.mem` (empty stub) + `X.plan.md` (with generated-file header); lock `X.plan.md`
2. Determine the dependencies of `X.mem` — which existing files does its content derive from?
   The agent infers this from context (e.g. "a summary of plan.mem and facts.mem" → deps are `plan.mem|facts.mem`)
3. Append to `deps.mem`: `dep:X.mem=source1|source2|…`
4. Incrementally update `deps-closure.mem` via:
   ```bash
   node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" deps-closure-append <dir> X.mem source1|source2|…
   ```
   (see section below — no full recomputation needed)

If no sources can be inferred, append `dep:X.mem=` (empty — no dependencies) as an
explicit acknowledgement, not an omission.

---

## Transitive closure (`deps-closure.mem`)

One-hop propagation misses indirect dependents. Given:

```
dep:steps.mem=plan.mem
dep:slice.mem=steps.mem|progress
```

When `plan.mem` changes, `steps.mem` is marked stale but `slice.mem` is not — even
though `slice.mem` transitively depends on `plan.mem` through `steps.mem`. A second
session is needed before `slice.mem` is flagged, leaving the system inconsistently
stale between sessions.

Fix: at `memplan/init`, compute the **transitive closure** of `deps.mem` and write it
to `deps-closure.mem` (same MemScript format, `dep:` keys are lists). Example output
for the graph above:

```
dep:steps.mem=plan.mem
dep:slice.mem=steps.mem|progress|plan.mem
```

`memplan/act` reads `deps-closure.mem` (not `deps.mem`) when propagating staleness.
A single write now marks all transitive dependents stale in one pass.

`deps-closure.mem` is fully recomputed by `memplan/init` and `memplan/review`.

When a single new file F is added to `deps.mem` (user-requested file creation), the closure
can be updated **incrementally** — no full recomputation needed. The rule is:

```
closure(F) = {F} ∪ closure(d1) ∪ closure(d2) ∪ …   for each direct dep di of F
```

All existing files X already in `deps-closure.mem` are unaffected — adding a new node F
with edges only *from* F to existing nodes cannot change the closure of any existing node.
(Existing nodes do not depend on F yet; if they later do, that is a separate `dep:` append
that triggers the same incremental rule in the other direction.)

This means the agent appends exactly one new line to `deps-closure.mem` per new file, by
reading the existing closure entries for F's direct dependencies and taking their union.
No other lines change.

`memplan-cli.js deps-closure-append` implements this rule: it reads the current
`deps-closure.mem`, expands the direct deps into their existing closures, and writes
only the new line for F.

`deps-closure.mem` has no `.plan.md` counterpart (structural metadata, like `deps.mem`).

---

## Staleness tracking: `stale.mem`

When the agent writes a file, it looks up `deps.mem` for everything that lists that
file as a dependency and appends a staleness entry for each:

```
~2026-05-25T14:30Z +stale:file=steps.mem,because=plan.mem,session=~2026-05-25
```

`stale.mem` is append-only. Entries are cleared (by removing matching lines) when
the stale file has been reviewed and confirmed up to date or updated.

---

## Staleness checks

**`memplan/start`**
After orient, reads `stale.mem`. For each entry, prints a warning line in the summary:
> "⚠ steps.mem may be stale (plan.mem changed on 2026-05-25) — review before acting."

**`memplan/act`**
Before executing a step, checks `stale.mem` for any file the step will read.
If a dependency in the step's scope is stale: halts and prompts the human to resolve
staleness first (via inbox or manual review), then re-run.

**`memplan/review`**
Processes all stale entries, reviews each file against its sources, updates if needed,
clears resolved entries from `stale.mem`.

---

## Plan-file dependency graph (this ideas folder)

For human reference — not enforced by tooling, but the same logic applies.
When a file in this column changes, review the files in "dependents":

| Modified file | Dependents to review |
|---------------|----------------------|
| `overview.plan.md` | `steps.plan.md` (phases → steps) |
| `file-layout.plan.md` | `steps.plan.md` (files to create → steps), `token-budget.plan.md` (file list) |
| `skills.plan.md` | `steps.plan.md` (skills to implement → steps) |
| `mem-language.plan.md` | `skills.plan.md` (read/write instructions), `file-layout.plan.md` (format notes), `steps.plan.md` |
| `feedback-language.plan.md` | `skills.plan.md` (inbox processing), `inbox-protocol.plan.md`, `steps.plan.md` |
| `inbox-protocol.plan.md` | `skills.plan.md` (memplan/inbox), `steps.plan.md` |
| `conventions.plan.md` | `skills.plan.md` (lock/unlock), `file-layout.plan.md`, `steps.plan.md` |
| `token-budget.plan.md` | `steps.plan.md` (budget skill steps) |
| `dependencies.plan.md` | `skills.plan.md` (staleness checks), `file-layout.plan.md` (deps.mem + stale.mem), `steps.plan.md`, `scripting-layer.plan.md` (stale-mark/stale-resolve/deps-closure commands) |

`steps.plan.md` depends on every other file — it should be reviewed last, after all
other files are stable.

---

## Updated file layout additions

Three new files in `.memplan/`:

```
.memplan/
  deps.mem          ← dependency graph (agent-maintained; no .plan.md counterpart)
  deps-closure.mem  ← transitive closure of deps.mem (agent-computed at init; no .plan.md counterpart)
  stale.mem         ← append-only staleness log; cleared by memplan/review
```

---

## Steps to implement (additions to steps.plan.md)

- Define `deps.mem` format and initial content as part of plugin initialisation
- Add staleness append logic to `memplan/act` after every file write
- Add staleness warning to `memplan/start` orient summary
- Add staleness pre-flight to `memplan/act` before executing any step
- Add staleness resolution to `memplan/review`
